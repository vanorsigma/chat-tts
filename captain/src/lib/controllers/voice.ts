import type { FullConfig } from '../config';
import axios from 'axios';
import type { ChatMessage, ChatUser } from '@twurple/chat';

export interface NewVoiceSettings {
  voice_name: string;
  rate: number;
  pitch: number;
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
    console.log(`Voice controller configured at ${this.baseurl}`);
    this.sendInitializationMessage(config);
  }

  async sendInitializationMessage(config: FullConfig): Promise<void> {
    console.log('Sending initialization message to voice controller...');
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
    console.log('Voice controller initialized.');
  }

  async processMessage(
    message: ChatMessage,
    _onSpeedChange: (arg0: number) => void,
    _onSpeechStart: () => void
  ): Promise<void> {
    console.log(`Processing voice message from ${message.userInfo.userName}`);
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
    console.log(`Voice map loaded for ${user.userName}`);
    return result.data as NewVoiceSettings;
  }

  refreshUser(user: ChatUser): void {
    console.log(`Refreshing voice for ${user.userName}`);
    axios.get(`${this.baseurl}/refreshUser`, {
      params: {
        username: user.userName
      }
    });
  }

  cancel(): void {
    console.log('Cancelling voice.');
    axios.get(`${this.baseurl}/cancel`);
  }
}
