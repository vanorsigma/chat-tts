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

export function emoteOffsetsToSkips(ranges: Map<string, string[]>): Map<number, [number, string]> {
  return new Map(
    ranges.entries().flatMap(([id, positions]) =>
      positions.map((position) => {
        const [start, end] = position.split('-').map((e) => Number(e));
        return [
          start,
          [end - start + 1, `https://static-cdn.jtvnw.net/emoticons/v1/${id}/3.0`]
        ] as [number, [number, string]];
      })
    )
  );
}

export function gifPositionsToSkips(tag: string | undefined): Map<number, [number, string]> {
  const result = new Map<number, [number, string]>();
  if (!tag) return result;

  for (const entry of tag.split(',')) {
    const [position, , url] = entry.split('|');
    if (!position || !url) continue;

    const [start, end] = position.split('-').map((e) => Number(e));
    if (Number.isNaN(start) || Number.isNaN(end)) continue;

    result.set(start, [end - start + 1, url]);
  }

  return result;
}

export function messageEntryBreaker(
  skips: Map<number, [number, string]>,
  message: string
): (string | ImageBulletPart)[] {
  const result: (string | ImageBulletPart)[] = [];
  let last_i = 0;
  let i = 0;
  while (i < message.length) {
    if (skips.has(i)) {
      const [length, imgsrc] = skips.get(i)!;
      result.push(message.slice(last_i, i));
      result.push({ imgsrc });
      i += length;
      last_i = i;
      continue;
    }

    i++;
  }

  result.push(message.slice(last_i, i));
  return result;
}
