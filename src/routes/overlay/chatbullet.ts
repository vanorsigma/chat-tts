/**
 * This is like the 3rd re-write of this
 * Implemented in pure JavaScript/TypeScript because Svelte won't be powerful enough for this
 * 4th re-write LULE
 */

import { fetchAnimatedSprite, is7TVEmote } from '$lib/seventv';
import { Application, Container, TextStyle, Ticker, Text } from 'pixi.js';
import type { ChatClient, ChatMessage } from '@twurple/chat';
import { KikiAPI } from './kikiapi';

const EMOTE_SET_ID = '01J452JCVG0000352W25T9VEND';
// const EMOTE_SET_ID = '01JHTZC2NY67T9GHVWYQ40BPP2';

export interface ImageBulletPart {
  imgsrc: string;
}

export interface TextBulletPart {
  text: string;
}

export type BulletPart = ImageBulletPart | TextBulletPart;

export function isImageBulletPart(part: BulletPart | string): part is ImageBulletPart {
  return (part as ImageBulletPart).imgsrc !== undefined;
}

export function isTextBulletPart(part: BulletPart): part is TextBulletPart {
  return (part as TextBulletPart).text !== undefined;
}

function messageEntryBreaker(
  skips: Map<number, [number, string]>,
  message: string
): (string | ImageBulletPart)[] {
  const result = [];
  let last_i = 0;
  let i = 0;
  while (i < message.length) {
    const skip = skips.get(i)!;
    if (skips.has(i)) {
      result.push(message.slice(last_i, i));
      result.push({
        imgsrc: `https://static-cdn.jtvnw.net/emoticons/v1/${skip[1]}/3.0`
      });
      i += skip[0];
      last_i = i;
      continue;
    }

    i++;
  }

  result.push(message.slice(last_i, i));
  return result;
}

export async function splitMessage(
  ranges: Map<string, string[]>,
  message: string
): Promise<BulletPart[]> {
  // split by twitch messages, and then call splitMessage to split by 7tv
  // if and only if there are no twitch message splits, then we proceed with 7tv splits
  const parsed: (string | ImageBulletPart)[] = messageEntryBreaker(
    new Map(
      ranges.entries().flatMap(([k, vs]) =>
        vs.map((v) => {
          const [start, end] = v.split('-').map((e) => Number(e));
          return [start, [end - start + 1, k]];
        })
      )
    ),
    message
  );

  if (parsed.length === 0) {
    parsed.push(message);
  }

  return (
    await Promise.all(
      parsed.map(async (partial) => {
        if (!isImageBulletPart(partial)) {
          return await sevenSplitMessage(partial);
        }
        return [partial];
      })
    )
  ).flatMap((e) => e);
}

async function sevenSplitMessage(message: string): Promise<BulletPart[]> {
  const parts = await Promise.all(
    message.split(' ').map((potential) =>
      (async () => {
        const emote = await is7TVEmote(EMOTE_SET_ID, potential);
        if (emote !== null) {
          return {
            imgsrc: emote.urls.filter((url) => url.includes('4x.webp'))[0] ?? ''
          } as ImageBulletPart;
        } else {
          return {
            text: potential
          } as TextBulletPart;
        }
      })()
    )
  );

  const finalParts = [];
  for (const part of parts) {
    if (finalParts.length === 0) {
      finalParts.push(part);
    } else {
      const finalPart = finalParts[finalParts.length - 1];
      if (isTextBulletPart(part) && isTextBulletPart(finalPart)) {
        finalPart.text = finalPart.text + ' ' + part.text;
      } else {
        finalParts.push(part);
      }
    }
  }

  return finalParts;
}

export interface ChatBulletProperties {
  element: Container;
  rate: number;
}

const PADDING = 5;

export class ChatBulletContainer {
  private root: HTMLDivElement;
  private app: Application;
  private kiki: KikiAPI;
  private bulletProperties: ChatBulletProperties[] = [];
  private enabled: boolean = true;

  constructor(root: HTMLDivElement, twitch: ChatClient, kikiUrl: string) {
    this.root = root;
    this.app = new Application();
    this.kiki = new KikiAPI(kikiUrl);

    this.initLater(twitch);
  }

  async initLater(twitch: ChatClient) {
    await this.app.init({ background: 'transparent', resizeTo: this.root, backgroundAlpha: 0 });
    this.app.ticker.maxFPS = 30;
    this.root.appendChild(this.app.canvas);
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    this.app.ticker.add((time) => this.drawFrameLoop(time));
  }

  get isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private removeBullet(bullet: ChatBulletProperties) {
    /// NOTE: performance assumption; the bullet exists
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

    return Math.random() < 0.5; // TODO: haha, hard constants xdx
  }

  async onMessage(message: ChatMessage) {
    if (message.text.startsWith('%') || message.userInfo.badges.has('bot-badge')) return;
    if (this.isEnabled) {
      this.spawnBullet(
        message.userInfo.displayName ?? message.userInfo.userName,
        await splitMessage(message.emoteOffsets, message.text),
        this.willKikiReadMessage(message) ? this.kiki.fetchKikiResponse(message.text) : null, // TODO: don't make this a hardcoded constant
        message.userInfo.color
      );
    }
  }

  async spawnBullet(
    displayName: string | null,
    parts: BulletPart[],
    kiki_response: Promise<string | null> | null,
    color: string = '#D3D3D3'
  ) {
    const { width, height } = this.app.screen;
    const rate = Math.max(Math.random(), 0.25) * (1000 / 60);

    let x = 0;
    let y = Math.random() * (height - 50);

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
          kikiText.text = res;
          kikiText.style.update();
        }
      })(); // delay by one cycle
    }

    for (const part of parts) {
      if (isImageBulletPart(part)) {
        const partGif = await fetchAnimatedSprite(`https:${part.imgsrc.replace('https:', '')}`);
        if (!partGif) return;

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
