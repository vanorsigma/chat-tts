import { makeAnimatedSprite, fetchAnimatedTextures, random, contrastColorFor } from '$lib/utils';
import { Application, Assets, Container, Sprite, TextStyle, Ticker, Text, Texture } from 'pixi.js';
import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import { KikiAPI, type KikiResponse } from '../kikiapi';
import { LRUCache } from '$lib/LRUcache';
import { getSubTier } from '$lib/api/subtiers';
import { karmaStore, pinStore } from '../stores';
import { getOverlayConfig, isDelegateVoiceToOverlay } from '../constants';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import { isImageBulletPart, isTextBulletPart, splitMessage, type BulletPart } from './parsing';
import { shouldSkipMessage } from '$lib/messageGuard';
import type { SpeakTTS } from '$lib/remoteTTSMessages';
import { getFontUrl } from '$lib/api/font';

const PADDING = 5;
const CACHE_SIZE = 30;

interface ChatBulletProperties {
  element: Container;
  rate: number;
}

export class ChatBulletContainer implements OverlayObserver {
  private app: Application;
  private dispatcher: OverlayDispatchers;
  private kiki: KikiAPI;
  private bulletProperties: ChatBulletProperties[] = [];
  private enabled: boolean = true;
  private busWs?: WebSocket;
  private cache = new LRUCache<Texture[]>(CACHE_SIZE);
  private subTierCache = new LRUCache<number>(CACHE_SIZE);
  private fontCache = new LRUCache<string>(CACHE_SIZE);
  private badgeTextureCache = new LRUCache<Texture>(CACHE_SIZE);

  constructor(dispatcher: OverlayDispatchers, kikiUrl: string, app: Application) {
    this.app = app;
    this.dispatcher = dispatcher;
    this.kiki = new KikiAPI(kikiUrl);
    dispatcher.addObserver(this);

    this.initLater();
  }

