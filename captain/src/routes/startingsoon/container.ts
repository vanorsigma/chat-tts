import { Application, Assets, Container, Sprite, Text, Texture, TextStyle, Ticker } from 'pixi.js';
import type { ChatMessage } from '@twurple/chat';
import {
  splitMessage,
  isImageBulletPart,
  isTextBulletPart,
  type BulletPart
} from '../overlay/chatbullet/parsing';

const PADDING = 5;

interface BulletProperties {
  element: Container;
  rate: number;
}

export interface StartingSoonArtEntry {
  file: string;
  artist: string;
}

export class StartingSoonBulletContainer {
  private app: Application;
  private bulletProperties: BulletProperties[] = [];
  private images: StartingSoonArtEntry[] = [];
  private imageTextureCache = new Map<string, Texture>();
  private imageSpawnTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(app: Application) {
    this.app = app;
    this.app.ticker.add((time: Ticker) => this.drawFrameLoop(time));
  }

  setImages(images: StartingSoonArtEntry[]) {
    this.images = images;
    if (images.length > 0) {
      this.scheduleNextImageBullet();
    }
  }

  private scheduleNextImageBullet() {
    if (this.imageSpawnTimer !== null) {
      clearTimeout(this.imageSpawnTimer);
    }
    const delay = 8000 + Math.random() * 7000;
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
    const entry = this.images[Math.floor(Math.random() * this.images.length)];
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
      style: new TextStyle({ fontFamily: 'Arial', fontSize: 48, fill: '#ffffff' })
    });

    attrText.anchor.set(0.5, 0);
    attrText.x = sprite.width / 2;
    attrText.y = sprite.height + 4;

    container.addChild(sprite);
    container.addChild(attrText);

    const totalH = sprite.height + 4 + attrText.height;

    const maxH = screenH * 0.9;
    let scaleVal = 1;
    if (totalH > maxH) {
      scaleVal = maxH / totalH;
    }
    scaleVal *= 0.3 + Math.random() * 0.4;
    container.scale.set(scaleVal);

    const finalH = totalH * container.scale.y;
    const y = Math.random() * (screenH - finalH);
    const rate = (0.15 + Math.random() * 0.35) * (1000 / 60);

    container.x = screenW;
    container.y = y;

    this.app.stage.addChild(container);
    this.bulletProperties.push({ element: container, rate });
  }

  async onMessage(message: ChatMessage) {
    if (message.text.startsWith('%') || message.userInfo.badges.has('bot-badge')) return;
    this.spawnTextBullet(
      message.userInfo.displayName ?? message.userInfo.userName,
      await splitMessage(message.emoteOffsets, message.text),
      message.userInfo.color
    );
  }

  private async spawnTextBullet(
    displayName: string,
    parts: BulletPart[],
    color: string = '#D3D3D3'
  ) {
    const { width: screenW, height: screenH } = this.app.screen;
    const rate = Math.max(Math.random(), 0.25) * (1000 / 60);
    let x = 0;
    const y = Math.random() * (screenH - 50);

    const container = new Container();

    const displayNameText = new Text({
      text: displayName,
      style: { fontFamily: 'Arial', fontSize: 24, fill: color }
    });
    displayNameText.x = 0;
    displayNameText.y = y - 24;
    container.addChild(displayNameText);

    for (const part of parts) {
      if (isImageBulletPart(part)) {
        const url = `https:${part.imgsrc.replace('https:', '')}`;
        try {
          const loaded = await Assets.load(url);
          const texture = this.resolveTexture(loaded);
          if (!texture) continue;
          const sprite = new Sprite(texture);
          sprite.scale.set(0.3);
          sprite.x = PADDING + x;
          sprite.y = y;
          x += sprite.width + PADDING;
          container.addChild(sprite);
        } catch {
          continue;
        }
      }

      if (isTextBulletPart(part)) {
        const textStyle = new TextStyle({
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

    container.x = screenW;
    this.app.stage.addChild(container);
    this.bulletProperties.push({ element: container, rate });
  }

  private drawFrameLoop(time: Ticker): void {
    for (const prop of this.bulletProperties) {
      const offset = time.deltaTime * prop.rate * 0.5;
      prop.element.x -= offset;
      if (prop.element.x <= -prop.element.width) {
        prop.element.removeFromParent();
        this.bulletProperties = this.bulletProperties.filter((p) => p !== prop);
      }
    }
  }

  deleteAllBullets(): void {
    for (const prop of this.bulletProperties) {
      prop.element.removeFromParent();
    }
    this.bulletProperties = [];
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
