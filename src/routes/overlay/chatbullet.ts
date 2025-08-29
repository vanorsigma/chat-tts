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

export function isImageBulletPart(part: BulletPart): part is ImageBulletPart {
  return (part as ImageBulletPart).imgsrc !== undefined;
}

export function isTextBulletPart(part: BulletPart): part is TextBulletPart {
  return (part as TextBulletPart).text !== undefined;
}

export async function splitMessage(message: string): Promise<BulletPart[]> {
  const parts = (await Promise.all(message.split(' ').map(potential => (async () => {
    const emote = await is7TVEmote(EMOTE_SET_ID, potential);
    if (emote !== null) {
      return {
        imgsrc: emote.urls.filter(url => url.includes("4x.webp"))[0] ?? ''
      } as ImageBulletPart;
    } else {
      return {
        text: potential
      } as TextBulletPart;
    }
  })())));

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


export class ChatBulletContainer {
  private root: HTMLDivElement;
  private bulletToInterval = new Map<HTMLDivElement, unknown>();

  constructor(root: HTMLDivElement, twitch: tmi.Client) {
    this.root = root;
    twitch.on('message', (_, userstate, message) => this.onMessage(userstate, message));
  }

  async onMessage(user: tmi.Userstate, message: string) {
    this.spawnBullet(await splitMessage(message));
  }

  getWidthHeight(): [number, number] {
    const computedStyle = window.getComputedStyle(this.root);
    return [Number(computedStyle.height.replace('px', '')), Number(computedStyle.width.replace('px', ''))];
  }

  spawnBullet(parts: BulletPart[]) {
    console.log('going to spawn ', parts);
    const [height, width] = this.getWidthHeight();
    const rate = Math.max(Math.random(), 0.5) * (1000 / 60);

    // TODO: yes, this is ugly, yes, we should build it with a builder pattern, no, i don't care
    const bulletBuilding = document.createElement('div');
    let offset = 0;
    bulletBuilding.style.position = 'absolute';
    bulletBuilding.style.top = `${(Math.random() * (height - 50))}px`;
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
        textEle.textContent = part.text;
        bulletBuilding.appendChild(textEle);
      }
    }

    let lastTimestamp = new Date().getTime();
    // TODO: can probably roll it into one timer
    const interval = setInterval(() => {
      offset += 1;
      const textWidth = Number(getComputedStyle(bulletBuilding).width.replace('px', ''));
      const currentTimestamp = new Date().getTime();
      const delta = currentTimestamp - lastTimestamp;
      // const framesSkipped = Math.min(Math.max(1, Math.round(delta / rate)), 3); // allow only 3 frame skips
      const framesSkipped = 1;
      offset = offset * framesSkipped;
      bulletBuilding.style.right = `${(offset - textWidth)}px`;

      if (offset >= width) {
        bulletBuilding.style.width = `${textWidth + 20}px`;
      }

      if (offset > width + textWidth) {
        clearInterval(interval);
        this.root.removeChild(bulletBuilding);
        this.bulletToInterval.delete(bulletBuilding);
      }
      lastTimestamp = currentTimestamp;
    }, rate);

    this.bulletToInterval.set(bulletBuilding, interval);
    this.root.append(bulletBuilding);
  }
}
