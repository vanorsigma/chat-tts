import type { StockProvider, Unsubscribe } from './providers';
import { GLOBAL_PROVIDER_REGISTRY } from './providers';
import { createPubSub } from '../stores/pubsub';
import { ReconnectingWebSocket } from '../stores/reconnectingWs';

function emitNow<T>(initial: T) {
  const pub = createPubSub<T>();
  let _value = initial;
  return {
    get value() { return _value; },
    set value(v: T) { _value = v; pub.notify(v); },
    subscribe: (fn: (v: T) => void): Unsubscribe => {
      fn(_value);
      return pub.subscribe(fn);
    }
  };
}

interface StockProviderBaseOpts {
  symbol: string;
  label: string;
  icon?: string;
  color?: string;
}

export interface ConstantProviderOpts extends StockProviderBaseOpts {
  value: number;
}

function baseProvider(opts: StockProviderBaseOpts, overrides: Partial<StockProvider>): StockProvider {
  const provider: StockProvider = {
    symbol: opts.symbol,
    label: opts.label,
    icon: opts.icon,
    color: opts.color,
    get current() { return 0; },
    subscribe: () => () => {},
    ...overrides
  };
  GLOBAL_PROVIDER_REGISTRY.register(provider);
  return provider;
}

export function createConstantProvider(opts: ConstantProviderOpts): StockProvider {
  const store = emitNow(opts.value);
  return baseProvider(opts, {
    get current() { return store.value; },
    subscribe: store.subscribe
  });
}

export interface HttpPollingProviderOpts extends StockProviderBaseOpts {
  url: string;
  intervalMs?: number;
  extract: (json: unknown) => number;
}

export function createHttpPollingProvider(opts: HttpPollingProviderOpts): StockProvider {
  const store = emitNow(0);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function poll() {
    try {
      const res = await fetch(opts.url);
      const json = await res.json();
      store.value = opts.extract(json);
    } catch { /* ignore */ }
  }

  return baseProvider(opts, {
    get current() { return store.value; },
    subscribe: (fn) => {
      const unsub = store.subscribe(fn);
      if (!intervalId) {
        poll();
        intervalId = setInterval(poll, opts.intervalMs ?? 30000);
      }
      return () => {
        unsub();
        if (intervalId !== null) {
          clearInterval(intervalId);
          intervalId = null;
        }
      };
    }
  });
}

export interface WebSocketProviderOpts extends StockProviderBaseOpts {
  url: string;
  extract: (raw: string) => number | null;
}

export function createWebSocketProvider(opts: WebSocketProviderOpts): StockProvider {
  const store = emitNow(0);
  const ws = new ReconnectingWebSocket(opts.url);
  ws.onmessage = (raw) => {
    try {
      const val = opts.extract(raw);
      if (val !== null) store.value = val;
    } catch { /* ignore */ }
  };

  return baseProvider(opts, {
    get current() { return store.value; },
    subscribe: (fn) => {
      const unsub = store.subscribe(fn);
      return () => {
        unsub();
        ws.close();
      };
    }
  });
}

export interface ComputedProviderOpts extends StockProviderBaseOpts {
  compute: () => number;
}

export function createComputedProvider(opts: ComputedProviderOpts): StockProvider {
  return baseProvider(opts, {
    get current() { return opts.compute(); },
    subscribe: () => () => {}
  });
}
