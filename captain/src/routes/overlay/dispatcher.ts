/**
 * Dispatches messages to any observers
 */

import type { ApiClient, HelixUser } from '@twurple/api';
import type { ChatClient, ChatMessage, ChatViewerMilestoneInfo } from '@twurple/chat';
import type { UserNotice, ChatSubInfo, ChatSubGiftInfo, ChatCommunitySubInfo } from '@twurple/chat';
import type { ModelUpdater } from './modelupdater';
import { LRUCache } from '$lib/LRUcache';
import { planToTier } from '$lib/twitch';
import { applyTimeoutTax } from './tax';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';

export interface OverlayObserver {
  onMessage(message: ChatMessage): void;
}

export interface OverlayTimeoutObserver {
  onTimeout(channel_name: string, user: string, duration: number): void;
}

export interface OverlayViewerMilestoneObserver {
  onViewerMilestone(info: ChatViewerMilestoneInfo, notice: UserNotice): void;
}

export interface OverlaySubObserver {
  onSub?(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice): void;
  onResub?(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice): void;
  onSubGift?(channel: string, user: string, subInfo: ChatSubGiftInfo, msg: UserNotice): void;
  onCommunitySub?(
    channel: string,
    user: string,
    subInfo: ChatCommunitySubInfo,
    msg: UserNotice
  ): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
  timeoutObservers: OverlayTimeoutObserver[] = [];
  subObservers: OverlaySubObserver[] = [];
  viewerMilestoneObservers: OverlayViewerMilestoneObserver[] = [];
  userCache: LRUCache<HelixUser> = new LRUCache(10);
  private api: ApiClient;
  private botId: string;
  public readonly modelUpdater: ModelUpdater;
  private badgeCache: Map<string, string> | null = null;
  private badgeLoadPromise: Promise<Map<string, string> | null> | null = null;

