import { writable, type Readable, type Writable } from 'svelte/store';
import tmi from "tmi.js";
import { createNewTwitchClient } from './twitch';
import { getVoicesList, selectVoiceByName, speak } from './speech';
import type { FullConfig, ObsSettings } from './config';
import OBSWebSocket from 'obs-websocket-js';

interface VoiceSettings {
  voice: SpeechSynthesisVoice,
  pitch: number,
  rate: number
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

  async updateSceneWith(user: tmi.ChatUserstate, _voice: VoiceSettings) {
    await this.obs.call('SetInputSettings', {
      inputName: this.settings.sourceName, inputSettings: {
        "text": `${user.username}`,
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

  chooseRandomVoice(): SpeechSynthesisVoice {
    const voicename = this.config.voices[Math.floor(Math.random() * this.config.voices.length)];
    return selectVoiceByName(voicename)!!; // validated by validateVoices()
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

  getVoiceMapForUser(user: tmi.ChatUserstate): VoiceSettings {
    if (!user.username) throw new Error("no username in chat state");

    const username = user.username;

    if (!this.usernameVoiceMap.has(username)) {
      const voice = this.chooseRandomVoice();
      this.usernameVoiceMap.set(username, {
        voice: voice,
        pitch: this.chooseRandomPitch(),
        rate: this.chooseRandomRate(),
      });
    }

    const voiceSettings = this.usernameVoiceMap.get(username)!!;
    return voiceSettings;
  }

  async processMessage(user: tmi.ChatUserstate, message: string) {
    const voiceSettings = this.getVoiceMapForUser(user);
    await speak({
      pitch: voiceSettings.pitch,
      rate: voiceSettings.rate,
      text: message,
      voice: voiceSettings.voice
    });
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
  obsController?: ObsController;
  filters: string[];

  constructor(config: FullConfig) {
    this.chat_logs = writable([]);
    this.twitch = createNewTwitchClient(config.channelName);
    this.voice = new VoiceController(config);
    if (config.obsSettings) {
      this.obsController = new ObsController(config.obsSettings);
    }
    this.filters = config.filteredExps;
  }

  private isFiltered(message: string): boolean {
    for (let filter of this.filters) {
      const regex = new RegExp(filter);
      if (message.match(regex)?.[0]) {
        return true;
      }
    }
    return false;
  }

  private async updateWithMessage(user: tmi.ChatUserstate, message: string) {
    const voice = this.voice.getVoiceMapForUser(user);
    const filtered = this.isFiltered(message);
    this.chat_logs.update(val => {
      return [...val, `${user.username} (${voice.voice.name}, ${voice.pitch.toPrecision(2)}, ${voice.rate.toPrecision(2)}, Filtered: ${filtered}): ${message}`];
    });

    if (filtered) {
      return;
    }
    await this.voice.processMessage(user, message);
    await this.obsController?.updateSceneWith(user, voice);
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
