/**
 * This is like the 3rd re-write of this
 * Implemented in pure JavaScript/TypeScript because Svelte won't be powerful enough for this
 * 4th re-write LULE
 */

import tmi from 'tmi.js';
import { fetchAnimatedSprite, is7TVEmote } from '$lib/seventv';
import { Application, Assets, Container, Sprite, TextStyle, Ticker, Text } from 'pixi.js';

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
  ranges: { [key: string]: string[] },
  message: string
): Promise<BulletPart[]> {
  // split by twitch messages, and then call splitMessage to split by 7tv
  // if and only if there are no twitch message splits, then we proceed with 7tv splits
  const parsed: (string | ImageBulletPart)[] = messageEntryBreaker(
    new Map(
      Object.entries(ranges).flatMap(([k, vs]) =>
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
  private bulletProperties: ChatBulletProperties[] = [];
  private enabled: boolean = true;

  constructor(root: HTMLDivElement, twitch: tmi.Client) {
    this.root = root;
    this.app = new Application();

    this.initLater(twitch);
  }

  async initLater(twitch: tmi.Client) {
    await this.app.init({ background: 'transparent', resizeTo: this.root, backgroundAlpha: 0 });
    this.root.appendChild(this.app.canvas);
    twitch.on('message', (_, userstate, message) => this.onMessage(userstate, message));
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

  async onMessage(user: tmi.ChatUserstate, message: string) {
    if (this.isEnabled) {
      this.spawnBullet(await splitMessage(user.emotes ?? {}, message), user.color);
    }
  }

  async spawnBullet(parts: BulletPart[], color: string = '#D3D3D3') {
    const { width, height } = this.app.screen;
    const rate = Math.max(Math.random(), 0.5) * (1000 / 60);

    let x = 0;
    const y = Math.random() * (height - 50);

    const container = new Container();

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
          fontSize: 24,
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
