import { Application, Container, TextStyle, Ticker, Text, Sprite, Assets } from 'pixi.js';
import { fetchAnimatedSprite, properRandom } from './utils';
import { MAXWELL_LIMITS } from './constants';

const CAT_BREAD_SPIN_GIF = '/catBreadSpin.gif';

export interface MaxwellObjectProperties {
  container: Container;
  velocity: [number, number];
  timeout: NodeJS.Timeout;
}

export class MaxwellContainer {
  private app: Application;
  private enabled: boolean = true;
  private maxwells: MaxwellObjectProperties[] = [];

  constructor(app: Application) {
    this.app = app;
    this.maxwells = [];

    this.initLater();
  }

  async initLater() {
    this.app.ticker.add((time) => this.drawFrameLoop(time));
  }

  drawFrameLoop(time: Ticker): void {
    for (const maxwellProp of this.maxwells) {
      const { container, velocity } = maxwellProp;
      const { width, height } = this.app.screen;

      container.x += velocity[0] * time.deltaTime;
      container.y += velocity[1] * time.deltaTime;

      if (container.x < 0 || container.x > width - maxwellProp.container.width) {
        maxwellProp.velocity[0] = -velocity[0];
      }

      if (container.y < 0 || container.y > height - maxwellProp.container.height) {
        maxwellProp.velocity[1] = -velocity[1];
      }
    }
  }

  removeAllMaxwells() {
    this.maxwells.forEach((maxwell) => {
      clearTimeout(maxwell.timeout);
      maxwell.container.removeFromParent();
    });
    this.maxwells = [];
  }

  async spawnMaxwell(interval: number) {
    if (this.maxwells.length >= MAXWELL_LIMITS) return;

    const { width, height } = this.app.screen;

    const container = new Container();
    const sprite = await fetchAnimatedSprite(CAT_BREAD_SPIN_GIF);
    if (!sprite) {
      console.error('cannot load cat bread spin sprite');
      return;
    }
    sprite.scale = 0.5;
    container.addChild(sprite);
    container.x = properRandom() * (width - sprite.width);
    container.y = properRandom() * (height - sprite.height);

    const coinflip_x = properRandom() < 0.5;
    const coinflip_y = properRandom() < 0.5;

    const maxwell: MaxwellObjectProperties = {
      container,
      velocity: [coinflip_x ? 10.0 : -10.0, coinflip_y ? 10.0 : -10.0],
      timeout: setTimeout(() => {
        container.removeFromParent();
        this.maxwells = this.maxwells.filter((mw) => mw !== maxwell);
      }, interval)
    };

    this.app.stage.addChild(container);
    this.maxwells.push(maxwell);
  }
}
