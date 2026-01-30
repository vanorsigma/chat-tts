 // Utilities shared across all routes
import { AnimatedSprite, Assets, Sprite, Texture } from 'pixi.js';

function sleep(ms: number) {
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
  animatedSprite.animationSpeed = Math.random();
  animatedSprite.loop = true;
  animatedSprite.play();

  return animatedSprite;
}
