import { makeAnimatedSprite, fetchAnimatedTextures, random, contrastColorFor } from '$lib/utils';
import { Application, Assets, Container, Sprite, Text, TextStyle, Ticker, Texture } from 'pixi.js';
import { LRUCache } from '$lib/LRUcache';
import { getFontUrl, getUserFontStyle } from '$lib/api/font';
import { isImageBulletPart, isTextBulletPart, type BulletPart } from './parsing-core';

const PADDING = 5;
const CACHE_SIZE = 30;
const BADGE_SIZE = 28;
const BADGE_GAP = 4;

interface BulletProperties {
  element: Container;
  rate: number;
}

export interface BulletOptions {
  userName: string;
  displayName: string | null;
  parts: BulletPart[];
  color?: string;
  badgeUrls?: string[];
  kiki?: { kamoji: string; emoji: string } | null;
}

export abstract class BulletLayer {
  protected app: Application;
  private bulletProperties: BulletProperties[] = [];
  private gifCache = new LRUCache<Texture[]>(CACHE_SIZE);
  private fontCache = new LRUCache<string>(CACHE_SIZE);
  private fontStyleCache = new LRUCache<{ weight: 'normal' | 'bold'; italic: 'normal' | 'italic' }>(
    CACHE_SIZE
  );
  private badgeTextureCache = new LRUCache<Texture>(CACHE_SIZE);

  constructor(app: Application) {
    this.app = app;
    this.app.ticker.add((time: Ticker) => this.drawFrameLoop(time));
  }

  protected addBullet(element: Container, rate: number) {
    this.bulletProperties.push({ element, rate });
  }

  private removeBullet(bullet: BulletProperties) {
    bullet.element.removeFromParent();
    this.bulletProperties = this.bulletProperties.filter((thing) => thing !== bullet);
  }

  deleteAllBullets(): void {
    for (const bulletProp of this.bulletProperties) {
      bulletProp.element.removeFromParent();
    }
    this.bulletProperties = [];
  }

  private drawFrameLoop(time: Ticker): void {
    for (const bulletProp of this.bulletProperties) {
      const offset = time.deltaTime * bulletProp.rate * 0.5;

      bulletProp.element.x -= offset;

      if (bulletProp.element.x <= -bulletProp.element.width) {
        this.removeBullet(bulletProp);
      }
    }
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
    this.fontStyleCache.delete(userName);
    const family = `font-user-${userName}`;
    for (const face of document.fonts) {
      if (face.family === family) {
        document.fonts.delete(face);
        break;
      }
    }
  }

  private async resolveUserFontStyle(
    userName: string
  ): Promise<{ weight: 'normal' | 'bold'; italic: 'normal' | 'italic' }> {
    const cached = this.fontStyleCache.get(userName);
    if (cached !== null) return cached;

    let style: { weight: string; italic: number } | null = null;
    try {
      style = await getUserFontStyle(userName);
    } catch {
      style = null;
    }

    const result = {
      weight: style?.weight === 'bold' ? ('bold' as const) : ('normal' as const),
      italic: style?.italic ? ('italic' as const) : ('normal' as const)
    };
    this.fontStyleCache.put(userName, result);
    return result;
  }

  async spawnBullet({
    userName,
    displayName,
    parts,
    color = '#D3D3D3',
    badgeUrls = [],
    kiki = null
  }: BulletOptions): Promise<void> {
    const selectedFamily = await this.resolveUserFontFamily(userName);
    const selectedStyle = await this.resolveUserFontStyle(userName);

    const { width, height } = this.app.screen;
    const rate = Math.max(random(), 0.25) * (1000 / 60);

    const fillColor = color || '#D3D3D3';
    const strokeColor = contrastColorFor(fillColor);

    let x = 0;
    const y = random() * (height - 50);

    const container = new Container();

    let nameX = 0;

    if (badgeUrls.length > 0) {
      for (const url of badgeUrls) {
        let texture = this.badgeTextureCache.get(url);
        if (!texture) {
          let loaded: Texture | null = null;
          try {
            loaded = (await Assets.load({
              src: url,
              loadParser: 'loadTextures'
            })) as Texture | null;
          } catch (err) {
            console.warn('Failed to load badge', url, err);
            continue;
          }
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
          stroke: { color: strokeColor, width: 2 },
          fontWeight: selectedStyle.weight,
          fontStyle: selectedStyle.italic
        }
      });

      displayNameText.x = nameX;
      displayNameText.y = y - 24;
      container.addChild(displayNameText);
    }

    if (kiki) {
      const kikiText = new Text({
        text: `${kiki.kamoji} ${kiki.emoji}`,
        style: new TextStyle({
          fontFamily: selectedFamily,
          fontSize: 24,
          fill: 'pink'
        })
      });

      kikiText.x = 0;
      kikiText.y = y + 40;
      container.addChild(kikiText);
    }

    for (const part of parts) {
      if (isImageBulletPart(part)) {
        const url = `https:${part.imgsrc.replace('https:', '')}`;
        let partGifTextures = this.gifCache.get(url);
        if (!partGifTextures) {
          try {
            partGifTextures = await fetchAnimatedTextures(url);
            this.gifCache.put(url, partGifTextures);
          } catch (err) {
            console.warn('Failed to load chat image', url, err);
            continue;
          }
        }

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
          stroke: { color: strokeColor, width: 2 },
          fontWeight: selectedStyle.weight,
          fontStyle: selectedStyle.italic
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
    this.addBullet(container, rate);
  }
}
