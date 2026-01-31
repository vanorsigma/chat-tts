import type { ChatClient, ChatMessage } from '@twurple/chat';
import {
  Assets,
  Container,
  ObservablePoint,
  Sprite,
  Text,
  TextStyle,
  type Application,
  type PointData
} from 'pixi.js';
import gsap from 'gsap';
import { KARMA_MAP } from './constants';
import { karmaStore } from './stores.svelte';

const ANGLE_MIN = -Math.PI / 16;
const ANGLE_MAX = Math.PI / 16;

const MIN_KARMA = -2000;
const MAX_KARMA = 2000;

interface ScaleSpriteCollection {
  body: Sprite;
  leftBowl: Sprite;
  rightBowl: Sprite;
  handle: Sprite;

  container: Container;
  drawn: boolean;
}

interface ScaleSpriteAdjustmentNumbers {
  handleRotation: number;
  leftBowlPosition: PointData;
  rightBowlPosition: PointData;
}

function scurve(x: number, k = 20) {
  const t = Math.max(0.0, Math.min(x, 1.0));
  return Math.pow(t, k) / (Math.pow(t, k) + Math.pow(1 - t, k));
}

export class KarmaContainer {
  private app: Application;
  private currentKarma: number = 0;
  private updateGlobalKarma: (karma: number) => void;
  private collection: ScaleSpriteCollection | null = null;
  private showTimeout: NodeJS.Timeout | null = null;

  constructor(twitch: ChatClient, app: Application, updateGlobalKarma: (karma: number) => void) {
    this.app = app;
    this.updateGlobalKarma = updateGlobalKarma;
    karmaStore.subscribe((karma, message) => {
      this.currentKarma = karma;
      if (message) {
        this.updateScale(karma, message);
      }
    });
    this.initLater(twitch);
  }

  get position(): ObservablePoint | undefined {
    return this.collection?.container.position;
  }

  set position(pointData: PointData) {
    if (this.collection) this.collection.container.position = pointData;
  }

  get width(): number | undefined {
    return this.collection?.container.width;
  }

  get height(): number | undefined {
    return this.collection?.container.height;
  }

