import { writable, type Readable, type Writable } from 'svelte/store';
import { createNewTwitchClientV2 } from './twitch';
import { cancelSpeech, getVoicesList, selectVoiceByName, speak } from './speech';
import type { FullConfig, ObsSettings } from './config';
import OBSWebSocket from 'obs-websocket-js';
import { COMMANDS, LEADER, type Command } from './commands';
import { Synth } from 'beepbox';
import axios from 'axios';
import { isRemoteTTSMessage } from './remoteTTSMessages';
import type { ChatClient, ChatMessage, ChatUser } from '@twurple/chat';

const shortnameMatcher = /<(.*)>/g;

function sleep(duration: number): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return new Promise((resolve, _) => {
    setTimeout(() => {
      resolve();
    }, duration);
  });
}

interface NewVoiceSettings {
  voice_name: string;
  rate: number;
  pitch: number;
}

type NewVoiceSettingsWithSynthesis = NewVoiceSettings & {
  voice: SpeechSynthesisVoice;
}

interface VoiceSettings {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

class RemoteChatTTSController {
  private socket: WebSocket;
  private parentController: Controller;

  constructor(controller: Controller, busUrl: string) {
    this.socket = new WebSocket(busUrl);
    this.socket.onopen = () => {
      console.log('connected to chat tts controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from chat tts controller');
    };

    this.socket.onmessage = (ev) => this.onMessage(ev.data);

    this.parentController = controller;
  }

  onMessage(message: string) {
    const data = JSON.parse(message);
    if (!isRemoteTTSMessage(data)) return;

    switch (data.command.type) {
      case 'cancel':
        this.parentController.cancel();
        break;
      case 'disable':
        this.parentController.setEnabled(false);
        setTimeout(() => {
          this.parentController.setEnabled(true);
        }, data.command.duration * 1000);
        break;
      default:
        console.error(`Forgot to implement ${data.command} in Remote TTS Controller`);
        break;
    }
  }
}

class TrinketController {
  private socket: WebSocket;
  private disabled: boolean = false;

  constructor(enabled: boolean, senderUrl: string) {
    this.socket = new WebSocket(senderUrl);
    this.socket.onopen = () => {
      console.log('connected to remote distract controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from remote distract controller');
    };

    this.disabled = !enabled;
  }


  get enabled() {
    return !this.disabled;
  }

  enable(invert: boolean = false) {
    this.disabled = invert;
  }

  async sendDistract(): Promise<void> {
    if (this.disabled) {
      console.log('Trinkets are disabled');
      return;
    }

    this.socket.send(
      JSON.stringify({ type: 'trinket', command: { type: 'distract', annoyance: Math.random() } })
    );
  }

  async sendRotate(): Promise<void> {
    if (this.disabled) {
      console.log('Trinkets are disabled');
      return;
    }

    this.socket.send(
      JSON.stringify({
        type: 'trinket',
        command: {
          type: 'rotate',
          speed: (Math.random() > 0.5 ? -1 : 1) * 10 ** (Math.random() * 3)
        }
      })
    );
  }

  async cancel(): Promise<void> {
    this.socket.send(JSON.stringify({ type: 'trinket', command: { type: 'cancel' } }));
  }
}

interface SongController {
  playSong(songname: string): Promise<boolean>;
  changeSpeed(speed: number): Promise<void>;
  cancelSong(): void;
}

class RemoteSongController implements SongController {
  private socket: WebSocket;

  constructor(senderUrl: string) {
    this.socket = new WebSocket(senderUrl);
    this.socket.onopen = () => {
      console.log('connected to remote song controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from remote song controller');
    };
  }

  async playSong(songname: string): Promise<boolean> {
    this.socket.send(JSON.stringify({ type: 'play', songname: songname }));
    return true;
  }

  async changeSpeed(speed: number): Promise<void> {
    this.socket.send(JSON.stringify({ type: 'speed', speed: speed }));
  }

  cancelSong(): void {
    this.socket.send(JSON.stringify({ type: 'cancel' }));
  }
}

export class LocalSongController implements SongController {
  private songsPlaying: string[] = [];
  private masterSynth?: Synth;
  private expectedTempo?: number;

  async getSongs(): Promise<string[]> {
    const response = await fetch('/songs');
    if (response.status !== 200) {
      throw new Error('cannot fetch from songs endpoint');
    }

    return await response.json();
  }

