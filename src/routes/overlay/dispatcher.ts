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

  // TODO: this function requires a user access token, which means I'll need to
  // update twitch.ts to return both bot tokens and handle refreshing tokens,
  // both not something i want to do now
  // async getUserList(channelId: string) {
  //   // TODO: we are ignoring the fact that >100 users can be in a channel
  //   const chatters = await this.api.asUser(this.botId,
  //     async ctx => ctx.chat.getChatters(channelId));
  //   return chatters.data.map(chatter => chatter.userName);
  // }

  private onMessage(message: ChatMessage) {
    for (const observer of this.observers) {
      observer.onMessage(message);
    }
  }

  async sendMessageAsUser(channelId: string, message: string) {
    if (import.meta.env.DEV)
      return;

    await this.api.chat.sendChatMessageAsApp(this.botId, channelId, `~ ${message}`);
  }
}
