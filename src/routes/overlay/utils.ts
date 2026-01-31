import { Application, TextureStyle } from 'pixi.js';

export async function makeApplication(root: HTMLDivElement): Promise<Application> {
  const app = new Application();
  await app.init({ background: 'transparent', resizeTo: root, backgroundAlpha: 0 });
  app.ticker.maxFPS = 60;
  root.appendChild(app.canvas);
  TextureStyle.defaultOptions.scaleMode = 'nearest';
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
