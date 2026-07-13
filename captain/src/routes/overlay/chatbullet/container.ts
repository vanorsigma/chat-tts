import { makeAnimatedSprite, fetchAnimatedTextures } from '$lib/utils';
import { Application, Container, TextStyle, Ticker, Text, Texture } from 'pixi.js';
import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import { KikiAPI, type KikiResponse } from '../kikiapi';
import { LRUCache } from '$lib/LRUcache';
import { karmaStore } from '../stores';
import { isImageBulletPart, isTextBulletPart, splitMessage, type BulletPart } from './parsing';

const PADDING = 5;
const CACHE_SIZE = 30;

interface ChatBulletProperties {
  element: Container;
  rate: number;
}

export class ChatBulletContainer implements OverlayObserver {
  private app: Application;
  private kiki: KikiAPI;
  private bulletProperties: ChatBulletProperties[] = [];
  private enabled: boolean = true;
  private cache = new LRUCache<Texture[]>(CACHE_SIZE);

  constructor(dispatcher: OverlayDispatchers, kikiUrl: string, app: Application) {
    this.app = app;
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

  private willKikiReadMessage(message: ChatMessage): boolean {
    if (message.userInfo.badges.has('bot-badge')) return false;
    if (message.text.toLowerCase().includes('kiki') || message.userInfo.isBroadcaster) return true;

    return Math.random() < 0.5;
  }

  async onMessage(message: ChatMessage) {
    if (message.text.startsWith('%') || message.userInfo.badges.has('bot-badge')) return;
    if (this.isEnabled) {
      this.spawnBullet(
        message.userInfo.displayName ?? message.userInfo.userName,
        await splitMessage(message.emoteOffsets, message.text),
        this.willKikiReadMessage(message)
          ? this.kiki.fetchKikiResponse(message.text)
          : null,
        message.userInfo.color
      );
    }
  }

  async spawnBullet(
    displayName: string | null,
    parts: BulletPart[],
    kiki_response: Promise<KikiResponse | null> | null,
    color: string = '#D3D3D3'
  ) {
    const { width, height } = this.app.screen;
    const rate = Math.max(Math.random(), 0.25) * (1000 / 60);

    let x = 0;
    const y = Math.random() * (height - 50);

    const container = new Container();

    if (displayName) {
      const displayNameText = new Text({
        text: displayName,
        style: {
          fontFamily: 'Arial',
          fontSize: 24,
          fill: color
        }
      });

      displayNameText.x = 0;
      displayNameText.y = y - 24;
      container.addChild(displayNameText);
    }

    if (kiki_response) {
      const kikiText = new Text({
        text: 'Kiki is thinking...',
        style: new TextStyle({
          fontFamily: 'Arial',
          fontSize: 24,
          fill: 'pink'
        })
      });

      kikiText.x = 0;
      kikiText.y = y + 40;
      container.addChild(kikiText);

      (async () => {
        const res = await kiki_response;
        if (res) {
          kikiText.text = `${res.kamoji} ${res.emoji}`;
          if (res.rating > 0.1 || res.rating < -0.1) karmaStore.updateKarma(res.rating, 'Kiki');
          kikiText.style.update();
        } else {
          kikiText.text = 'Kiki was unable to respond :(';
          kikiText.style.update();
        }
      })();
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
          fontFamily: 'Arial',
          fontSize: 48,
          fill: color
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
