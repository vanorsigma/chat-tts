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
  type Application,
  type PointData
} from 'pixi.js';
import { filters, Sound, sound } from '@pixi/sound';
import gsap from 'gsap';
import { DING_THRESHOLD, KARMA_MAP, MAX_KARMA, MIN_KARMA } from './constants';
import { karmaStore } from './stores';
import {
  calculateAdjustmentNumbers,
  scurve,
  type ScaleSpriteAdjustmentNumbers
} from './karmaModel';

interface ScaleSpriteCollection {
  body: Sprite;
  handle: Sprite;
  leftBowl: Sprite;
  rightBowl: Sprite;
  leftFire: Sprite;
  rightFire: Sprite;

  container: Container;
  drawn: boolean;
}

export class KarmaContainer {
  private app: Application;
  private currentKarma: number = 0;
  private updateGlobalKarma: (karma: number) => void;
  private collection: ScaleSpriteCollection | null = null;
  private showTimeout: NodeJS.Timeout | null = null;
  private textTimeout: NodeJS.Timeout | null = null;
  private clip: Sound | null = null;

  constructor(twitch: ChatClient, app: Application, updateGlobalKarma: (karma: number) => void) {
    sound.disableAutoPause = true;
    this.app = app;
    this.updateGlobalKarma = updateGlobalKarma;
    karmaStore.subscribe((karma, oldKarma, message) => {
      this.currentKarma = karma;
      if (message) {
        this.updateScale(karma - oldKarma, message);
      }
    });
    this.initLater(twitch);
  }

