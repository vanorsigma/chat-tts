import type { OverlayDispatchers } from '../dispatcher';
import { GLOBAL_STOCK_MARKET } from '../stock/market';
import { getPointsForUser, setPointsForUser } from '$lib/api/points';
import { properRandom } from '../utils';

export interface GambaContext {
  dispatcher: OverlayDispatchers;
  channelId: string;
  username: string;
}

export abstract class GambaItem {
  abstract readonly label: string;
  abstract readonly weight: number;

  abstract onWin(ctx: GambaContext): void | Promise<void>;
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
  readonly label: string;
  readonly weight: number;
  readonly amount: number;

  constructor(label: string, weight: number, amount: number) {
    super();
    this.label = label;
    this.weight = weight;
    this.amount = amount;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const points = (await getPointsForUser(ctx.username)) ?? 0;
    await setPointsForUser(ctx.username, points + this.amount);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} won ${this.amount} meowDollars from the gamba wheel!`
    );
  }
}

export class TakePointsItem extends GambaItem {
  readonly label: string;
  readonly weight: number;
  readonly amount: number;

  constructor(label: string, weight: number, amount: number) {
    super();
    this.label = label;
    this.weight = weight;
    this.amount = amount;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    const points = (await getPointsForUser(ctx.username)) ?? 0;
    await setPointsForUser(ctx.username, Math.max(0, points - this.amount));
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} lost ${this.amount} meowDollars to the gamba wheel...`
    );
  }
}

export class GiveSharesItem extends GambaItem {
  readonly label: string;
  readonly weight: number;
  readonly stock: string;
  readonly amount: number;

  constructor(label: string, weight: number, stock: string, amount: number) {
    super();
    this.label = label;
    this.weight = weight;
    this.stock = stock;
    this.amount = amount;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    GLOBAL_STOCK_MARKET.grantShares(ctx.username, this.stock, this.amount);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} won ${this.amount} shares of ${this.stock} from the gamba wheel!`
    );
  }
}

export class TriggerRedeemItem extends GambaItem {
  readonly label: string;
  readonly weight: number;
  readonly redeemLabel: string;
  private callback: (ctx: GambaContext) => void | Promise<void>;

  constructor(
    label: string,
    weight: number,
    redeemLabel: string,
    callback: (ctx: GambaContext) => void | Promise<void>
  ) {
    super();
    this.label = label;
    this.weight = weight;
    this.redeemLabel = redeemLabel;
    this.callback = callback;
  }

  async onWin(ctx: GambaContext): Promise<void> {
    await this.callback(ctx);
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      `@${ctx.username} triggered ${this.redeemLabel} from the gamba wheel!`
    );
  }
}

export const DEFAULT_GAMBA_ITEMS: GambaItem[] = [
  new GivePointsItem('+50 meowDollars', 30, 50),
  new GivePointsItem('+100 meowDollars', 20, 100),
  new GivePointsItem('+500 meowDollars', 5, 500),
  new GivePointsItem('+1000 meowDollars', 2, 1000),
  new TakePointsItem('-50 meowDollars', 25, 50),
  new TakePointsItem('-200 meowDollars', 10, 200),
  new TakePointsItem('-500 meowDollars', 5, 500),
  new GiveSharesItem('+10 HEART shares', 3, 'HEART', 10)
];
