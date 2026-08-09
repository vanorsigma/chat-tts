// Utilities shared across all routes
import { AnimatedSprite, Assets, Sprite, Texture } from 'pixi.js';

const MASK64 = 0xffffffffffffffffn;

// Crypto-backed randomness, used only to seed the xoshiro256++ state below.
// It is too slow to call for every random draw.
export function properRandom(): number {
  if (typeof globalThis.crypto !== 'undefined') {
    const array = new Uint32Array(1);
    globalThis.crypto.getRandomValues(array);
    return array[0] / 0x100000000;
  }
  return Math.random();
}

// xoshiro256++ (Blackman & Vigna), seeded once at module load.
const state: [bigint, bigint, bigint, bigint] = (() => {
  const word = () =>
    (BigInt(Math.floor(properRandom() * 0x100000000)) << 32n) |
    BigInt(Math.floor(properRandom() * 0x100000000));
  const [s0, s1, s2, s3] = [word(), word(), word(), word()];
  // the state must not be all zeros
  if (s0 === 0n && s1 === 0n && s2 === 0n && s3 === 0n) return [1n, 0n, 0n, 0n];
  return [s0, s1, s2, s3];
})();

function rotl64(x: bigint, k: number): bigint {
  const y = x & MASK64;
  return ((y << BigInt(k)) | (y >> BigInt(64 - k))) & MASK64;
}

function xoshiro256ppNext(): bigint {
  let [s0, s1, s2, s3] = state;
  const result = (rotl64(s0 + s3, 23) + s0) & MASK64;

  const t = (s1 << 17n) & MASK64;
  s2 ^= s0;
  s3 ^= s1;
  s1 ^= s2;
  s0 ^= s3;
  s2 ^= t;
  s3 = rotl64(s3, 45);

  state[0] = s0;
  state[1] = s1;
  state[2] = s2;
  state[3] = s3;
  return result;
}

// Returns a float in [0, 1), the fast replacement for Math.random().
export function random(): number {
  const value = Number(xoshiro256ppNext() >> 11n) / 2 ** 53;
  return value < 1 ? value : 0;
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAnimatedTextures(url: string): Promise<Texture[]> {
  const response = await fetch(url);
  const imageBlob = await (await response.blob()).arrayBuffer();

  const decoder = new ImageDecoder({
    data: imageBlob,
    type: response.headers.get('content-type') ?? 'image/webp'
  });
  await decoder.completed;
  await sleep(1);

  const textures = [];
  for (let i = 0; i < decoder.tracks[0].frameCount; i++) {
    const frame = await decoder.decode({ frameIndex: i });
    const texture = Texture.from(frame.image);
    textures.push(texture);
  }

  if (textures.length === 0) {
    const texture = await Assets.load(url);
    return [texture];
  }

  return textures;
}

export function makeAnimatedSprite(textures: Texture[]): Sprite | null {
  if (textures.length === 0) return null;

  if (textures.length === 1) {
    return new Sprite(textures[0]);
  }

  const animatedSprite = new AnimatedSprite(textures);
  animatedSprite.animationSpeed = random();
  animatedSprite.loop = true;
  animatedSprite.play();

  return animatedSprite;
}

function pickRandom<T>(arr: T[], count: number): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.trim().replace('#', '');
  if (h.length === 3)
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  if (h.length !== 6) return null;
  const int = parseInt(h, 16);
  if (Number.isNaN(int)) return null;
  return { r: (int >> 16) & 0xff, g: (int >> 8) & 0xff, b: int & 0xff };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// https://gomakethings.com/articles/dynamically-changing-the-text-color-based-on-background-color-contrast-with-vanilla-js/
export function contrastColorFor(fill: string): string {
  const rgb = hexToRgb(fill);
  if (!rgb) return '#ffffff';
  return relativeLuminance(rgb) > 0.5 ? '#000000' : '#ffffff';
}
