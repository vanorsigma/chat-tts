/**
 * Dispatches messages to any observers
 */

import type { ApiClient, HelixUser } from '@twurple/api';
import type { ChatClient, ChatMessage } from '@twurple/chat';
import type { ModelUpdater } from './modelupdater';
import { LRUCache } from '$lib/LRUcache';

export interface OverlayObserver {
  onMessage(message: ChatMessage): void;
}

export interface OverlayTimeoutObserver {
  onTimeout(channel_name: string, user: string, duration: number): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
  timeoutObservers: OverlayTimeoutObserver[] = [];
  userCache: LRUCache<HelixUser> = new LRUCache(10);
  private api: ApiClient;
  private botId: string;
  public readonly modelUpdater: ModelUpdater;

  constructor(twitch: ChatClient, api: ApiClient, modelUpdater: ModelUpdater, botId: string) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    twitch.onTimeout((channel, user, duration, _1) => this.onTimeout(channel, user, duration));
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

  addTimeoutObserver(observer: OverlayTimeoutObserver) {
    if (!this.timeoutObservers.includes(observer)) {
      this.timeoutObservers.push(observer);
    }
  }

  removeTimeoutOverser(observer: OverlayTimeoutObserver) {
    this.timeoutObservers = this.timeoutObservers.filter((ob) => observer !== ob);
  }

  private onMessage(message: ChatMessage) {
    for (const observer of this.observers) {
      observer.onMessage(message);
    }
  }

  private onTimeout(channel_id: string, user: string, duration: number) {
    for (const observer of this.timeoutObservers) {
      observer.onTimeout(channel_id, user, duration);
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

  async getHelixUserFromName(channelName: string) {
    let user = this.userCache.get(channelName)
    if (user) return user;

    user = await this.api.users.getUserByName(channelName);
    if (!user) return null;

    this.userCache.put(channelName, user);
    return user;
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
