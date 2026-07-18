import { getPointsForUser, setPointsForUser } from '$lib/api/points';
import { getOverlayConfig } from '../constants';

export class StockMarketError extends Error {}

export interface PendingOrder {
  id: string;
  user: string;
  stock: string;
  amount: number;
  price: number;
  timestamp: number;
}

interface Holding {
  shares: number;
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface PayoutInfo {
  user: string;
  stock: string;
  shares: number;
  payoutPerShare: number;
  total: number;
}

export interface OrderBookSnapshot {
  buys: PendingOrder[];
  sells: PendingOrder[];
}

export class StockMarket {
  private holdings = new Map<string, Map<string, Holding>>();
  private buyOrders = new Map<string, PendingOrder[]>();
  private sellOrders = new Map<string, PendingOrder[]>();
  private lastSellPrice = new Map<string, number>();
  private isClosed = false;
  private subscribers: Array<() => void> = [];

  subscribe(fn: () => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }

  private notify() {
    for (const sub of this.subscribers) sub();
  }

  get closed(): boolean {
    return this.isClosed;
  }

  grantShares(user: string, stock: string, amount: number): void {
    if (this.isClosed) throw new StockMarketError('The market is closed');
    this.ensureStock(stock);
    this._grantShares(user, stock, amount);
    this.notify();
  }

  checkin(user: string): void {
    const stocks = this.allStockSymbols();
    for (const stock of stocks) {
      this._grantShares(user, stock, getOverlayConfig().stockMarket.checkinShares);
    }
  }

  private allStockSymbols(): string[] {
    const symbols = new Set<string>();
    for (const key of this.buyOrders.keys()) symbols.add(key);
    for (const key of this.sellOrders.keys()) symbols.add(key);
    for (const [user, map] of this.holdings) {
      for (const sym of map.keys()) symbols.add(sym);
    }
    return symbols.size > 0 ? Array.from(symbols) : ['HEART'];
  }

  private ensureStock(stock: string): void {
    if (!this.buyOrders.has(stock)) this.buyOrders.set(stock, []);
    if (!this.sellOrders.has(stock)) this.sellOrders.set(stock, []);
  }

  private getHoldings(user: string, stock: string): number {
    return this.holdings.get(user)?.get(stock)?.shares ?? 0;
  }

  private _grantShares(user: string, stock: string, amount: number): void {
    if (!this.holdings.has(user)) this.holdings.set(user, new Map());
    const userMap = this.holdings.get(user)!;
    const existing = userMap.get(stock);
    userMap.set(stock, { shares: (existing?.shares ?? 0) + amount });
  }

  private removeShares(user: string, stock: string, amount: number): void {
    const userMap = this.holdings.get(user);
    if (!userMap) throw new StockMarketError('No holdings for user');
    const holding = userMap.get(stock);
    if (!holding || holding.shares < amount) throw new StockMarketError('Not enough shares');
    holding.shares -= amount;
    if (holding.shares <= 0) userMap.delete(stock);
  }

  async buy(
    user: string,
    stock: string,
    amount: number,
    price: number
  ): Promise<{ matched: number; placed: PendingOrder | null; instant: boolean }> {
    if (this.isClosed) throw new StockMarketError('The market is closed');
    this.ensureStock(stock);

    const totalCost = amount * price;

    let buyerBalance = (await getPointsForUser(user)) ?? 0;
    if (buyerBalance < totalCost) throw new StockMarketError('Insufficient points');

    let remaining = amount;
    let matched = 0;

    const sells = this.sellOrders.get(stock)!;
    const matchedSells: PendingOrder[] = [];

    for (const sell of sells) {
      if (remaining <= 0) break;
      if (sell.price <= price) {
        const matchAmount = Math.min(remaining, sell.amount);
        const matchCost = matchAmount * sell.price;

        const sellerPoints = (await getPointsForUser(sell.user)) ?? 0;
        buyerBalance -= matchCost;
        await setPointsForUser(user, buyerBalance);
        await setPointsForUser(sell.user, sellerPoints + matchCost);

        this._grantShares(user, stock, matchAmount);
        this.removeShares(sell.user, stock, matchAmount);
        this.lastSellPrice.set(stock, sell.price);

        sell.amount -= matchAmount;
        remaining -= matchAmount;
        matched += matchAmount;

        if (sell.amount <= 0) matchedSells.push(sell);
      }
    }

    this.sellOrders.set(
      stock,
      sells.filter((s) => !matchedSells.includes(s))
    );

    let instant = false;
    let placed: PendingOrder | null = null;

    if (remaining > 0) {
      const chance = getOverlayConfig().stockMarket.instantSuccessChance;
      if (Math.random() < chance) {
        const instantCost = remaining * price;
        buyerBalance -= instantCost;
        await setPointsForUser(user, buyerBalance);
        this._grantShares(user, stock, remaining);
        this.lastSellPrice.set(stock, price);
        instant = true;
        matched += remaining;
        remaining = 0;
      } else {
        const order: PendingOrder = {
          id: generateId(),
          user,
          stock,
          amount: remaining,
          price,
          timestamp: Date.now()
        };
        this.buyOrders.get(stock)!.push(order);
        placed = order;
      }
    }

    this.notify();
    return { matched, placed, instant };
  }