  constructor(twitch: ChatClient, api: ApiClient, modelUpdater: ModelUpdater, botId: string) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    twitch.onTimeout((channel, user, duration, _1) => this.onTimeout(channel, user, duration));
    twitch.onSub((channel, user, subInfo, msg) => this.onSub(channel, user, subInfo, msg));
    twitch.onResub((channel, user, subInfo, msg) => this.onResub(channel, user, subInfo, msg));
    twitch.onSubGift((channel, user, subInfo, msg) => this.onSubGift(channel, user, subInfo, msg));
    twitch.onCommunitySub((channel, user, subInfo, msg) =>
      this.onCommunitySub(channel, user, subInfo, msg)
    );
    twitch.onViewerMilestone((_1, _2, info, msg) => this.onViewerMilestone(info, msg));
    this.api = api;
    this.botId = botId;
    this.modelUpdater = modelUpdater;
  }

  updateApi(api: ApiClient): void {
    this.api = api;
    this.badgeCache = null;
    this.badgeLoadPromise = null;
  }

  private async loadBadgeSets(): Promise<Map<string, string> | null> {
    const merged = new Map<string, string>();
    const [globalSets, channelSets] = await Promise.all([
      this.api.chat.getGlobalBadges(),
      this.api.chat.getChannelBadges(PUBLIC_TARGET_CHANNEL_ID)
    ]);
    for (const set of [...globalSets, ...channelSets]) {
      for (const version of set.versions) {
        merged.set(`${set.id}/${version.id}`, version.getImageUrl(2));
      }
    }
    return merged;
  }

  async getBadgeUrl(setId: string, version: string): Promise<string | null> {
    if (!this.badgeCache) {
      if (!this.badgeLoadPromise) {
        this.badgeLoadPromise = this.loadBadgeSets().catch((e) => {
          console.warn('Failed to load Twitch badge sets:', e);
          this.badgeLoadPromise = null;
          return null;
        });
      }
      const map = await this.badgeLoadPromise;
      if (!map) return null;
      this.badgeCache = map;
    }

    const direct = this.badgeCache.get(`${setId}/${version}`);
    if (direct) return direct;
    const zero = this.badgeCache.get(`${setId}/0`);
    if (zero) return zero;
    for (const [key, url] of this.badgeCache) {
      if (key.startsWith(`${setId}/`)) return url;
    }
    return null;
  }

  addObserver(observer: OverlayObserver) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
      console.debug(`addObserver: ${observer.constructor.name} (total: ${this.observers.length})`);
    }
  }

  removeObserver(observer: OverlayObserver) {
    this.observers = this.observers.filter((ob) => observer !== ob);
    console.debug(`removeObserver: ${observer.constructor.name} (total: ${this.observers.length})`);
  }

  addTimeoutObserver(observer: OverlayTimeoutObserver) {
    if (!this.timeoutObservers.includes(observer)) {
      this.timeoutObservers.push(observer);
      console.debug(`addTimeoutObserver: ${observer.constructor.name}`);
    }
  }

  addSubObserver(observer: OverlaySubObserver) {
    if (!this.subObservers.includes(observer)) {
      this.subObservers.push(observer);
      console.debug(`addSubObserver: ${observer.constructor.name}`);
    }
  }

  addViewerMilestoneObserver(observer: OverlayViewerMilestoneObserver) {
    if (!this.viewerMilestoneObservers.includes(observer)) {
      this.viewerMilestoneObservers.push(observer);
      console.debug(`viewerMilestoneObservers: ${observer.constructor.name}`);
    }
  }

  dispatchMessage(message: ChatMessage) {
    console.log(
      `dispatchMessage (fake): "${message.text}" from ${message.userInfo?.userName} -> ${this.observers.length} observer(s)`
    );
    this.onMessage(message);
  }

  private onMessage(message: ChatMessage) {
    const bitsInfo = message.bits > 0 ? `, bits: ${message.bits}` : '';
    console.debug(
      `onMessage: "${message.text}" from ${message.userInfo?.userName} -> ${this.observers.length} observer(s)${bitsInfo}`
    );
    for (const observer of this.observers) {
      observer.onMessage(message);
    }
  }

  private onTimeout(channel_id: string, user: string, duration: number) {
    console.log(`onTimeout: ${user} in ${channel_id} for ${duration}s`);
    for (const observer of this.timeoutObservers) {
      observer.onTimeout(channel_id, user, duration);
    }
  }

  private onSub(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice) {
    console.debug(`onSub: ${user} in ${channel} (tier ${planToTier(subInfo.plan)})`);
    for (const observer of this.subObservers) {
      observer.onSub?.(channel, user, subInfo, msg);
    }
  }

  private onResub(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice) {
    console.debug(`onResub: ${user} in ${channel} (tier ${planToTier(subInfo.plan)})`);
    for (const observer of this.subObservers) {
      observer.onResub?.(channel, user, subInfo, msg);
    }
  }

  private onSubGift(channel: string, user: string, subInfo: ChatSubGiftInfo, msg: UserNotice) {
    console.debug(
      `onSubGift: ${user} gifted by ${subInfo.gifter ?? 'anonymous'} in ${channel} (tier ${planToTier(subInfo.plan)})`
    );
    for (const observer of this.subObservers) {
      observer.onSubGift?.(channel, user, subInfo, msg);
    }
  }

  private onCommunitySub(
    channel: string,
    user: string,
    subInfo: ChatCommunitySubInfo,
    msg: UserNotice
  ) {
    console.debug(`onCommunitySub: ${user} gave ${subInfo.count} subs in ${channel}`);
    for (const observer of this.subObservers) {
      observer.onCommunitySub?.(channel, user, subInfo, msg);
    }
  }

  private onViewerMilestone(info: ChatViewerMilestoneInfo, notice: UserNotice) {
    console.debug(
      `onViewerMilestone: ${notice.userInfo.userName} reached a milestone of ${info.reward ?? '0'}`
    );
    for (const observer of this.viewerMilestoneObservers) {
      observer.onViewerMilestone?.(info, notice);
    }
  }

  /**
   * Very dangerous, sends a message without the ~
   */
  async rawSendMessageAsUser(channelId: string, message: string, replyTo?: string) {
    if (import.meta.env.DEV) {
      console.log(`rawSendMessageAsUser (DEV, skipped): "${message}" replyTo=${replyTo}`);
      return;
    }

    console.log(`rawSendMessageAsUser: "${message}" to ${channelId} replyTo=${replyTo}`);
    await this.api.asUser(this.botId, async (ctx) => {
      await ctx.chat.sendChatMessage(channelId, `${message}`, {
        replyParentMessageId: replyTo
      });
    });
  }

  async sendMessageAsUser(channelId: string, message: string, replyTo?: string) {
    return this.rawSendMessageAsUser(channelId, `~ ${message}`, replyTo);
  }

  async getHelixUserFromName(channelName: string) {
    let user = this.userCache.get(channelName);
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
    duration_seconds: number,
    isMod?: boolean
  ) {
    if (import.meta.env.DEV) {
      console.log(
        `Would have timed out ${targetUser} for ${reason} for ${duration_seconds} seconds.`
      );
      return;
    }

    if (isMod) {
      await applyTimeoutTax(this, channelId, targetUser, 0.2);
      console.log(`timeoutUser: ${targetUser} is a mod, applied 20% tax instead of ban`);
      return;
    }

    try {
      return await this.api.asUser(this.botId, async (ctx) => {
        return await ctx.moderation.banUser(channelId, {
          user: targetUser,
          reason,
          duration: duration_seconds
        });
      });
    } catch (e) {
      console.warn(`timeoutUser failed for ${targetUser}:`, e);
    }
  }

  async pinChatMessage(channelId: string, messageId: string, durationSeconds: number) {
    if (import.meta.env.DEV) {
      console.log(`pinChatMessage (DEV, skipped): msg=${messageId} dur=${durationSeconds}`);
      return;
    }

    try {
      await this.api.asUser(this.botId, async (ctx) => {
        await ctx.callApi({
          type: 'helix',
          url: 'chat/pins',
          method: 'PUT',
          query: {
            broadcaster_id: channelId,
            moderator_id: this.botId,
            message_id: messageId,
            duration: String(durationSeconds)
          }
        });
      });
      console.log(`Pinned message ${messageId} for ${durationSeconds}s`);
    } catch (e) {
      console.error(`Failed to pin message ${messageId} due to ${e}`);
    }
  }
}
