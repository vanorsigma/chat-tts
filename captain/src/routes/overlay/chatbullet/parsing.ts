import { is7TVEmote } from '$lib/seventv';

const EMOTE_SET_ID = '01J452JCVG0000352W25T9VEND';

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

async function sevenSplitMessage(message: string): Promise<BulletPart[]> {
  const parts = await Promise.all(
    message.split(' ').map((potential) =>
      (async () => {
        const emote = await is7TVEmote(EMOTE_SET_ID, potential);
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
  message: string
): Promise<BulletPart[]> {
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
