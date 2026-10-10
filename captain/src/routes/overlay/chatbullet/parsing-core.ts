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

function parsePosition(position: string): [number, number] | null {
  const match = /^(\d+)-(\d+)$/.exec(position);
  if (!match) return null;
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (end < start) return null;
  return [start, end - start + 1];
}

export function emoteOffsetsToSkips(ranges: Map<string, string[]>): Map<number, [number, string]> {
  const result = new Map<number, [number, string]>();
  for (const [id, positions] of ranges) {
    for (const position of positions) {
      const parsed = parsePosition(position);
      if (!parsed) continue;
      result.set(parsed[0], [parsed[1], `https://static-cdn.jtvnw.net/emoticons/v1/${id}/3.0`]);
    }
  }
  return result;
}

export function gifPositionsToSkips(tag: string | undefined): Map<number, [number, string]> {
  const result = new Map<number, [number, string]>();
  if (!tag) return result;

  for (const entry of tag.split(',')) {
    const parts = entry.split('|');
    if (!parts[0] || !parts[2]) continue;
    const parsed = parsePosition(parts[0]);
    if (!parsed) continue;
    result.set(parsed[0], [parsed[1], parts[2]]);
  }

  return result;
}

export function messageEntryBreaker(
  skips: Map<number, [number, string]>,
  message: string
): (string | ImageBulletPart)[] {
  const result: (string | ImageBulletPart)[] = [];
  let lastIndex = 0;
  let i = 0;
  while (i < message.length) {
    const skip = skips.get(i);
    if (skip) {
      const [length, imgsrc] = skip;
      result.push(message.slice(lastIndex, i));
      result.push({ imgsrc });
      i += length;
      lastIndex = i;
      continue;
    }

    i++;
  }

  result.push(message.slice(lastIndex, i));
  return result;
}
