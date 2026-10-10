import { is7TVEmote } from '$lib/seventv';
import {
  emoteOffsetsToSkips,
  gifPositionsToSkips,
  isImageBulletPart,
  isTextBulletPart,
  messageEntryBreaker,
  type BulletPart,
  type ImageBulletPart,
  type TextBulletPart
} from './parsing-core';

export { isImageBulletPart, isTextBulletPart, type BulletPart, type TextBulletPart };

const EMOTE_SET_ID = '01J452JCVG0000352W25T9VEND';
const GLOBAL_EMOTE_SET_ID = 'global';

async function sevenSplitMessage(message: string): Promise<BulletPart[]> {
  const parts = await Promise.all(
    message.split(' ').map((potential) =>
      (async () => {
        const emote =
          (await is7TVEmote(EMOTE_SET_ID, potential)) ??
          (await is7TVEmote(GLOBAL_EMOTE_SET_ID, potential));
        if (emote !== null) {
          const url4x = emote.urls.filter((url) => url.includes('4x.webp'))[0];
          if (url4x) {
            return {
              imgsrc: url4x
            } as ImageBulletPart;
          }
        }
        return {
          text: potential
        } as TextBulletPart;
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

export async function splitMessage(
  ranges: Map<string, string[]>,
  message: string,
  gifsTag?: string
): Promise<BulletPart[]> {
  const skips = emoteOffsetsToSkips(ranges);
  for (const [start, skip] of gifPositionsToSkips(gifsTag)) {
    skips.set(start, skip);
  }

  const parsed: (string | ImageBulletPart)[] = messageEntryBreaker(skips, message);

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
