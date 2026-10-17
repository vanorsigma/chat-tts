import { Assets, Container, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { ChatMessage } from '@twurple/chat';
import { BulletLayer } from '../overlay/chatbullet/bullet-layer';
import { splitMessage } from '../overlay/chatbullet/parsing';
import { random } from '$lib/utils';

export interface StartingSoonArtEntry {
  file: string;
  artist: string;
}

export class StartingSoonBulletContainer extends BulletLayer {
  private images: StartingSoonArtEntry[] = [];
  private imagesHistory: StartingSoonArtEntry[] = [];
  private imageTextureCache = new Map<string, Texture>();
  private imageSpawnTimer: ReturnType<typeof setTimeout> | null = null;

  setImages(images: StartingSoonArtEntry[]) {
    this.images = images;
    this.imagesHistory = [];
    if (images.length > 0) {
      this.scheduleNextImageBullet();
    }
  }

  private scheduleNextImageBullet() {
    if (this.imageSpawnTimer !== null) {
      clearTimeout(this.imageSpawnTimer);
    }
    const delay = 8000 + random() * 7000;
    this.imageSpawnTimer = setTimeout(() => {
      this.spawnImageBullet();
      this.scheduleNextImageBullet();
    }, delay);
  }

  private resolveTexture(loaded: unknown): Texture | null {
    if (!loaded) return null;
    return Array.isArray(loaded) ? (loaded[0] as Texture) : (loaded as Texture);
  }

  private async spawnImageBullet() {
    if (this.images.length === 0) return;

    const available = this.images.filter((img) => !this.imagesHistory.includes(img));
    const entry = available[Math.floor(random() * available.length)];

    this.imagesHistory.push(entry);
    if (this.imagesHistory.length > Math.floor(this.images.length / 2)) {
      this.imagesHistory.shift();
    }

    const url = `/startingsoon/${entry.file}`;

    let texture = this.imageTextureCache.get(url);
    if (!texture) {
      try {
        const loaded = await Assets.load(url);
        const resolved = this.resolveTexture(loaded);
        if (!resolved) return;
        texture = resolved;
        this.imageTextureCache.set(url, texture);
      } catch {
        return;
      }
    }

    const { width: screenW, height: screenH } = this.app.screen;

    const container = new Container();
    const sprite = new Sprite(texture);
    const attrText = new Text({
      text: entry.artist,
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 28, fill: '#ffffff' })
    });

    attrText.anchor.set(0.5, 0);

    container.addChild(sprite);
    container.addChild(attrText);

    const totalH = sprite.height + 4 + attrText.height;

    const maxH = screenH * 0.9;
    let scaleVal = 1;
    if (totalH > maxH) {
      scaleVal = maxH / totalH;
    }
    scaleVal *= 0.3 + random() * 0.4;

    sprite.scale.set(scaleVal);

    attrText.x = sprite.width / 2;
    attrText.y = sprite.height + 4;

    const finalH = container.height;
    const y = random() * (screenH - finalH);
    const rate = (0.15 + random() * 0.35) * (1000 / 60);

    container.x = screenW;
    container.y = y;

    this.app.stage.addChild(container);
    this.addBullet(container, rate);
  }

  async onMessage(message: ChatMessage) {
    if (message.text.startsWith('%') || message.userInfo.badges.has('bot-badge')) return;
    await this.spawnBullet({
      userName: message.userInfo.userName,
      displayName: message.userInfo.displayName ?? message.userInfo.userName,
      parts: await splitMessage(message.emoteOffsets, message.text, message.tags.get('gifs')),
      color: message.userInfo.color
    });
  }

  destroy() {
    if (this.imageSpawnTimer !== null) {
      clearTimeout(this.imageSpawnTimer);
      this.imageSpawnTimer = null;
    }
    this.deleteAllBullets();
    this.imageTextureCache.clear();
  }
}
