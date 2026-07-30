import type { OverlayDispatchers } from '../dispatcher';
import { GLOBAL_STOCK_MARKET } from '../stock/market';
import { getPointsForUser, setPointsForUser } from '$lib/api/points';
import { properRandom } from '../utils';
import { PEOPLE_WHO_CHECKED_IN, TOGGLE_EXPIRY } from '../commands/middleware';
import { addBitBoost } from '$lib/api/bits';
import { getOverlayConfig } from '../constants';

export interface CommandsLike {
  addUserBitBoost(username: string, bits: number): void;
  cooldowns: Map<string, number>;
  gambaUserCooldowns: Map<string, number>;
  buyUserCooldowns: Map<string, number>;
}

export interface GambaContext {
  dispatcher: OverlayDispatchers;
  channelId: string;
  username: string;
  userId?: string;
  isMod?: boolean;
  bet: number;
  commands?: CommandsLike;
}

export abstract class GambaItem {
  abstract readonly weight: number;

  abstract getLabel(): string;
  abstract onWin(ctx: GambaContext): void | Promise<void>;
  abstract scaledBy(factor: number): GambaItem;
}

export function pickWeighted(items: GambaItem[]): GambaItem {
  const totalWeight = items.reduce((sum, i) => sum + i.weight, 0);
  let roll = properRandom() * totalWeight;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

export class GivePointsItem extends GambaItem {
  readonly weight: number;
  readonly amount: number;

  constructor(weight: number, amount: number) {
    super();
    this.weight = weight;
    this.amount = amount;
  }

  getLabel(): string {
    return `+${this.amount} vanorDollars`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.amount * factor));
    return new GivePointsItem(this.weight, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const points = (await getPointsForUser(ctx.username)) ?? 0;
    await setPointsForUser(ctx.username, points + this.amount + ctx.bet);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} won ${this.amount} vanorDollars from the gamba wheel!`
    );
  }
}

export class TakePointsItem extends GambaItem {
  readonly weight: number;
  readonly amount: number;

  constructor(weight: number, amount: number) {
    super();
    this.weight = weight;
    this.amount = amount;
  }

  getLabel(): string {
    return `-${this.amount} vanorDollars`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.amount * factor));
    const weighted = Math.max(0, this.amount, Math.log(factor));
    return new TakePointsItem(weighted, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const points = (await getPointsForUser(ctx.username)) ?? 0;
    await setPointsForUser(ctx.username, Math.max(0, points - this.amount));
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} lost ${this.amount} vanorDollars to the gamba wheel...`
    );
  }
}

export class GiveStockGrantItem extends GambaItem {
  readonly weight: number;
  readonly stock: string;
  readonly points: number;

  constructor(weight: number, stock: string, points: number) {
    super();
    this.weight = weight;
    this.stock = stock;
    this.points = points;
  }

  getLabel(): string {
    return `+${this.points}VD ${this.stock}`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.points * factor));
    return new GiveStockGrantItem(this.weight, this.stock, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    await GLOBAL_STOCK_MARKET.grantPoints(ctx.username, this.stock, this.points);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} won ${this.points}VD worth of ${this.stock} from the gamba wheel!`
    );
  }
}

export class TriggerRedeemItem extends GambaItem {
  readonly weight: number;
  readonly redeemLabel: string;
  private callback: (ctx: GambaContext) => void | Promise<void>;

  constructor(
    weight: number,
    redeemLabel: string,
    callback: (ctx: GambaContext) => void | Promise<void>
  ) {
    super();
    this.weight = weight;
    this.redeemLabel = redeemLabel;
    this.callback = callback;
  }

  getLabel(): string {
    return this.redeemLabel;
  }

  scaledBy(_factor: number): GambaItem {
    return this;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    await this.callback(ctx);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} triggered ${this.redeemLabel} from the gamba wheel!`
    );
  }
}

export class TimeoutItem extends GambaItem {
  readonly weight: number;
  readonly durationSeconds: number;

  constructor(weight: number, durationSeconds: number) {
    super();
    this.weight = weight;
    this.durationSeconds = durationSeconds;
  }

  getLabel(): string {
    return `${this.durationSeconds}s timeout`;
  }

