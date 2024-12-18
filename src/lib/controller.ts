import { writable, type Readable, type Writable } from 'svelte/store';
import tmi from "tmi.js";
import { createNewTwitchClient } from './twitch';
import { cancelSpeech, getVoicesList, selectVoiceByName, speak } from './speech';
import type { FullConfig, ObsSettings } from './config';
import OBSWebSocket from 'obs-websocket-js';
import { COMMANDS, LEADER, type Command } from './commands';

interface VoiceSettings {
  voice: SpeechSynthesisVoice,
  pitch: number,
  rate: number
}

class CommandController {
  getCommand(msg: string): Command | null {
    for (const key of COMMANDS.keys()) {
      if (msg === LEADER + key) {
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
    str.split('').forEach(char => {
      hash = char.charCodeAt(0) + ((hash << 5) - hash)
    })
    let color = 'FF'
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
        this.cancellations = this.cancellations.filter(val => val !== timeoutHandle);
      }, 5000);

      this.cancellations.push(timeoutHandle);
    })

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
      inputName: this.settings.sourceName, inputSettings: {
        "text": `${user.username}`,
        "color1": color,
        "color2": color,
      }
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
    this.config.voices.forEach(name => {
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
      rate: this.chooseRandomRate(),
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
    return (Math.random() * (max - min)) + min;
  }

  chooseRandomRate(): number {
    const max = this.config.rateRange.maximum;
    const min = this.config.rateRange.minimum;
    return (Math.random() * (max - min)) + min;
  }

  cancel() {
    cancelSpeech();
  }

  getVoiceMapForUser(user: tmi.ChatUserstate): VoiceSettings {
    if (!user.username) throw new Error("no username in chat state");

    const username = user.username;

    if (!this.usernameVoiceMap.has(username)) {
      this.refreshUser(user);
    }

    const voiceSettings = this.usernameVoiceMap.get(username)!;
    return voiceSettings;
  }

  async processMessage(user: tmi.ChatUserstate, message: string, onSpeechStart: () => void) {
    const voiceSettings = this.getVoiceMapForUser(user);
    await speak({
      pitch: voiceSettings.pitch,
      rate: voiceSettings.rate,
      text: message,
      voice: voiceSettings.voice,
      speakConfiguration: {
        possibleSoundEffects: this.config.soundEffects,
        alternativePitchControl: this.config.alternativePitchControl,
      },
    }, onSpeechStart);
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
    this.chat_logs.update(val => {
      return [...val, entry];
    });
  }

  private async updateWithMessage(user: tmi.ChatUserstate, message: string) {
    const voice = this.voice.getVoiceMapForUser(user);
    const filtered = this.isFiltered(message);
    this.updateChatLog(`${user.username} (${voice.voice.name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message}`);

    if (filtered) {
      return;
    }

    const potentialCommand = this.commands.getCommand(message);
    if (potentialCommand) {
      potentialCommand.processCommandMessage(this, user, message);
      return;
    }

    await this.voice.processMessage(user, message, async () => {
      await this.obsController?.updateSceneWith(user, voice);
    });
  }

  async start() {
    this.twitch.on('connected', () => {
      console.log('connected.')
    });

    this.twitch.on('message', async (_x, user, message, _y) => {
      await this.updateWithMessage(user, message);
    });
    await this.obsController?.connect();
    await this.twitch.connect();
  }

  async cancel() {
    this.voice.cancel();
  }

  async end() {
    await this.twitch.disconnect();
  }

  getChatLogsStore(): Readable<string[]> {
    return this.chat_logs;
  }

  getVoicesList(): SpeechSynthesisVoice[] {
    return getVoicesList();
  }
}
