/**
 * Dispatches messages to any observers
 */

import type { ApiClient } from '@twurple/api';
import type { ChatClient, ChatMessage } from '@twurple/chat';

export interface OverlayObserver {
  onMessage(message: ChatMessage): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
  private twitch: ChatClient;
  private api: ApiClient;
  private botId: string;

  constructor(twitch: ChatClient, api: ApiClient, botId: string) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    this.twitch = twitch;
    this.api = api;
    this.botId = botId;
  }

  addObserver(observer: OverlayObserver) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  removeObserver(observer: OverlayObserver) {
    this.observers = this.observers.filter((ob) => observer !== ob);
  }

  private onMessage(message: ChatMessage) {
    for (const observer of this.observers) {
      observer.onMessage(message);
    }
  }

  async sendMessageAsUser(channelId: string, message: string) {
    console.log(this.botId, channelId)
    await this.api.chat.sendChatMessageAsApp(this.botId, channelId, `~ ${message}`);
  }
}