  scaledBy(factor: number): GambaItem {
    const weighted = Math.max(0, this.weight * Math.log(factor));
    return new TimeoutItem(weighted, this.durationSeconds);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    await ctx.dispatcher.timeoutUser(
      ctx.channelId,
      ctx.userId ?? ctx.username,
      'gamba wheel',
      this.durationSeconds,
      ctx.isMod
    );
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} got timed out for ${this.durationSeconds}s by the gamba wheel!`
    );
  }
}

export class GiveEveryonePointsItem extends GambaItem {
  readonly weight: number;
  readonly amount: number;

  constructor(weight: number, amount: number) {
    super();
    this.weight = weight;
    this.amount = amount;
  }

  getLabel(): string {
    return `+${this.amount} vanorDollars for everyone`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.amount * factor));
    return new GiveEveryonePointsItem(this.weight, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const users = PEOPLE_WHO_CHECKED_IN;
    await Promise.all(
      users.map(async (u) => {
        const pts = (await getPointsForUser(u)) ?? 0;
        await setPointsForUser(u, pts + this.amount);
      })
    );
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `Everyone got +${this.amount} vanorDollars from the gamba wheel!`
    );
  }
}

export class GiveEveryoneIncreasedChances extends GambaItem {
  readonly weight: number;
  readonly amount: number;

  constructor(weight: number, amount: number) {
    super();
    this.weight = weight;
    this.amount = amount;
  }

  getLabel(): string {
    return `+${this.amount} bit-boost for everyone`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.amount * factor));
    return new GiveEveryoneIncreasedChances(this.weight, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const users = PEOPLE_WHO_CHECKED_IN;
    await Promise.all(
      users.map(async (u) => {
        ctx.commands?.addUserBitBoost(u, this.amount);
        await addBitBoost(u, this.amount);
      })
    );
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `Everyone got +${this.amount} bit-boost from the gamba wheel!`
    );
  }
}

export class ResetAllCooldown extends GambaItem {
  readonly weight: number;

  constructor(weight: number) {
    super();
    this.weight = weight;
  }

  getLabel(): string {
    return 'Reset all cooldowns';
  }

  scaledBy(_factor: number): GambaItem {
    return this;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    ctx.commands?.cooldowns.clear();
    ctx.commands?.gambaUserCooldowns.clear();
    ctx.commands?.buyUserCooldowns.clear();
    for (const t of TOGGLE_EXPIRY.values()) clearTimeout(t);
    TOGGLE_EXPIRY.clear();
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `All overlay cooldowns reset by the gamba wheel! (-${getOverlayConfig().resetCooldown.cost}VD value)`
    );
  }
}

export class ResetUserCooldown extends GambaItem {
  readonly weight: number;

  constructor(weight: number) {
    super();
    this.weight = weight;
  }

  getLabel(): string {
    return 'Reset your cooldowns';
  }

  scaledBy(_factor: number): GambaItem {
    return this;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    ctx.commands?.gambaUserCooldowns.delete(ctx.username);
    ctx.commands?.buyUserCooldowns.delete(ctx.username);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username}'s cooldowns reset by the gamba wheel!`
    );
  }
}

export class GiveEveryoneStockGrantItem extends GambaItem {
  readonly weight: number;
  readonly stock: string;
  readonly points: number;

  constructor(weight: number, stock: string, points: number) {
    super();
    this.weight = weight;
    this.stock = stock;
    this.points = points;
  }

  getLabel(): string {
    return `+${this.points}VD ${this.stock} for everyone`;
  }

  scaledBy(factor: number): GambaItem {
    const scaled = Math.max(0, Math.round(this.points * factor));
    return new GiveEveryoneStockGrantItem(this.weight, this.stock, scaled);
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const users = PEOPLE_WHO_CHECKED_IN;
    await Promise.all(
      users.map((u) => GLOBAL_STOCK_MARKET.grantPoints(u, this.stock, this.points))
    );
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `Everyone got +${this.points}VD of ${this.stock} from the gamba wheel!`
    );
  }
}

export const DEFAULT_GAMBA_ITEMS: GambaItem[] = [
  new GivePointsItem(30, 50),
  new GivePointsItem(20, 100),
  new GivePointsItem(5, 500),
  new GivePointsItem(2, 1000),
  new TakePointsItem(25, 50),
  new TakePointsItem(10, 200),
  new TakePointsItem(5, 500),
  new TimeoutItem(5, 5),
  new GiveStockGrantItem(3, 'HEART', 100)
];

export const SUB_BITS_GAMBA_ITEMS: GambaItem[] = [
  new GivePointsItem(30, 50),
  new GivePointsItem(30, 50),
  new GiveStockGrantItem(3, 'HEART', 100),
  new GiveEveryonePointsItem(30, 500),
  new GiveEveryonePointsItem(30, 100),
  new GiveEveryoneStockGrantItem(3, 'HEART', 200),
  new GiveEveryoneIncreasedChances(10, 10),
  new ResetAllCooldown(5)
];

export const CAPTCHA_GAMBA_ITEMS: GambaItem[] = [
  new GivePointsItem(30, 50),
  new GivePointsItem(20, 100),
  new GivePointsItem(5, 500),
  new GivePointsItem(2, 1000),
  new ResetUserCooldown(10)
];
