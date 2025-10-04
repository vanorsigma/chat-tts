import { Heartrate } from './heartrate';

const BASICALLY_ZERO = 0.0000000000001;

interface UserStockInformation {
  user: string;
  currency: number;
  current_heartrate: number;
}

// Only sent when the sotck market closes
export interface UserReturns {
  user: string;
  currency: number;
}

// TODO: add timestamp

export class HeartrateStockMarketError extends Error {}

/**
 * The heart rate stock market. When created, it is opened implicitly
 */
export class HeartrateStockMarket {
  private hr: Heartrate | null = null;
  private maximum_heartrates = 500;
  private heartrate_history = new Array<number>();

  private unsubcribe_hr: (() => void) | null = null;

  private subscribers: Array<(heartrates: Array<number>) => void> = new Array();

  private stocks = new Map<string, UserStockInformation>();

  private is_closed = false;

  subscribe(fn: (heartrates: Array<number>) => void): () => void {
    this.subscribers.push(fn);
    fn(this.heartrates);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }

  setMaximumHeartrates(maximum_heartrates: number): void {
    this.maximum_heartrates = maximum_heartrates;
  }

  setHeartrateObject(hr: Heartrate): void {
    if (this.unsubcribe_hr) {
      this.unsubcribe_hr();
      this.unsubcribe_hr = null;
    }

    this.hr = hr;
    this.unsubcribe_hr = this.hr.subscribe(this.heartrate_subscriber.bind(this));
  }

  private get currentHeartrate(): number | null {
    if (this.heartrate_history.length === 0) {
      console.error('Tried to invest when there is no heartrate data');
      return null;
    }

    return this.heartrate_history.at(this.heartrate_history.length - 1)!;
  }

  invest(user: string, currency: number): void {
    if (this.is_closed) throw new HeartrateStockMarketError('The stock market is closed!');

    if (this.heartrate_history.length === 0) {
      console.error('Tried to invest when there is no heartrate data');
      return;
    }

    if (currency <= 0) {
      console.error('Tried to invest negative amount');
      throw new HeartrateStockMarketError('You cannot invest a negative amount');
    }

    const existingStock = this.stocks.get(user);
    let newCurrency = currency;
    if (existingStock) newCurrency = this.get_current_price_for(user)! + currency;

    this.stocks.set(user, {
      currency: newCurrency,
      current_heartrate: this.currentHeartrate!,
      user
    });
  }

  uninvest(user: string, currency: number): void {
    if (this.is_closed) throw new HeartrateStockMarketError('The stock market is closed!');

    if (currency <= 0) {
      console.error('Tried to invest negative amount');
      throw new HeartrateStockMarketError('You cannot invest a negative amount');
    }

    const stock = this.stocks.get(user);
    if (!stock) {
      console.error('Tried to uninvest when there is no stock for user');
      throw new HeartrateStockMarketError('You have no existing stock');
    }

    const currentCurrency = this.get_current_price_for(user)!;

    if (currentCurrency === null) {
      console.error('wifjaowie');
      throw new HeartrateStockMarketError('Nothing in stock market grrr');
    }

    if (currentCurrency <= currency) {
      console.error('Tried to uninvest more than how much the user owns');
      throw new HeartrateStockMarketError('You cannot withdraw more than how much u own');
    }

    const newCurrency = currentCurrency - currency;

    if (newCurrency < BASICALLY_ZERO) {
      this.stocks.delete(user);
    } else {
      this.stocks.set(user, {
        currency: currentCurrency - currency,
        current_heartrate: this.currentHeartrate!,
        user
      });
    }
  }

  close(): UserReturns[] {
    // closes the stock market; i.e., everyone uninvests at this point
    this.is_closed = true;
    const returns = Array.from(
      this.stocks.keys().map((user) => {
        const price = this.get_current_price_for(user);
        return {
          user,
          currency: price
        } as UserReturns;
      })
    );

    this.stocks.clear();
    return returns;
  }

  get_current_price_for(user: string): number | null {
    if (!this.stocks.has(user)) return null;

    if (!this.currentHeartrate) return null;

    const stock = this.stocks.get(user);

    if (!stock) return null;

    const currency = (this.currentHeartrate / stock.current_heartrate) * stock.currency;
    if (currency < BASICALLY_ZERO) {
      // basically 0
      this.stocks.delete(user);
    } else {
      this.stocks.set(user, {
        currency,
        current_heartrate: this.currentHeartrate,
        user
      });
    }
    return currency;
  }

  private heartrate_subscriber(value: number): void {
    this.heartrate_history.push(value);
    if (this.heartrate_history.length > this.maximum_heartrates) {
      this.heartrate_history = this.heartrate_history.slice(1);
    }

    this.subscribers.forEach((subber) => subber(this.heartrate_history.slice()));
  }

  get heartrates() {
    return this.heartrate_history.slice(0);
  }
}

export const GLOBAL_HEART_STOCK_MARKET = new HeartrateStockMarket();
