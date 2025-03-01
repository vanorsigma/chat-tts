import { writable, type Readable, type Writable } from 'svelte/store';
import tmi from 'tmi.js';
import { createNewTwitchClient } from './twitch';
import { cancelSpeech, getVoicesList, selectVoiceByName, speak } from './speech';
import type { FullConfig, ObsSettings } from './config';
import OBSWebSocket from 'obs-websocket-js';
import { COMMANDS, LEADER, type Command } from './commands';
import { Synth } from 'beepbox';

const shortnameMatcher = /<(\w+)>/g;

interface VoiceSettings {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
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

  cancellations: Array<ReturnType<typeof setTimeout>> = [];

  constructor(settings: ObsSettings) {
    this.obs = new OBSWebSocket();
    this.settings = settings;
    this.connected = writable(false);
    this._connected = false;
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

  async updateSceneWith(user: tmi.ChatUserstate, voice: VoiceSettings) {
    const color = this.stringToColour(voice.voice.name);
    await this.obs.call('SetInputSettings', {
      inputName: this.settings.sourceName,
      inputSettings: {
        text: `${user.username}`,
        color1: color,
        color2: color
      }
    });
  }

  async rotateMainMonitorSceneBy(angle: number) {
    const { sceneName } = await this.obs.call('GetCurrentProgramScene');

    const { sceneItemId } = await this.obs.call('GetSceneItemId', {
      sceneName,
      sourceName: this.settings.mainMonitorName
    });

    if (sceneItemId === undefined) {
      throw new Error('scene item id is undefined');
    }

    const { sceneItemTransform } = await this.obs.call('GetSceneItemTransform', {
      sceneName,
      sceneItemId: sceneItemId
    });
    const { rotation } = sceneItemTransform;

    if (rotation === undefined || rotation == null) { // rotation is potentially 0, so we can't do !rotation
      throw new Error('rotation is undefined');
    }

    await this.obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId: sceneItemId,
      sceneItemTransform: {
        rotation: Number(rotation) + angle
      },
    });
  }
}

class VoiceController {
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

  refreshUser(user: tmi.ChatUserstate): SpeechSynthesisVoice | undefined {
    if (!user.username) {
      return undefined;
    }

    const voice = this.chooseRandomVoice();
    this.usernameVoiceMap.set(user.username ?? '', {
      voice: voice,
      pitch: this.chooseRandomPitch(),
      rate: this.chooseRandomRate()
    });
    return voice;
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

  getVoiceMapForUser(user: tmi.ChatUserstate): VoiceSettings {
    if (!user.username) throw new Error('no username in chat state');

    const username = user.username;

    if (!this.usernameVoiceMap.has(username)) {
      this.refreshUser(user);
    }

    const voiceSettings = this.usernameVoiceMap.get(username)!;
    return voiceSettings;
  }

  dumpVoiceMap(): Map<string, VoiceSettings> {
    return this.usernameVoiceMap;
  }

  loadVoiceMap(map: Map<string, VoiceSettings>) {
    this.usernameVoiceMap = map;
  }

  async processMessage(
    user: tmi.ChatUserstate,
    message: string,
    onSpeedChange: (arg0: number) => void,
    onSpeechStart: () => void
  ) {
    const voiceSettings = this.getVoiceMapForUser(user);
    await speak(
      {
        pitch: voiceSettings.pitch,
        rate: voiceSettings.rate,
        text: message,
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
  twitch: tmi.Client;
  voice: VoiceController;
  commands: CommandController;
  obsController?: ObsController;
  songController: SongController;
  config: FullConfig;
  filters: string[];

  constructor(config: FullConfig) {
    this.chat_logs = writable([]);
    this.twitch = createNewTwitchClient(config.channelName);
    this.voice = new VoiceController(config);
    this.commands = new CommandController();
    if (config.obsSettings) {
      this.obsController = new ObsController(config.obsSettings);
    }
    this.filters = config.filteredExps;
    this.songController = config.standaloneSongConfig
      ? new RemoteSongController(config.standaloneSongConfig.wsUrl)
      : new LocalSongController();
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

  async updateWithMessage(user: tmi.ChatUserstate, message: string) {
    this._matchAndPlaySong(message);

    const voice = this.voice.getVoiceMapForUser(user);
    const filtered = this.isFiltered(message);
    this.updateChatLog(
      `${user.username} (${voice.voice.name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message}`
    );

    if (filtered) {
      return;
    }

    const potentialCommand = this.commands.getCommand(message);
    if (potentialCommand) {
      potentialCommand.processCommandMessage(this, user, message);
      return;
    }

    await this.voice.processMessage(
      user,
      message,
      async (speed) => {
        if (this.config.dynamicConfig.songPitchSpeedAffected) {
          await this.songController.changeSpeed(speed);
        }
      },
      async () => {
        await this.obsController?.updateSceneWith(user, voice);
      }
    );
  }

  async start() {
    this.twitch.on('connected', () => {
      console.log('connected.');
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.twitch.on('message', async (_x, user, message, _y) => {
      await this.updateWithMessage(user, message);
    });
    await this.obsController?.connect();
    await this.twitch.connect();
  }

  async cancel() {
    this.voice.cancel();
    this.songController.cancelSong();
  }

  async end() {
    await this.twitch.disconnect();
    await this.cancel();
  }

  getChatLogsStore(): Readable<string[]> {
    return this.chat_logs;
  }

  getVoicesList(): SpeechSynthesisVoice[] {
    return getVoicesList();
  }
}
