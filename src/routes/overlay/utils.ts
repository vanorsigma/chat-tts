import { Application } from 'pixi.js';
import { AnimatedSprite, Assets, Sprite, Texture } from 'pixi.js';

export async function makeApplication(root: HTMLDivElement): Application {
  const app = new Application();
  await app.init({ background: 'transparent', resizeTo: root, backgroundAlpha: 0 });
  app.ticker.maxFPS = 30;
  root.appendChild(app.canvas);
  return app;
}

export function properRandom(): number {
  if ('crypto' in window) {
    const array = new Uint8Array(1);
    crypto.getRandomValues(array);
    return array[0] / 255.0;
  }
  return Math.random();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchAnimatedSprite(url: string): Promise<Sprite | null> {
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
    return new Sprite(texture);
  }

  const animatedSprite = new AnimatedSprite(textures);
  animatedSprite.animationSpeed = 0.4;
  animatedSprite.loop = true;
  animatedSprite.play();

  return animatedSprite;
}
