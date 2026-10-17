import { random } from '$lib/utils';
import { Application } from 'pixi.js';
import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import { KikiAPI } from '../kikiapi';
import { LRUCache } from '$lib/LRUcache';
import { getSubTier } from '$lib/api/subtiers';
import { karmaStore, pinStore } from '../stores';
import { getOverlayConfig, isDelegateVoiceToOverlay } from '../constants';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import { splitMessage } from './parsing';
import { shouldSkipMessage } from '$lib/messageGuard';
import type { SpeakTTS } from '$lib/remoteTTSMessages';
import { BulletLayer } from './bullet-layer';

const CACHE_SIZE = 30;

export class ChatBulletContainer extends BulletLayer implements OverlayObserver {
  private dispatcher: OverlayDispatchers;
  private kiki: KikiAPI;
  private enabled: boolean = true;
  private busWs?: WebSocket;
  private subTierCache = new LRUCache<number>(CACHE_SIZE);

  constructor(dispatcher: OverlayDispatchers, kikiUrl: string, app: Application) {
    super(app);
    this.dispatcher = dispatcher;
    this.kiki = new KikiAPI(kikiUrl);
    dispatcher.addObserver(this);
  }

  get isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  setBusSocket(ws: WebSocket) {
    this.busWs = ws;
  }

  private async getSubscriberTier(message: ChatMessage): Promise<number> {
    const userId = message.userInfo.userId;
    const cached = this.subTierCache.get(userId);
    if (cached !== null) return cached;

    let tier = 0;
    try {
      tier = await getSubTier(userId, message.channelId ?? '');
    } catch {
      tier = 0;
    }

    this.subTierCache.put(userId, tier);
    return tier;
  }

  private async willKikiReadMessage(message: ChatMessage): Promise<boolean> {
    if (message.userInfo.badges.has('bot-badge')) return false;
    if (message.text.toLowerCase().includes('kiki') || message.userInfo.isBroadcaster) return true;

    const tier = await this.getSubscriberTier(message);
    if (tier >= 2) return true;

    return random() < 0.5;
  }

  private async resolveBadgeUrls(badges: Map<string, string>): Promise<string[]> {
    if (badges.size === 0) return [];

    const urls = await Promise.all(
      [...badges].map(async ([setId, version]) => this.dispatcher.getBadgeUrl(setId, version))
    );
    return urls.filter((url): url is string => url !== null);
  }

  async onMessage(message: ChatMessage) {
    const cfg = getOverlayConfig();
    if (
      shouldSkipMessage({
        text: message.text,
        userName: message.userInfo.userName,
        isBot: message.userInfo.badges.has('bot-badge'),
        ignorePrefix: cfg.ignorePrefix,
        ignoredUsers: cfg.ignoredUsers
      })
    )
      return;
    if (!this.isEnabled) return;

    const parts = await splitMessage(message.emoteOffsets, message.text, message.tags.get('gifs'));
    const displayName = message.userInfo.displayName ?? message.userInfo.userName;
    const color = message.userInfo.color;
    const badges = message.userInfo.badges;
    console.debug(`${displayName} has ${badges.size} badges`);
    console.debug(
      `${displayName}'s badges: ${JSON.stringify(new Array(...badges.entries().map(([badgeName, _]) => badgeName)))}`
    );
    const badgeUrls = await Promise.race([
      this.resolveBadgeUrls(message.userInfo.badges),
      new Promise<string[]>((resolve) =>
        setTimeout(() => {
          console.warn('Timeout while attempting to resolve badge URLs');
          resolve([]);
        }, 100)
      )
    ]);

    if (await this.willKikiReadMessage(message)) {
      const kikiResponse = await this.kiki.fetchKikiResponse(
        displayName ?? 'anonymous',
        message.text
      );
      void this.spawnBullet({
        userName: message.userInfo.userName,
        displayName,
        parts,
        color,
        badgeUrls,
        kiki: kikiResponse
      });

      if (kikiResponse && (kikiResponse.rating > 0.1 || kikiResponse.rating < -0.1)) {
        karmaStore.updateKarma(kikiResponse.rating, 'Kiki');
      }

      if (kikiResponse?.pin_worthy) {
        pinStore.set({
          username: displayName ?? 'anonymous',
          text: message.text,
          kamoji: kikiResponse.kamoji,
          emoji: kikiResponse.emoji,
          expiresAt: Date.now() + 60_000
        });
        this.dispatcher.pinChatMessage(PUBLIC_TARGET_CHANNEL_ID, message.id, 60);
      }
    } else {
      void this.spawnBullet({
        userName: message.userInfo.userName,
        displayName,
        parts,
        color,
        badgeUrls
      });
    }

    if (isDelegateVoiceToOverlay() && this.busWs?.readyState === WebSocket.OPEN) {
      this.busWs.send(
        JSON.stringify({
          type: 'tts',
          command: {
            type: 'speak',
            username: message.userInfo.userName,
            message: message.text,
            isMod: message.userInfo.isMod,
            isVip: message.userInfo.isVip
          }
        } as SpeakTTS)
      );
    }
  }
}