  async initLater(twitch: ChatClient) {
    twitch.onMessage((_1, _2, _3, msg) => this.onMessage(msg));
    this.collection = await this.loadScaleSprites();
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

  private async updateScale(karmaValue: number, message: string) {
    if (this.collection == null) return;
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
    }

    const adjustmentNumber = this.calculateAdjustmentNumbers(this.currentKarma, this.collection);
    this.moveToAdjustmentNumbers(this.collection, adjustmentNumber, true);
    this.drawCollection(this.collection, true);
    const totalKarmaText = new Text();
    totalKarmaText.text = `${this.currentKarma.toFixed(2)}`;
    totalKarmaText.style = new TextStyle({
      fontSize: 72,
      stroke: 'black',
      fill: 'white'
    });

    totalKarmaText.x =
      this.collection.container.x + this.collection.container.width / 4 - totalKarmaText.width / 2;
    totalKarmaText.y = this.collection.container.y + this.collection.container.height;

    const isNewKarmaPositive = karmaValue > 0 ? true : false;
    const newKarmaText = new Text();
    newKarmaText.text = `${isNewKarmaPositive ? '+' : ''} ${karmaValue.toFixed(2)}`;
    newKarmaText.style = new TextStyle({
      fontSize: 54,
      stroke: 'black',
      fill: isNewKarmaPositive ? 'green' : 'red'
    });

    newKarmaText.x = totalKarmaText.x;
    newKarmaText.y = totalKarmaText.y + totalKarmaText.height;

    // TODO: too lazy
    // const messageText = new Text();
    // messageText.text = message.slice(0, 20);
    // messageText.style = new TextStyle({
    //   fontSize: 18,
    //   fill: 'blue'
    // });

    this.app.stage.addChild(totalKarmaText);
    this.app.stage.addChild(newKarmaText);
    // this.app.stage.addChild(messageText);

    this.showTimeout = setTimeout(() => {
      this.undrawCollection(this.collection!, true, () => this.resetScale());
    }, 5000);

    // independent timeout for the texts
    setTimeout(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.app.stage.removeChild(newKarmaText);
          this.app.stage.removeChild(totalKarmaText);
          // this.app.stage.removeChild(messageText);
        }
      });
      tl.to(newKarmaText, { opacity: 0 }).to(totalKarmaText, { opacity: 0 }, '<');
      // .to(messageText, { opacity: 0 }, '<');
    }, 5000);
  }

  private moveScaleBowlByAngle(sprite: Sprite, angle: number, side: 'LEFT' | 'RIGHT'): PointData {
    const origX = sprite.x;
    const origY = sprite.y;

    // NOTE: magic adjustment numbers to make it look right
    const adjustment = (angle / (ANGLE_MAX - ANGLE_MIN)) * 6;

    switch (side) {
      case 'LEFT':
        return {
          x: origX * Math.cos(angle) - origY * Math.sin(angle) - adjustment,
          y: origY * Math.cos(angle) + origX * Math.sin(angle)
        };
      case 'RIGHT':
        return {
          x: origX * Math.cos(angle) + origY * Math.sin(angle) + adjustment,
          y: origY * Math.cos(angle) - origX * Math.sin(angle)
        };
    }
  }

  private calculateAdjustmentNumbers(
    progress: number,
    collection: ScaleSpriteCollection,
    minProgress: number = MIN_KARMA,
    maxProgress: number = MAX_KARMA
  ): ScaleSpriteAdjustmentNumbers {
    minProgress = Math.trunc(minProgress);
    maxProgress = Math.trunc(maxProgress);

    const clampedProgress = Math.max(Math.min(progress, maxProgress), minProgress);

    const currentAngle = collection.handle.rotation;

    let ratio = (clampedProgress - minProgress) / (maxProgress - minProgress);
    ratio = scurve(ratio); // put ratio on s-curve

    const targetAngle = ratio * (ANGLE_MAX - ANGLE_MIN) + ANGLE_MIN;

    // move the scale using some trig
    const leftTargetPosition = this.moveScaleBowlByAngle(
      collection.leftBowl,
      targetAngle - currentAngle,
      'LEFT'
    );
    const rightTargetPosition = this.moveScaleBowlByAngle(
      collection.rightBowl,
      currentAngle - targetAngle,
      'RIGHT'
    );

    return {
      handleRotation: targetAngle,
      leftBowlPosition: leftTargetPosition,
      rightBowlPosition: rightTargetPosition
    };
  }

  private resetScale() {
    if (this.collection === null) return;
    const positionCalc = this.calculateAdjustmentNumbers(0, this.collection);
    this.moveToAdjustmentNumbers(this.collection!, positionCalc);
  }

  private moveToAdjustmentNumbers(
    collection: ScaleSpriteCollection,
    target: ScaleSpriteAdjustmentNumbers,
    animated: boolean = false
  ) {
    // TODO: use animation, but for now we just teleport
    if (animated) {
      const tl = gsap.timeline({ defaults: { ease: 'elastic.out(2)' } });
      tl.to(collection.handle, { rotation: target.handleRotation, delay: 1 })
        .to(
          collection.leftBowl,
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
    const leftBowlAsset = await Assets.load('/scale-bowl.png');
    const rightBowlAsset = await Assets.load('/scale-bowl.png');

    const body = Sprite.from(bodyAsset);
    const handle = Sprite.from(handleAsset);
    const leftBowl = Sprite.from(leftBowlAsset);
    const rightBowl = Sprite.from(rightBowlAsset);

    // positions the scale in the neutral position
    const container = new Container();
    container.addChild(handle);
    container.addChild(body);
    container.addChild(leftBowl);
    container.addChild(rightBowl);

    body.origin = { x: 31, y: 12 };
    handle.origin = { x: 31, y: 12 };
    leftBowl.origin = { x: 31, y: 27 };
    rightBowl.origin = { x: 31, y: 27 };

    leftBowl.position = { x: -20, y: 0 };
    rightBowl.position = { x: 21, y: 0 };

    container.scale = 5.0;
    container.x = (this.app.canvas.width - container.width) / 2;

    return {
      body,
      handle,
      leftBowl,
      rightBowl,
      container,
      drawn: false
    };
  }
}
