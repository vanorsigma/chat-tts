/**
 * This is like the 3rd re-write of this
 * Implemented in pure JavaScript/TypeScript because Svelte won't be powerful enough for this
 */

import tmi from 'tmi.js';
import { is7TVEmote } from '$lib/seventv';

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

function escapeHTML(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  element: HTMLDivElement;
  rate: number;
  lastMovement: number;
  offset: number;
}

export class ChatBulletContainer {
  private root: HTMLDivElement;
  private bulletProperties: ChatBulletProperties[] = [];
  private width: number;
  private height: number;
  private enabled: boolean = true;

  constructor(root: HTMLDivElement, twitch: tmi.Client) {
    this.root = root;
    twitch.on('message', (_, userstate, message) => this.onMessage(userstate, message));

    /// NOTE: This is important, we only ever want to get this once if possible.
    [this.height, this.width] = this.getWidthHeight();
    window.requestAnimationFrame(this.drawFrameLoop.bind(this));
  }

  get isEnabled() {
    return this.enabled;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private removeBullet(bullet: ChatBulletProperties) {
    /// NOTE: performance assumption; the bullet exists
    this.root.removeChild(bullet.element);
    this.bulletProperties = this.bulletProperties.filter((thing) => thing !== bullet);
  }

  deleteAllBullets(): void {
    for (const bulletProp of this.bulletProperties) {
      this.removeBullet(bulletProp);
    }
  }

  drawFrameLoop(): void {
    /// TODO: Migrate this to use a HTMLCanvasElement instead.
    /// This is hard for these reasons:
    /// 1. We will need to animate the animated pictures and bullet movement separate
    /// 2. Won't be able to easily do anything tbh
    for (const bulletProp of this.bulletProperties) {
      const currentTimestamp = window.performance.now();
      const offset = (currentTimestamp - bulletProp.lastMovement) / bulletProp.rate;
      const textWidth = Number(getComputedStyle(bulletProp.element).width.replace('px', ''));

      bulletProp.offset += offset;
      bulletProp.element.style.right = `${bulletProp.offset - textWidth}px`;

      if (bulletProp.offset >= this.width) {
        bulletProp.element.style.width = `${textWidth + 1}px`;
      }

      if (bulletProp.offset > this.width + textWidth) {
        this.removeBullet(bulletProp);
      }
      bulletProp.lastMovement = currentTimestamp;
    }

    window.requestAnimationFrame(this.drawFrameLoop.bind(this));
  }

  async onMessage(user: tmi.ChatUserstate, message: string) {
    if (this.isEnabled) {
      this.spawnBullet(await splitMessage(user.emotes ?? {}, message), user.color);
    }
  }

  getWidthHeight(): [number, number] {
    const computedStyle = window.getComputedStyle(this.root);
    return [
      Number(computedStyle.height.replace('px', '')),
      Number(computedStyle.width.replace('px', ''))
    ];
  }

  spawnBullet(parts: BulletPart[], color: string = 'lightgrey') {
    const [height, width] = this.getWidthHeight();
    const rate = Math.max(Math.random(), 0.5) * (1000 / 60);

    // TODO: yes, this is ugly, yes, we should build it with a builder pattern, no, i don't care
    const bulletBuilding = document.createElement('div');
    bulletBuilding.style.position = 'absolute';
    bulletBuilding.style.top = `${Math.random() * (height - 50)}px`;
    bulletBuilding.style.right = `-999px`;

    for (const part of parts) {
      if (isImageBulletPart(part)) {
        const imageEle = document.createElement('img');
        imageEle.src = part.imgsrc;
        imageEle.style.height = '1em';
        bulletBuilding.appendChild(imageEle);
      }

      if (isTextBulletPart(part)) {
        const textEle = document.createElement('span');
        textEle.textContent = escapeHTML(part.text);
        textEle.style.color = color;
        bulletBuilding.appendChild(textEle);
      }
    }

    this.bulletProperties.push({
      element: bulletBuilding,
      lastMovement: window.performance.now(),
      offset: 0,
      rate
    });

    this.root.append(bulletBuilding);
  }
}
