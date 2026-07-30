import { createNewTwitchClientV2 } from '../twitch';
import type { FullConfig } from '../config';
import type { ChatClient, ChatMessage } from '@twurple/chat';
import type WebSocket from 'ws';
import { CommandController } from './command';
import type { SongController } from './song';
import { RemoteSongController } from './song';
import { TrinketController } from './trinket';
import { RemoteChatTTSController, type ChatTTSOrchestrator } from './remoteChatTTS';
import { RemoteVoiceController, type VoiceController } from './voice';
import { RefreshVoice, Unimportant } from '../commands';
import { shouldSkipMessage } from '$lib/messageGuard';

const shortnameMatcher = /<(.*)>/g;

export { TrinketController };

export class Controller implements ChatTTSOrchestrator {
  twitch: ChatClient;
  voice?: VoiceController;
  commands: CommandController;
  songController?: SongController;
  trinketController?: TrinketController;
  remoteChatTTSController?: RemoteChatTTSController;

  config: FullConfig;
  filters: string[];

  private ttsEnabled: boolean = true;
  private delegateVoice: boolean;
  private importantBlocked: boolean = false;
  private _broadcastImportant: ((active: boolean) => void) | null = null;

  get enabled() {
    return this.ttsEnabled;
  }

  setEnabled(enable: boolean) {
    this.ttsEnabled = enable;
  }

  setImportantBlocked(b: boolean) {
    this.importantBlocked = b;
  }

  setBroadcastImportant(fn: (active: boolean) => void) {
    this._broadcastImportant = fn;
  }

  broadcastImportant(active: boolean) {
    this._broadcastImportant?.(active);
  }

  constructor(config: FullConfig, senderWs: WebSocket) {
    console.log(`Creating controller for channel ${config.channelName}...`);
    this.twitch = createNewTwitchClientV2(config.channelName);
    if (config.remoteVoiceConfig) {
      console.log('Initializing voice controller...');
      this.voice = new RemoteVoiceController(config);
    } else console.error('No voice controller configuration. Will ignore');
    this.commands = new CommandController();
    this.filters = config.filteredExps;
    if (config.standaloneSongConfig) {
      console.log('Initializing song controller...');
      this.songController = new RemoteSongController(senderWs);
    } else console.error('No song controller configuration. Will ignore');

    this.trinketController =
      config.distractConfig != null
        ? new TrinketController(config.distractConfig?.enabled, senderWs)
        : undefined;
    this.remoteChatTTSController = config.remoteChatTTS
      ? new RemoteChatTTSController(this)
      : undefined;
    this.delegateVoice = !!config.delegateVoiceToOverlay;
    this.config = config;
    console.log('Controller created.');
  }

  private isFiltered(message: string): boolean {
    for (const filter of this.filters) {
      const regex = new RegExp(filter);
      if (message.match(regex)?.[0]) {
        return true;
      }
    }
    return false;
  }

  private async _matchAndPlaySong(message: string) {
    const matches = [...message.matchAll(shortnameMatcher)];
    if (matches && matches[0] && matches[0].length > 0) {
      const songname = matches[0].at(1);
      this.songController?.playSong(songname!);
    }
  }

  async updateWithMessage(message: ChatMessage) {
    try {
      this._matchAndPlaySong(message.text);

      const voice = this.voice ? await this.voice.getVoiceMapForUser(message.userInfo) : null;
      const filtered =
        !message.userInfo.isMod && !message.userInfo.isVip ? this.isFiltered(message.text) : false;
      if (voice) {
        console.log(
          `${message.userInfo.userName} (${voice.voice_name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message.text}`
        );
      }

      const potentialCommand = this.commands.getCommand(message.text);
      if (potentialCommand && this.importantBlocked && !(potentialCommand instanceof Unimportant)) {
        console.log(`Important mode active — dropping Captain command: ${message.text}`);
        return;
      }
      if (
        potentialCommand &&
        (!this.config.commandsDisabled || potentialCommand instanceof RefreshVoice)
      ) {
        potentialCommand.processCommandMessage(this, message);
        return;
      }

      if (this.delegateVoice) return;

      if (
        shouldSkipMessage({
          text: message.text,
          userName: message.userInfo.userName,
          isBot: message.userInfo.badges.has('bot-badge'),
          ignorePrefix: this.config.ignorePrefix
        })
      )
        return;

      if (filtered || !this.enabled) {
        return;
      }

      if (
        Math.random() < (this.config.distractConfig?.distractChance ?? 0) &&
        this.trinketController
      ) {
        await this.trinketController.sendDistract();
      }

      if (this.voice && voice) {
        await this.voice.processMessage(
          message,
          async (speed) => {
            if (this.config.dynamicConfig.songPitchSpeedAffected) {
              await this.songController?.changeSpeed(speed);
            }
          },
          async () => {}
        );
      }
    } catch (err) {
      console.error(`updateWithMessage failed: ${err}`);
    }
  }

  async speak(username: string, text: string, isMod: boolean, isVip: boolean) {
    if (!this.voice || !this.enabled) return;
    if (!isMod && !isVip && this.isFiltered(text)) return;
    await this.voice.speak(username, text);
  }

  async start() {
    console.log('Starting Twitch client...');
    this.twitch.onConnect(() => {
      console.log('connected.');
    });

    this.twitch.onMessage(async (_channel, _user, _text, msg) => {
      await this.updateWithMessage(msg).catch((err) =>
        console.error(`onMessage handler failed: ${err}`)
      );
    });

    this.twitch.connect();
    console.log('Controller started.');
  }

  async cancel() {
    console.log('Cancel requested.');
    this.voice?.cancel();
    this.songController?.cancelSong();
    this.trinketController?.cancel();
  }

  async end() {
    console.log('Controller ending...');
    this.twitch.quit();
    await this.cancel();
    console.log('Controller ended.');
  }
}