  async getSong(songname: string): Promise<string> {
    const response = await fetch(`/song?songname=${songname}`);
    if (response.status !== 200) {
      throw new Error('cannot fetch from songs endpoint');
    }

    return (await response.json())['base64'];
  }

  async changeSpeed(speed: number) {
    if (this.masterSynth) {
      console.log(`song speed speed changed to: ${speed}`);
      this.masterSynth.song!.tempo = (this.expectedTempo ?? 150) * speed;
    }
  }

  cancelSong() {
    if (this.masterSynth) {
      this.masterSynth.pause();
    }
  }

  async playSong(songname: string): Promise<boolean> {
    // NOTE: legacy code. If I ever switch back to allowing multiple songs
    // at once, at least this'll still be there
    if (this.songsPlaying.includes(songname)) {
      return false;
    }

    try {
      if ((await this.getSongs()).includes(songname)) {
        if (this.masterSynth) {
          this.masterSynth.pause();
        }

        const song = await this.getSong(songname);
        const synth = new Synth(song);
        this.masterSynth = synth;
        console.log('synthcheck', this.masterSynth);
        this.expectedTempo = synth.song!.tempo;
        synth.song!.loopLength = 0;
        synth.loopRepeatCount = 0;

        const oldPause = synth.pause.bind(synth);
        this.songsPlaying.push(songname);

        synth.pause = () => {
          this.songsPlaying = this.songsPlaying.filter((song) => song !== songname);
          this.masterSynth = undefined;
          oldPause();
        };
        synth.volume = 0.6;
        synth.play();
        return true;
      }
    } catch (e) {
      console.error('Problem with playing beepbox song: ', e);
      return false;
    }
    return false;
  }
}

class CommandController {
  getCommand(msg: string): Command | null {
    for (const key of COMMANDS.keys()) {
      if (msg.toLowerCase() === LEADER + key) {
        return COMMANDS.get(key)!;
      }
    }

    return null;
  }
}

class ObsController {
  obs: OBSWebSocket;
  settings: ObsSettings;
  connected: Writable<boolean>;
  _connected: boolean;
  private rotating: boolean;

  cancellations: Array<ReturnType<typeof setTimeout>> = [];

  constructor(settings: ObsSettings) {
    this.obs = new OBSWebSocket();
    this.settings = settings;
    this.connected = writable(false);
    this._connected = false;
    this.rotating = false;
  }

  private setConnected(val: boolean) {
    this.connected.set(val);
    this._connected = val;
  }

  stringToColour(str: string): number {
    let hash = 0;
    str.split('').forEach((char) => {
      hash = char.charCodeAt(0) + ((hash << 5) - hash);
    });
    let color = 'FF';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += value.toString(16).padStart(2, '0');
    }
    return Number('0x' + color);
  }

  async connect() {
    await this.obs.connect(this.settings.obsURL, this.settings.password);
    this.obs.addListener('ConnectionClosed', () => {
      this.setConnected(false);
      console.log('Connection closed, retrying...');

      const timeoutHandle = setTimeout(async () => {
        await this.connect();
        this.cancellations = this.cancellations.filter((val) => val !== timeoutHandle);
      }, 5000);

      this.cancellations.push(timeoutHandle);
    });

    console.log('Connected from WS successfully');
    this.setConnected(true);
  }

  async disconnect() {
    await this.obs.disconnect();
    console.log('Disconnected from WS successfully');
    this.setConnected(false);
  }

  async updateSceneWith(user: ChatUser, voice: NewVoiceSettings) {
    const color = this.stringToColour(voice.voice_name);
    await this.obs.call('SetInputSettings', {
      inputName: this.settings.sourceName,
      inputSettings: {
        text: `${user.userName}`,
        color1: color,
        color2: color
      }
    });
  }

  async rotateSourcesRandomly(sourceNames: string[]) {
    if (this.rotating) {
      return;
    }
    this.rotating = true;

    const sceneItemMappings = [];
    const { sceneName } = await this.obs.call('GetCurrentProgramScene');
    for (const sourceName of sourceNames) {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', {
        sceneName,
        sourceName
      });

      if (sceneItemId === undefined) {
        throw new Error('scene item id is undefined');
      }

