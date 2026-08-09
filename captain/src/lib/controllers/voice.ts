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
  speak(username: string, text: string): Promise<void>;
  getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettings | null>;
  refreshUser(user: ChatUser): void;
  sendInitializationMessage(config: FullConfig): Promise<void>;
  cancel(): void;
}

export class RemoteVoiceController implements VoiceController {
  private baseurl: string;

  constructor(config: FullConfig) {
    this.baseurl = config.remoteVoiceConfig?.controlURL || 'http://localhost:3123';
    console.log(`Voice controller configured at ${this.baseurl}`);
    this.connectWithRetry(config);
  }

  private async connectWithRetry(config: FullConfig): Promise<void> {
    let attempt = 0;
    while (true) {
      attempt++;
      try {
        console.log(`Connecting to voice controller at ${this.baseurl} (attempt ${attempt})...`);
        await this.sendInitializationMessage(config);
        console.log('Voice controller connected.');
        return;
      } catch (err) {
        console.error(
          `Voice controller connection failed (attempt ${attempt}): ${err}. Retrying in 5s...`
        );
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
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
    return this.speak(message.userInfo.userName ?? '', message.text);
  }

  async speak(username: string, text: string): Promise<void> {
    try {
      console.log(`Processing voice message from ${username}`);
      await axios.get(`${this.baseurl}/processMessage`, {
        params: { username, message: text }
      });
    } catch (err) {
      console.warn(`Voice processMessage failed for ${username}: ${err}`);
    }
  }

  async getVoiceMapForUser(user: ChatUser): Promise<NewVoiceSettings | null> {
    try {
      const result = await axios.get(`${this.baseurl}/getVoiceMapForUser`, {
        params: {
          username: user.userName
        }
      });
      console.log(`Voice map loaded for ${user.userName}`);
      return result.data as NewVoiceSettings;
    } catch (err) {
      console.warn(`Voice map fetch failed for ${user.userName}: ${err}`);
      return null;
    }
  }

  refreshUser(user: ChatUser): void {
    console.log(`Refreshing voice for ${user.userName}`);
    axios
      .get(`${this.baseurl}/refreshUser`, {
        params: {
          username: user.userName
        }
      })
      .catch((err) => console.warn(`Voice refreshUser failed for ${user.userName}: ${err}`));
  }

  cancel(): void {
    console.log('Cancelling voice.');
    axios.get(`${this.baseurl}/cancel`).catch((err) => console.warn(`Voice cancel failed: ${err}`));
  }
}
