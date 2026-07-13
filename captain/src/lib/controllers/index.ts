import { writable, type Readable, type Writable } from 'svelte/store';
import { createNewTwitchClientV2 } from '../twitch';
import type { FullConfig } from '../config';
import type { ChatClient, ChatMessage } from '@twurple/chat';
import { CommandController } from './command';
import type { SongController } from './song';
import { RemoteSongController } from './song';
import { TrinketController } from './trinket';
import { RemoteChatTTSController, type ChatTTSOrchestrator } from './remoteChatTTS';
import { RemoteVoiceController, type VoiceController } from './voice';
import { ObsController } from './obs';
import { RefreshVoice } from '../commands';

const shortnameMatcher = /<(.*)>/g;

export { TrinketController, ObsController };

export class Controller implements ChatTTSOrchestrator {
  chat_logs: Writable<string[]>;
  twitch: ChatClient;
  voice: VoiceController;
  commands: CommandController;
  obsController?: ObsController;
  songController: SongController;
  trinketController?: TrinketController;
  remoteChatTTSController?: RemoteChatTTSController;

  config: FullConfig;
  filters: string[];

  private ttsEnabled: boolean = true;

  get enabled() {
    return this.ttsEnabled;
  }

  setEnabled(enable: boolean) {
    this.ttsEnabled = enable;
  }

  constructor(config: FullConfig) {
    if (!config.remoteVoiceConfig) {
      throw new Error('remoteVoiceConfig is required when running on the backend');
    }
    if (!config.standaloneSongConfig) {
      throw new Error('standaloneSongConfig is required when running on the backend');
    }

    this.chat_logs = writable([]);
    this.twitch = createNewTwitchClientV2(config.channelName);
    this.voice = new RemoteVoiceController(config);
    this.commands = new CommandController();
    if (config.obsSettings) {
      this.obsController = new ObsController(config.obsSettings);
    }
    this.filters = config.filteredExps;
    this.songController = new RemoteSongController(config.standaloneSongConfig.wsUrl);

    this.trinketController =
      config.distractConfig != null
        ? new TrinketController(config.distractConfig?.enabled, config.distractConfig?.wsUrl)
        : undefined;
    this.remoteChatTTSController = config.remoteChatTTS
      ? new RemoteChatTTSController(this, config.remoteChatTTS.busURL)
      : undefined;
    this.config = config;
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

  private mustIgnore(ignore_prefix: string, message: string): boolean {
    return message.trim().startsWith(ignore_prefix);
  }

  updateChatLog(entry: string) {
    this.chat_logs.update((val) => {
      return [...val, entry];
    });
  }

  private async _matchAndPlaySong(message: string) {
    const matches = [...message.matchAll(shortnameMatcher)];
    if (matches && matches[0] && matches[0].length > 0) {
      const songname = matches[0].at(1);
      this.songController.playSong(songname!);
    }
  }

  async updateWithMessage(message: ChatMessage) {
    this._matchAndPlaySong(message.text);

    const voice = await this.voice.getVoiceMapForUser(message.userInfo);
    const filtered =
      (!message.userInfo.isMod && !message.userInfo.isVip
        ? this.isFiltered(message.text)
        : false) || this.mustIgnore(this.config.ignorePrefix, message.text);
    this.updateChatLog(
      `${message.userInfo.userName} (${voice.voice_name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message.text}`
    );

    const potentialCommand = this.commands.getCommand(message.text);
    if (
      potentialCommand &&
      (!this.config.commandsDisabled || potentialCommand instanceof RefreshVoice)
    ) {
      potentialCommand.processCommandMessage(this, message);
      return;
    }

    if (filtered || !this.enabled) {
      return;
    }

    if (message.text.startsWith('%')) {
      return;
    }

    if (message.userInfo.userId === '1374180546') {
      return;
    }

    if (
      Math.random() < (this.config.distractConfig?.rotateChance ?? 0) &&
      this.obsController &&
      this.trinketController
    ) {
      await this.obsController.rotateSourcesRandomly(this.config.obsSettings?.rotationNames ?? []);
    }

    if (
      Math.random() < (this.config.distractConfig?.distractChance ?? 0) &&
      this.trinketController
    ) {
      await this.trinketController.sendDistract();
    }

    await this.voice.processMessage(
      message,
      async (speed) => {
        if (this.config.dynamicConfig.songPitchSpeedAffected) {
          await this.songController.changeSpeed(speed);
        }
      },
      async () => {
        await this.obsController?.updateSceneWith(message.userInfo, voice);
      }
    );
  }

  async start() {
    this.twitch.onConnect(() => {
      console.log('connected.');
    });

    this.twitch.onMessage(async (_channel, _user, _text, msg) => {
      await this.updateWithMessage(msg);
    });

    await this.obsController?.connect();
    this.twitch.connect();
  }

  async cancel() {
    this.voice.cancel();
    this.songController.cancelSong();
    this.trinketController?.cancel();
    this.config.obsSettings?.rotationNames.forEach((source) => {
      this.obsController?.resetSourceRotation(source);
    });
  }

  async end() {
    this.twitch.quit();
    await this.cancel();
  }

  getChatLogsStore(): Readable<string[]> {
    return this.chat_logs;
  }
}