      const { sceneItemTransform } = await this.obs.call('GetSceneItemTransform', {
        sceneName,
        sceneItemId
      });
      const { rotation } = sceneItemTransform;

      if (rotation === undefined || rotation == null) {
        // rotation is potentially 0, so we can't do !rotation
        throw new Error('rotation is undefined');
      }

      const array = new Uint32Array(1);
      self.crypto.getRandomValues(array);

      const numRotation = Number(rotation);
      sceneItemMappings.push({
        itemId: sceneItemId,
        rotation: numRotation,
        speed: (array[0] / 4294967295) * 2.0 - 1.0
      });
    }

    const promises = sceneItemMappings.map(async (mapping) => {
      for (let i = 0; i <= 360; i++) {
        let newAngle = 0;

        if (mapping['speed'] < 0) {
          newAngle = (mapping['rotation'] - i + 360) % 360;
        } else {
          newAngle = (mapping['rotation'] + i) % 360;
        }

        await this.obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: mapping['itemId'],
          sceneItemTransform: {
            rotation: newAngle
          }
        });
        await sleep(1 * (1 / Math.abs(mapping['speed'])));
      }
    });

    await Promise.all(promises);

    this.rotating = false;
  }

  async resetSourceRotation(sourceName: string) {
    const { sceneName } = await this.obs.call('GetCurrentProgramScene');

    const { sceneItemId } = await this.obs.call('GetSceneItemId', {
      sceneName,
      sourceName
    });

    if (sceneItemId === undefined) {
      throw new Error('scene item id is undefined');
    }

    await this.obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId: sceneItemId,
      sceneItemTransform: {
        rotation: 0,
        scaleX: 1.0,
        scaleY: 1.0
      }
    });
  }
}

interface VoiceController {
  processMessage(
    message: ChatMessage,
    onSpeedChange: (arg0: number) => void,
    onSpeechStart: () => void
  ): Promise<void>;
  getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettings>;
  refreshUser(user: ChatUser): void;
  cancel(): void;
}

class RemoteVoiceController implements VoiceController {
  private baseurl: string;

  constructor(config: FullConfig) {
    this.baseurl = config.remoteVoiceConfig?.controlURL ?? 'http://localhost:3123';
    this.sendInitializationMessage(config);
  }

  async sendInitializationMessage(config: FullConfig): Promise<void> {
    await axios.post(`${this.baseurl}/init`, {
      pitch_rate_config: {
        pitch_range_low: config.pitchRange.minimum,
        pitch_range_high: config.pitchRange.maximum,
        rate_range_low: config.rateRange.minimum,
        rate_range_high: config.rateRange.maximum,
      },
      sound_effects: [
        ...config.soundEffects.map(effect => ({
          tag: effect.tag,
          filename: effect.filePath,
        }))
      ],
    });
  }

  async processMessage(
    message: ChatMessage,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _onSpeedChange: (arg0: number) => void,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _onSpeechStart: () => void
  ): Promise<void> {
    await axios.get(`${this.baseurl}/processMessage`, {
      params: {
        'username': message.userInfo.userName ?? '',
        'message': message,
      }
    });
  }

  async getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettings> {
    const result = await axios.get(`${this.baseurl}/getVoiceMapForUser`, {
      params: {
        username: user.userName
      }
    });
    return result.data as NewVoiceSettings;
  }

  refreshUser(user: ChatUser): void {
    axios.get(`${this.baseurl}/refreshUser`, {
      params: {
        username: user.userName
      }
    });
  }

  cancel(): void {
    axios.get(`${this.baseurl}/cancel`);
  }
}

class LocalVoiceController implements VoiceController {
  usernameVoiceMap: Map<string, VoiceSettings> = new Map();
  config: FullConfig;

  constructor(config: FullConfig) {
    this.config = config;
    this.validateVoices();
  }

  validateVoices() {
    this.config.voices.forEach((name) => {
      if (!selectVoiceByName(name)) {
        console.error(`${name} is invalid. May cause issues.`);
      }
    });
  }

  refreshUser(user: ChatUser) {
    if (!user.userName) {
      return undefined;
    }

    const voice = this.chooseRandomVoice();
    this.usernameVoiceMap.set(user.userName ?? '', {
      voice: voice,
      pitch: this.chooseRandomPitch(),
      rate: this.chooseRandomRate()
    });
  }

