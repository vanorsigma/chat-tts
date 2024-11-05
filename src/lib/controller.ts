import { writable, type Readable, type Writable } from 'svelte/store';
import tmi from "tmi.js";
import { createNewTwitchClient } from './twitch';
import { getVoicesList, selectVoiceByName, speak } from './speech';
import type { FullConfig } from './config';

interface VoiceSettings {
  voice: SpeechSynthesisVoice,
  pitch: number,
  rate: number
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

  getVoiceMapForUser(user: tmi.ChatUserState): VoiceSettings {
    if (!user.username) return;

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

  constructor(config: FullConfig) {
    this.chat_logs = writable([]);
    this.twitch = createNewTwitchClient(config.channelName);
    this.voice = new VoiceController(config);
  }

  private async updateWithMessage(user: tmi.ChatUserstate, message: string) {
    this.chat_logs.update(val => {
      const voice = this.voice.getVoiceMapForUser(user);
      return [...val, `${user.username} (${voice.voice.name}, ${voice.pitch}, ${voice.rate}): ${message}`];
    });
    await this.voice.processMessage(user, message);
  }

  async start() {
    this.twitch.on('connected', () => {
      console.log('connected.')
    });

    this.twitch.on('message', async (_x, user, message, _y) => {
      await this.updateWithMessage(user, message);
    });
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
