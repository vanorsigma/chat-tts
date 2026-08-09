import { getOverlayConfig } from '../constants';
import { PEOPLE_WHO_CHECKED_IN } from '../commands/middleware';
import { GLOBAL_PROVIDER_REGISTRY } from './providers';
import {
  apiBuy,
  apiSell,
  apiGrantPoints,
  apiGetHoldings,
  type BuyResponse,
  type SellResponse,
  type GrantResponse,
  type HoldingInfo
} from '$lib/api/stock-market';
import { getPointsForUser } from '$lib/api/points';

export class StockMarketError extends Error {}

function currentPriceOrThrow(stock: string): number {
  const price = GLOBAL_PROVIDER_REGISTRY.get(stock)?.current;
  if (!price || price <= 0) {
    throw new StockMarketError(`Stock not available: ${stock}`);
  }
  return price;
}

function currentPriceOrDefault(stock: string): number | null {
  const price = GLOBAL_PROVIDER_REGISTRY.get(stock)?.current;
  return price && price > 0 ? price : null;
}

type ScoredHolding = HoldingInfo & { _profitScore: number };

function scoreHoldings(holdings: HoldingInfo[]): ScoredHolding[] {
  return holdings
    .map((h) => {
      const price = currentPriceOrDefault(h.stock);
      const profit =
        price !== null ? ((price - h.buyPrice) / h.buyPrice) * h.investedPoints : -Infinity;
      return { ...h, _profitScore: profit };
    })
    .sort((a, b) => b._profitScore - a._profitScore);
}

export interface UserHoldings {
  holdings: HoldingInfo[];
}

export class StockMarket {
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

  approvedStocks(): string[] {
    return getOverlayConfig().stockMarketConfig.approvedStocks;
  }

  async buy(
    user: string,
    stock: string,
    points: number,
    skipChance = false,
    overpay = 0,
    check = false
  ): Promise<BuyResponse> {
    if (!this.approvedStocks().includes(stock)) {
      throw new StockMarketError(`Unknown stock: ${stock}`);
    }

    const price = currentPriceOrThrow(stock);
    const cfg = getOverlayConfig().stockMarketConfig;

    console.log(
      `[stock-market] buy request: user=${user} stock=${stock} points=${points} price=${price} overpay=${overpay}`
    );

    const result = await apiBuy({
      username: user,
      stock,
      points,
      price,
      steepness: cfg.buyFailSteepness,
      overpay,
      overpayFactor: cfg.overpayFactor,
      skipChance,
      checkedInUsers: PEOPLE_WHO_CHECKED_IN,
      check
    });
    this.notify();
    return result;
  }

  async buyAll(user: string, stock: string, skipChance = false): Promise<BuyResponse> {
    const points = (await getPointsForUser(user)) ?? 0;
    if (points <= 0) {
      return { ok: false, error: 'No points to invest' };
    }
    return this.buy(user, stock, points, skipChance);
  }

  async sell(user: string, stock?: string): Promise<SellResponse> {
    const raw = await apiGetHoldings(user);
    let holdings = raw.holdings;
    if (stock) {
      holdings = holdings.filter((h) => h.stock === stock);
    }

    if (holdings.length === 0) {
      return { ok: false, error: 'No holdings to sell.' };
    }

    const scored = scoreHoldings(holdings);
    const top = scored[0];
    const price = currentPriceOrDefault(top.stock);
    if (price === null) {
      return { ok: false, error: `Stock not available: ${top.stock}` };
    }

    console.log(
      `[stock-market] sell request: user=${user} id=${top.id} stock=${top.stock} price=${price}`
    );

    const result = await apiSell({
      username: user,
      holdings: [{ id: top.id, price }]
    });
    this.notify();
    return result;
  }

  async sellAll(user: string, stock?: string): Promise<SellResponse> {
    const raw = await apiGetHoldings(user);
    let holdings = raw.holdings;
    if (stock) {
      holdings = holdings.filter((h) => h.stock === stock);
    }

    if (holdings.length === 0) {
      return { ok: false, error: 'No holdings to sell.' };
    }

    const sales = holdings.map((h) => {
      const price = currentPriceOrDefault(h.stock);
      if (price === null) {
        throw new StockMarketError(`Stock not available: ${h.stock}`);
      }
      return { id: h.id, price };
    });

    console.log(
      `[stock-market] sellAll request: user=${user} count=${sales.length} stock=${stock ?? 'all'}`
    );

    const result = await apiSell({ username: user, holdings: sales });
    this.notify();
    return result;
  }

  async sellAmount(user: string, stock: string | undefined, amount: number): Promise<SellResponse> {
    const raw = await apiGetHoldings(user);
    let holdings = raw.holdings;
    if (stock) {
      holdings = holdings.filter((h) => h.stock === stock);
    }

    if (holdings.length === 0) {
      return { ok: false, error: 'No holdings to sell.' };
    }

    const scored = scoreHoldings(holdings);
    const top = scored[0];
    const price = currentPriceOrDefault(top.stock);
    if (price === null) {
      return { ok: false, error: `Stock not available: ${top.stock}` };
    }

    const sellAmt = Math.min(amount, top.investedPoints);

    console.log(
      `[stock-market] sellAmount request: user=${user} id=${top.id} stock=${top.stock} amount=${sellAmt} price=${price}`
    );

    const result = await apiSell({
      username: user,
      holdings: [{ id: top.id, price, amount: sellAmt }]
    });
    this.notify();
    return result;
  }

  async grantPoints(user: string, stock: string, points: number): Promise<GrantResponse> {
    const price = currentPriceOrThrow(stock);

    console.log(
      `[stock-market] grant request: user=${user} stock=${stock} points=${points} price=${price}`
    );

    const result = await apiGrantPoints({
      username: user,
      stock,
      points,
      price
    });
    this.notify();
    return result;
  }

  async checkin(user: string): Promise<void> {
    const cfg = getOverlayConfig().stockMarketConfig;
    for (const stock of this.approvedStocks()) {
      await this.grantPoints(user, stock, cfg.checkinGrantPoints);
    }
    this.notify();
  }

  async getHoldings(user: string): Promise<UserHoldings> {
    const raw = await apiGetHoldings(user);

    const holdings: HoldingInfo[] = raw.holdings.map((h) => {
      const price = currentPriceOrDefault(h.stock);
      const marketValue = price ? Math.round(h.investedPoints * (price / h.buyPrice)) : null;
      const profit =
        price !== null ? Math.round(((price - h.buyPrice) / h.buyPrice) * h.investedPoints) : null;

      return {
        ...h,
        currentPrice: price,
        marketValue: marketValue ? Math.round(marketValue) : null,
        profit
      };
    });

    return { holdings };
  }
}

export const GLOBAL_STOCK_MARKET = new StockMarket();