  async initLater() {
    this.app.ticker.add((time) => this.drawFrameLoop(time));
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

  private removeBullet(bullet: ChatBulletProperties) {
    bullet.element.removeFromParent();
    this.bulletProperties = this.bulletProperties.filter((thing) => thing !== bullet);
  }

  deleteAllBullets(): void {
    for (const bulletProp of this.bulletProperties) {
      this.removeBullet(bulletProp);
    }
  }

  drawFrameLoop(time: Ticker): void {
    for (const bulletProp of this.bulletProperties) {
      const offset = time.deltaTime * bulletProp.rate * 0.5;

      bulletProp.element.x -= offset;

      if (bulletProp.element.x <= -bulletProp.element.width) {
        this.removeBullet(bulletProp);
      }
    }
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

  private async resolveUserFontFamily(userName: string): Promise<string> {
    const cached = this.fontCache.get(userName);
    if (cached !== null) return cached;

    // fire and forget: load the font and cache it, use 'Arial' for this message
    const loadPromise = this.loadUserFont(userName);
    await Promise.race([loadPromise, new Promise((resolve) => setTimeout(resolve, 50))]);

    // re-check the cache in case the load completed fast
    const after = this.fontCache.get(userName);
    if (after !== null) return after;
    return 'Arial';
  }

  private async loadUserFont(userName: string): Promise<void> {
    let family = 'Arial';
    try {
      family = `font-user-${userName}`;
      const face = new FontFace(family, `url(${getFontUrl(userName)})`);
      await face.load();
      document.fonts.add(face);
    } catch {
      family = 'Arial';
    }

    this.fontCache.put(userName, family);
  }

  invalidateUserFont(userName: string): void {
    this.fontCache.delete(userName);
    const family = `font-user-${userName}`;
    for (const face of document.fonts) {
      if (face.family === family) {
        document.fonts.delete(face);
        break;
      }
    }
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
    if (
      shouldSkipMessage({
        text: message.text,
        userName: message.userInfo.userName,
        isBot: message.userInfo.badges.has('bot-badge'),
        ignorePrefix: getOverlayConfig().ignorePrefix
      })
    )
      return;
    if (!this.isEnabled) return;

    const parts = await splitMessage(message.emoteOffsets, message.text);
    const displayName = message.userInfo.displayName ?? message.userInfo.userName;
    const color = message.userInfo.color;
    const selectedFamily = await this.resolveUserFontFamily(message.userInfo.userName);
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
      this.spawnBullet(displayName, parts, kikiResponse, color, selectedFamily, badgeUrls);

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
      this.spawnBullet(displayName, parts, null, color, selectedFamily, badgeUrls);
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

  async spawnBullet(
    displayName: string | null,
    parts: BulletPart[],
    kikiResponse: KikiResponse | null,
    color: string = '#D3D3D3',
    selectedFamily: string = 'Arial',
    badgeUrls: string[] = []
  ) {
    const { width, height } = this.app.screen;
    const rate = Math.max(random(), 0.25) * (1000 / 60);

    const fillColor = color || '#D3D3D3';
    const strokeColor = contrastColorFor(fillColor);

    let x = 0;
    const y = random() * (height - 50);

    const container = new Container();

    const BADGE_SIZE = 28;
    const BADGE_GAP = 4;
    let nameX = 0;

    if (badgeUrls.length > 0) {
      for (const url of badgeUrls) {
        let texture = this.badgeTextureCache.get(url);
        if (!texture) {
          const loaded = (await Assets.load({
            src: url,
            loadParser: 'loadTextures'
          })) as Texture | null;
          if (!loaded) continue;
          texture = loaded;
          this.badgeTextureCache.put(url, loaded);
        }

        const badge = new Sprite(texture);
        badge.height = BADGE_SIZE;
        badge.width = (texture.width / texture.height) * BADGE_SIZE;
        badge.x = nameX;
        badge.y = y - 24 - (BADGE_SIZE - 24) / 2;
        nameX += badge.width + BADGE_GAP;
        container.addChild(badge);
      }
    }

    if (displayName) {
      const displayNameText = new Text({
        text: displayName,
        style: {
          fontFamily: selectedFamily,
          fontSize: 24,
          fill: fillColor,
          stroke: { color: strokeColor, width: 2 }
        }
      });

      displayNameText.x = nameX;
      displayNameText.y = y - 24;
      container.addChild(displayNameText);
    }

    if (kikiResponse) {
      const kikiText = new Text({
        text: `${kikiResponse.kamoji} ${kikiResponse.emoji}`,
        style: new TextStyle({
          fontFamily: selectedFamily,
          fontSize: 24,
          fill: 'pink'
        })
      });

      kikiText.x = 0;
      kikiText.y = y + 40;
      container.addChild(kikiText);

      if (kikiResponse.rating > 0.1 || kikiResponse.rating < -0.1)
        karmaStore.updateKarma(kikiResponse.rating, 'Kiki');
    }

    for (const part of parts) {
      if (isImageBulletPart(part)) {
        const url = `https:${part.imgsrc.replace('https:', '')}`;
        let partGifTextures = this.cache.get(url);
        if (!partGifTextures) {
          partGifTextures = await fetchAnimatedTextures(url);
          this.cache.put(url, partGifTextures);
        }

        if (!partGifTextures) continue;
        const partGif = makeAnimatedSprite(partGifTextures);
        if (!partGif) continue;

        partGif.scale.set(0.3);
        partGif.x = PADDING + x;
        partGif.y = y;

        x += partGif.width + PADDING;
        container.addChild(partGif);
      }

      if (isTextBulletPart(part)) {
        const textStyle: TextStyle = new TextStyle({
          fontFamily: selectedFamily,
          fontSize: 48,
          fill: fillColor,
          stroke: { color: strokeColor, width: 2 }
        });

        const partText = new Text({ text: part.text, style: textStyle });

        partText.x = x;
        partText.y = y;

        x += partText.width;
        container.addChild(partText);
      }
    }

    container.x = width;
    this.app.stage.addChild(container);
    this.bulletProperties.push({
      element: container,
      rate
    });
  }
}