  async sell(
    user: string,
    stock: string,
    amount: number,
    price: number
  ): Promise<{ matched: number; placed: PendingOrder | null; instant: boolean }> {
    if (this.isClosed) throw new StockMarketError('The market is closed');
    this.ensureStock(stock);

    const holdings = this.getHoldings(user, stock);
    if (holdings < amount) throw new StockMarketError('Not enough shares');

    let remaining = amount;
    let matched = 0;

    const buys = this.buyOrders.get(stock)!;
    const matchedBuys: PendingOrder[] = [];

    for (const buy of buys) {
      if (remaining <= 0) break;
      if (buy.price >= price) {
        const matchAmount = Math.min(remaining, buy.amount);
        const matchCost = matchAmount * price;

        const buyerPoints = (await getPointsForUser(buy.user)) ?? 0;
        const sellerPoints = (await getPointsForUser(user)) ?? 0;
        await setPointsForUser(buy.user, buyerPoints + matchCost);
        await setPointsForUser(user, sellerPoints + matchCost);

        this.removeShares(user, stock, matchAmount);
        this._grantShares(buy.user, stock, matchAmount);
        this.lastSellPrice.set(stock, price);

        buy.amount -= matchAmount;
        remaining -= matchAmount;
        matched += matchAmount;

        if (buy.amount <= 0) matchedBuys.push(buy);
      }
    }

    this.buyOrders.set(
      stock,
      buys.filter((b) => !matchedBuys.includes(b))
    );

    let instant = false;
    let placed: PendingOrder | null = null;

    if (remaining > 0) {
      const chance = getOverlayConfig().stockMarket.instantSuccessChance;
      if (Math.random() < chance) {
        await setPointsForUser(user, (await getPointsForUser(user))! + remaining * price);
        this.removeShares(user, stock, remaining);
        this.lastSellPrice.set(stock, price);
        instant = true;
        matched += remaining;
        remaining = 0;
      } else {
        const order: PendingOrder = {
          id: generateId(),
          user,
          stock,
          amount: remaining,
          price,
          timestamp: Date.now()
        };
        this.sellOrders.get(stock)!.push(order);
        placed = order;
      }
    }

    this.notify();
    return { matched, placed, instant };
  }

  userPositions(user: string): {
    shares: Record<string, number>;
    buyOrders: PendingOrder[];
    sellOrders: PendingOrder[];
  } {
    const shares: Record<string, number> = {};
    const userHoldings = this.holdings.get(user);
    if (userHoldings) {
      for (const [stock, h] of userHoldings) {
        shares[stock] = h.shares;
      }
    }

    const buyOrders: PendingOrder[] = [];
    const sellOrders: PendingOrder[] = [];

    for (const orders of this.buyOrders.values()) {
      for (const o of orders) {
        if (o.user === user) buyOrders.push(o);
      }
    }
    for (const orders of this.sellOrders.values()) {
      for (const o of orders) {
        if (o.user === user) sellOrders.push(o);
      }
    }

    return { shares, buyOrders, sellOrders };
  }

  randomBuyOrders(n: number = 5): PendingOrder[] {
    const all: PendingOrder[] = [];
    for (const orders of this.buyOrders.values()) all.push(...orders);
    return this.shuffleTake(all, n);
  }

  randomSellOrders(n: number = 5): PendingOrder[] {
    const all: PendingOrder[] = [];
    for (const orders of this.sellOrders.values()) all.push(...orders);
    return this.shuffleTake(all, n);
  }

  private shuffleTake<T>(arr: T[], n: number): T[] {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }

  private async refundOrder(order: PendingOrder): Promise<void> {
    const p = (await getPointsForUser(order.user)) ?? 0;
    await setPointsForUser(order.user, p + order.amount * order.price);
  }

  async close(): Promise<PayoutInfo[]> {
    this.isClosed = true;
    const payouts: PayoutInfo[] = [];

    for (const [user, userMap] of this.holdings) {
      for (const [stock, h] of userMap) {
        const price =
          this.lastSellPrice.get(stock) ?? getOverlayConfig().stockMarket.endstreamDefaultPrice;
        const total = h.shares * price;
        const p = (await getPointsForUser(user)) ?? 0;
        await setPointsForUser(user, p + total);
        payouts.push({ user, stock, shares: h.shares, payoutPerShare: price, total });
      }
    }

    this.holdings.clear();

    for (const orders of this.buyOrders.values()) {
      for (const o of orders) await this.refundOrder(o);
    }
    for (const orders of this.sellOrders.values()) {
      for (const o of orders) {
        this._grantShares(o.user, o.stock, o.amount);
      }
    }

    this.buyOrders.clear();
    this.sellOrders.clear();
    this.notify();

    return payouts;
  }
}

export const GLOBAL_STOCK_MARKET = new StockMarket();
