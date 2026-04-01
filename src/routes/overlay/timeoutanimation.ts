import type { ChatClient, ChatMessage } from '@twurple/chat';
import {
  AnimatedSprite,
  Assets,
  ColorMatrixFilter,
  Container,
  ObservablePoint,
  Sprite,
  Text,
  TextStyle,
  ViewContainer,
  type Application,
  type PointData
} from 'pixi.js';
import { filters, Sound, sound } from '@pixi/sound';
import { OverlayDispatchers, type OverlayTimeoutObserver } from './dispatcher';
import gsap from 'gsap';

export class TimeoutAnimation implements OverlayTimeoutObserver {
  private app: Application;
  private dispatcher: OverlayDispatchers;
  private clip: Sound | null = null;

  constructor(dispatcher: OverlayDispatchers, app: Application) {
    sound.disableAutoPause = true;
    this.app = app;
    // https://www.myinstants.com/en/instant/gun-shot/?utm_source=copy&utm_medium=share
    this.clip = Sound.from('/gunsound.mp3');
    this.dispatcher = dispatcher;
    this.dispatcher.addTimeoutObserver(this);

    this.clip.autoPlay = false;
    this.clip.volume = 0.2;
  }

  private isCollidingFactory(sprite1: ViewContainer, sprite2: ViewContainer) {
    return () => {
      const bounds1 = sprite1.getBounds();
      const bounds2 = sprite2.getBounds();

      return (
        bounds1.x < bounds2.x + bounds2.width &&
        bounds1.x + bounds1.width > bounds2.x &&
        bounds1.y < bounds2.y + bounds2.height &&
        bounds1.y + bounds1.height > bounds2.y
      );
    };
  }

  async drawKillUser(displayName: string, imageUrl: string) {
    const PADDING = 300;
    const avatarSpriteAsset = await Assets.load(imageUrl);
    const gunTopAsset = await Assets.load('/gunTop.png');
    const gunBottomAsset = await Assets.load('/gunBottom.png');
    const bulletAsset = await Assets.load('/bullet.png');

    const avatar = Sprite.from(avatarSpriteAsset);

    const displayNameTextStyle = new TextStyle({
      fill: '#000000',
      stroke: {
        color: '#ffffff',
        width: 5,
      }
    });

    const displayNameText = new Text({
      text: displayName,
      style: displayNameTextStyle
    });

    const avatarContainer = new Container();
    avatarContainer.addChild(avatar);
    avatarContainer.addChild(displayNameText);
    avatarContainer.x = this.app.canvas.width - avatarContainer.width - PADDING;
    displayNameText.x = (avatar.width - displayNameText.width) / 2;
    displayNameText.y = avatar.height + 50;

    // TODO: because the guns are shared across all calls, we can probably share this...
    // TODO: also there is a chance that we are leaking memory
    const gunTop = Sprite.from(gunTopAsset);
    const gunBottom = Sprite.from(gunBottomAsset);
    const bullet = Sprite.from(bulletAsset);

    bullet.scale = 0.5;
    bullet.rotation = Math.PI / 2;
    bullet.x = gunTop.x + gunTop.width;
    bullet.y = 50;
    bullet.alpha = 0;

    const gunContainer = new Container();
    gunContainer.addChild(bullet);
    gunContainer.addChild(gunTop);
    gunContainer.addChild(gunBottom);
    gunContainer.scale = 0.4;
    gunContainer.x = PADDING;

    // TODO: muzzle flash
    // TODO: barrel
    // TODO: make maki hold a gun

    const container = new Container();
    container.addChild(avatarContainer);
    container.addChild(gunContainer);
    container.y = (this.app.canvas.height - container.height) / 2;

    // gun animation
    const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
    tl.to(gunTop, { x: -100, duration: 0.1 })
      .to(gunTop, { x: 0 })
      .to(bullet, { alpha: 1, duration: 0.0001 })
      .to(gunTop, { angle: -10, x: -500, delay: 0.5, duration: 0.05 })
      .to(gunBottom, { angle: -10, x: -500, duration: 0.05 }, '<')
      .to(bullet, { x: bullet.x + 4000, duration: 0.5 })
      .to(gunTop, { angle: 0, x: 0 }, '<')
      .to(gunBottom, { angle: 0, x: 0 }, '<')
      .to(container, { alpha: 0, delay: 1 });

    this.clip!.play();

    this.app.stage.addChild(container);

    const collisionFn = this.isCollidingFactory(bullet, avatar);
    const tickerCallback = () => {
      if (collisionFn()) {
        avatarContainer.tint = 0xff0000;
        const tl = gsap.timeline({
          onComplete: () => {
            console.log("removing child");
            this.app.stage.removeChild(container);
          }
        });
        tl.to(avatarContainer, { alpha: 0, duration: 1, delay: 1 });
        this.app.ticker.remove(tickerCallback);
      }
    };
    this.app.ticker.add(tickerCallback);
  }

  async onTimeout(channel_name: string, username: string, duration: number) {
    console.log(channel_name, username);
    const broadcasterUser = await this.dispatcher.getHelixUserFromName(channel_name);
    if (!broadcasterUser) return;
    const user = await this.dispatcher.getHelixUserFromName(username);
    if (!user) return;

    const url = user.profilePictureUrl;
    await this.drawKillUser(user.displayName, url);
  }
}