  chooseRandomVoice(): SpeechSynthesisVoice {
    const voicename = this.config.voices[Math.floor(Math.random() * this.config.voices.length)];
    return selectVoiceByName(voicename)!; // validated by validateVoices()
  }

  chooseRandomPitch(): number {
    const max = this.config.pitchRange.maximum;
    const min = this.config.pitchRange.minimum;
    return Math.random() * (max - min) + min;
  }

  chooseRandomRate(): number {
    const max = this.config.rateRange.maximum;
    const min = this.config.rateRange.minimum;
    return Math.random() * (max - min) + min;
  }

  cancel() {
    cancelSpeech();
  }

  async getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettingsWithSynthesis> {
    if (!user.userName) throw new Error('no username in chat state');

    const username = user.userName;

    if (!this.usernameVoiceMap.has(username)) {
      this.refreshUser(user);
    }

    const voiceSettings = this.usernameVoiceMap.get(username)!;
    return {
      pitch: voiceSettings.pitch,
      rate: voiceSettings.rate,
      voice_name: voiceSettings.voice.name,
      voice: voiceSettings.voice
    };
  }

  dumpVoiceMap(): Map<string, VoiceSettings> {
    return this.usernameVoiceMap;
  }

  loadVoiceMap(map: Map<string, VoiceSettings>) {
    this.usernameVoiceMap = map;
  }

  async processMessage(
    message: ChatMessage,
    onSpeedChange: (arg0: number) => void,
    onSpeechStart: () => void
  ) {
    const voiceSettings = await this.getVoiceMapForUser(message.userInfo);
    await speak(
      {
        pitch: voiceSettings.pitch,
        rate: voiceSettings.rate,
        text: message.text,
        voice: voiceSettings.voice,
        speakConfiguration: {
          possibleSoundEffects: this.config.soundEffects,
          alternativePitchControl: this.config.alternativePitchControl
        }
      },
      onSpeedChange,
      onSpeechStart
    );
  }
}

/**
 * The controller. Luckily for us there is only one such controller
 * so surely I don't have to name this something else :clueless:
 */
export class Controller {
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
    this.chat_logs = writable([]);
    this.twitch = createNewTwitchClientV2(config.channelName);
    this.voice = config.remoteVoiceConfig ? new RemoteVoiceController(config) : new LocalVoiceController(config);
    this.commands = new CommandController();
    if (config.obsSettings) {
      this.obsController = new ObsController(config.obsSettings);
    }
    this.filters = config.filteredExps;
    this.songController = config.standaloneSongConfig
      ? new RemoteSongController(config.standaloneSongConfig.wsUrl)
      : new LocalSongController();

    this.trinketController =
      config.distractConfig != null
        ? new TrinketController(config.distractConfig?.enabled, config.distractConfig?.wsUrl)
        : undefined;
    this.remoteChatTTSController = config.remoteChatTTS ? new RemoteChatTTSController(this, config.remoteChatTTS.busURL) : undefined;
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
    const filtered = ((!message.userInfo.isMod && !message.userInfo.isVip) ? this.isFiltered(message.text) : false) || this.mustIgnore(this.config.ignorePrefix, message.text);
    this.updateChatLog(
      `${message.userInfo.userName} (${voice.voice_name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message.text}`
    );

    const potentialCommand = this.commands.getCommand(message.text);
    if (potentialCommand && !this.config.commandsDisabled) {
      potentialCommand.processCommandMessage(this, message);
      return;
    }

    if (filtered || !this.enabled) {
      return;
    }

    // hard command filter
    if (message.text.startsWith('%')) {
      return;
    }

    // random chance to rotate the screen
    if (Math.random() < (this.config.distractConfig?.rotateChance ?? 0) && this.obsController && this.trinketController) {
      await this.obsController.rotateSourcesRandomly(this.config.obsSettings?.rotationNames ?? []);
    }

    if (Math.random() < (this.config.distractConfig?.distractChance ?? 0) && this.trinketController) {
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

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.twitch.onMessage(async (_channel, _user, _text, msg) => {
      await this.updateWithMessage(msg);
    })

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

  getVoicesList(): SpeechSynthesisVoice[] {
    return getVoicesList();
  }
}
