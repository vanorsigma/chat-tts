import { cancelSpeech, getVoicesList, selectVoiceByName, speak } from '../speech';
import type { FullConfig } from '../config';
import axios from 'axios';
import type { ChatMessage, ChatUser } from '@twurple/chat';

export interface NewVoiceSettings {
  voice_name: string;
  rate: number;
  pitch: number;
}

export type NewVoiceSettingsWithSynthesis = NewVoiceSettings & {
  voice: SpeechSynthesisVoice;
};

export interface VoiceSettings {
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
}

export interface VoiceController {
  processMessage(
    message: ChatMessage,
    onSpeedChange: (arg0: number) => void,
    onSpeechStart: () => void
  ): Promise<void>;
  getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettings>;
  refreshUser(user: ChatUser): void;
  cancel(): void;
}

export class RemoteVoiceController implements VoiceController {
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
        rate_range_high: config.rateRange.maximum
      },
      sound_effects: config.soundEffects.map((effect) => ({
        tag: effect.tag,
        filename: effect.filePath
      }))
    });
  }

  async processMessage(
    message: ChatMessage,
    _onSpeedChange: (arg0: number) => void,
    _onSpeechStart: () => void
  ): Promise<void> {
    await axios.get(`${this.baseurl}/processMessage`, {
      params: {
        username: message.userInfo.userName ?? '',
        message: message.text
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

export class LocalVoiceController implements VoiceController {
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
    return selectVoiceByName(voicename)!;
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