  async initLater(twitch: ChatClient) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    this.collection = await this.loadScaleSprites();
    this.clip = Sound.from('/judgement.m4a');
  }

  async onMessage(message: ChatMessage) {
    if (message.userInfo.badges.has('bot-badge')) return;

    const karmaMatches = KARMA_MAP.keys()
      .filter((k) => message.text.includes(k))
      .toArray();
    if (karmaMatches.length > 0) {
      const firstMatch = karmaMatches.at(0)!;
      const karmaValue = KARMA_MAP.get(firstMatch)!;
      this.updateGlobalKarma(karmaValue);
      this.updateScale(karmaValue, message.text);
    }
  }

  private async updateScale(diffKarma: number, _message: string) {
    if (this.collection == null) return;
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }
    if (this.textTimeout) {
      clearTimeout(this.textTimeout);
    }

    const currentAngle = this.collection.handle.rotation;
    const adjustmentNumber = calculateAdjustmentNumbers(
      this.currentKarma,
      currentAngle,
      MIN_KARMA,
      MAX_KARMA
    );
    this.moveToAdjustmentNumbers(this.collection, adjustmentNumber, true);
    this.drawCollection(this.collection, true);
    const totalKarmaText = new Text();
    totalKarmaText.text = this.currentKarma.toFixed(2);
    totalKarmaText.style = new TextStyle({
      fontSize: 72,
      stroke: 'black',
      fill: 'white'
    });

    totalKarmaText.x =
      this.collection.container.x + this.collection.container.width / 4 - totalKarmaText.width / 2;
    totalKarmaText.y = this.collection.container.y + this.collection.container.height;

    const isNewKarmaPositive = diffKarma > 0;
    const newKarmaText = new Text();
    newKarmaText.text = `${isNewKarmaPositive ? '+' : ''}${diffKarma.toFixed(2)}`;
    newKarmaText.style = new TextStyle({
      fontSize: 54,
      stroke: 'black',
      fill: isNewKarmaPositive ? 'green' : 'red'
    });

    newKarmaText.x = totalKarmaText.x;
    newKarmaText.y = totalKarmaText.y + totalKarmaText.height;

    this.app.stage.addChild(totalKarmaText);
    this.app.stage.addChild(newKarmaText);
    if (Math.abs(diffKarma) >= DING_THRESHOLD && this.clip) {
      const clampedDiff = Math.min(Math.max(diffKarma, MIN_KARMA), MAX_KARMA);
      const svalue = scurve(((Math.abs(clampedDiff) - MIN_KARMA) / (MAX_KARMA - MIN_KARMA)) * 2);
      const value = svalue * 0.1;
      this.clip.filters = [new filters.DistortionFilter(value)];
      this.clip.volume = 0.15 * value;
      this.clip.play();
    }

    this.showTimeout = setTimeout(() => {
      this.undrawCollection(this.collection!, true, () => this.resetScale());
    }, 5000);

    this.textTimeout = setTimeout(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.app.stage.removeChild(newKarmaText);
          this.app.stage.removeChild(totalKarmaText);
        }
      });
      tl.to(newKarmaText, { opacity: 0 }).to(totalKarmaText, { opacity: 0 }, '<');
    }, 5000);
  }

  private resetScale() {
    if (this.collection === null) return;
    const currentAngle = this.collection.handle.rotation;
    const positionCalc = calculateAdjustmentNumbers(0, currentAngle, MIN_KARMA, MAX_KARMA);
    this.moveToAdjustmentNumbers(this.collection!, positionCalc);
  }

  private moveToAdjustmentNumbers(
    collection: ScaleSpriteCollection,
    target: ScaleSpriteAdjustmentNumbers,
    animated: boolean = false
  ) {
    if (animated) {
      const tl = gsap.timeline({ defaults: { ease: 'elastic.out(2)' } });
      tl.to(collection.handle, { rotation: target.handleRotation, delay: 2.273 })
        .to(
          collection.leftBowl,
          { x: target.leftBowlPosition.x, y: target.leftBowlPosition.y },
          '<'
        )
        .to(
          collection.leftFire,
          { x: target.leftBowlPosition.x, y: target.leftBowlPosition.y },
          '<'
        )
        .to(
          collection.rightBowl,
          {
            x: target.rightBowlPosition.x,
            y: target.rightBowlPosition.y
          },
          '<'
        )
        .to(
          collection.rightFire,
          { x: target.rightBowlPosition.x, y: target.rightBowlPosition.y },
          '<'
        );
      return;
    }
    collection.handle.rotation = target.handleRotation;
    collection.leftBowl.position = target.leftBowlPosition;
    collection.rightBowl.position = target.rightBowlPosition;
  }

  private drawCollection(collection: ScaleSpriteCollection, fadeIn: boolean = false) {
    if (collection.drawn) return;
    if (fadeIn) {
      collection.container.alpha = 0;
      const tl = gsap.timeline();
      tl.to(collection.container, { alpha: 1 });
    }

    this.app.stage.addChild(collection.container);
    collection.drawn = true;
  }

  private undrawCollection(
    collection: ScaleSpriteCollection,
    fadeOut: boolean = false,
    onComplete: () => void = () => {}
  ) {
    if (!collection.drawn) return;
    if (!fadeOut) {
      this.app.stage.removeChild(collection.container);
      collection.drawn = false;
      onComplete();
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        this.app.stage.removeChild(collection.container);
        collection.drawn = false;
        onComplete();
      }
    });
    tl.to(collection.container, { alpha: 0 });
  }

  private async loadScaleSprites(): Promise<ScaleSpriteCollection> {
    const bodyAsset = await Assets.load('/scale-body.png');
    const handleAsset = await Assets.load('/scale-handle.png');
    const bowlAsset = await Assets.load('/scale-bowl.png');
    const fireSpriteSheet = await Assets.load('/flame.json');

    const body = Sprite.from(bodyAsset);
    const handle = Sprite.from(handleAsset);
    const leftBowl = Sprite.from(bowlAsset);
    const rightBowl = Sprite.from(bowlAsset);
    const leftFire = new AnimatedSprite(fireSpriteSheet.animations['flaming']);
    const rightFire = new AnimatedSprite(fireSpriteSheet.animations['flaming']);

    const invertFilter = new ColorMatrixFilter();
    invertFilter.matrix = [-1, 0, 0, 0, 1, 0, -1, 0, 0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 1, 0];
    leftFire.filters = [invertFilter];

    const container = new Container();
    container.addChild(handle);
    container.addChild(body);
    container.addChild(leftBowl);
    container.addChild(rightBowl);
    container.addChild(leftFire);
    container.addChild(rightFire);

    body.origin = { x: 31, y: 12 };
    handle.origin = { x: 31, y: 12 };
    leftBowl.origin = { x: 31, y: 27 };
    rightBowl.origin = { x: 31, y: 27 };
    leftFire.origin = { x: 31, y: 27 };
    rightFire.origin = { x: 31, y: 27 };

    leftBowl.position = { x: -20, y: 0 };
    rightBowl.position = { x: 21, y: 0 };
    leftFire.position = { x: -20, y: 0 };
    rightFire.position = { x: 21, y: 0 };

    container.scale = 5.0;
    container.x = (this.app.canvas.width - container.width) / 2;

    leftFire.animationSpeed = 0.25;
    rightFire.animationSpeed = 0.25;
    leftFire.scale = 0.3;
    rightFire.scale = 0.3;
    leftFire.alpha = 0.7;
    rightFire.alpha = 0.7;

    leftFire.play();
    rightFire.play();

    return {
      body,
      handle,
      leftBowl,
      rightBowl,
      leftFire,
      rightFire,
      container,
      drawn: false
    };
  }
}
