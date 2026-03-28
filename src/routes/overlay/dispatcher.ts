/**
 * Dispatches messages to any observers
 */

import type { ApiClient } from '@twurple/api';
import type { ChatClient, ChatMessage } from '@twurple/chat';
import type { ModelUpdater } from './modelupdater';

export interface OverlayObserver {
  onMessage(message: ChatMessage): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
  private twitch: ChatClient;
  private api: ApiClient;
  private botId: string;
  public readonly modelUpdater: ModelUpdater;

  constructor(twitch: ChatClient, api: ApiClient, modelUpdater: ModelUpdater, botId: string) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    this.twitch = twitch;
    this.api = api;
    this.botId = botId;
    this.modelUpdater = modelUpdater;
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

  /**
   * Very dangerous, sends a message without the ~
   */
  async rawSendMessageAsUser(channelId: string, message: string, replyTo?: string) {
    if (import.meta.env.DEV) {
      console.log(`Would have sent raw message: ${message} with reply to ${replyTo}`);
      return;
    }

    await this.api.chat.sendChatMessageAsApp(this.botId, channelId, `${message}`, {
      replyParentMessageId: replyTo
    });
  }

  async sendMessageAsUser(channelId: string, message: string, replyTo?: string) {
    return this.rawSendMessageAsUser(channelId, `~ ${message}`, replyTo);
  }

  async getChatterList(channelId: string) {
    if (import.meta.env.DEV) {
      console.log('Would have gotten the chatter list.');
      return [];
    }

    return await this.api.asUser(
      this.botId,
      async (ctx) => await ctx.chat.getChattersPaginated(channelId).getAll()
    );
  }

  async timeoutUser(
    channelId: string,
    targetUser: string,
    reason: string,
    duration_seconds: number
  ) {
    if (import.meta.env.DEV) {
      console.log(
        `Would have timed out ${targetUser} for ${reason} for ${duration_seconds} seconds.`
      );
      return;
    }

    return await this.api.asUser(this.botId, async (ctx) => {
      return await ctx.moderation.banUser(channelId, {
        user: targetUser,
        reason,
        duration: duration_seconds
      });
    });
  }
}
