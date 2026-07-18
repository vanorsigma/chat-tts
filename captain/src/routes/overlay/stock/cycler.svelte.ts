import { getOverlayConfig } from '../constants';
import { GLOBAL_PROVIDER_REGISTRY, type StockProvider } from './providers';
import { createPubSub, type Unsubscribe } from '../stores/pubsub';

export interface CyclerSnapshot {
  symbol: string;
  label: string;
  icon?: string;
  color?: string;
  current: number;
  history: number[];
}

export interface CyclerStore {
  subscribe: (fn: (snap: CyclerSnapshot) => void) => Unsubscribe;
  get snapshot(): CyclerSnapshot;
  start: () => void;
  stop: () => void;
  registerProvider: (provider: StockProvider) => void;
}

export function createCyclerStore(): CyclerStore {
  let currentIndex = 0;
  const historyMap = new Map<string, number[]>();
  const MAX_HISTORY = 500;
  let intervalId: ReturnType<typeof setInterval> | null = null;
  let currentSnapshot: CyclerSnapshot = {
    symbol: 'HEART',
    label: 'Heartrate',
    current: getOverlayConfig().model.initialHeartrate,
    history: []
  };

  const pub = createPubSub<CyclerSnapshot>();

  function notify() {
    pub.notify(currentSnapshot);
  }

  function subscribe(fn: (snap: CyclerSnapshot) => void): Unsubscribe {
    fn(currentSnapshot);
    return pub.subscribe(fn);
  }

  function advance() {
    const providers = GLOBAL_PROVIDER_REGISTRY.getAll();
    if (providers.length === 0) return;

    currentIndex = (currentIndex + 1) % providers.length;
    const provider = providers[currentIndex];
    const value = provider.current;

    let h = historyMap.get(provider.symbol);
    if (!h) {
      h = [];
      historyMap.set(provider.symbol, h);
    }
    h.push(value);
    if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);

    currentSnapshot = {
      symbol: provider.symbol,
      label: provider.label,
      icon: provider.icon,
      color: provider.color,
      current: value,
      history: [...h]
    };
    notify();
  }

  function registerProvider(provider: StockProvider) {
    provider.subscribe((value) => {
      let h = historyMap.get(provider.symbol);
      if (!h) {
        h = [];
        historyMap.set(provider.symbol, h);
      }
      h.push(value);
      if (h.length > MAX_HISTORY) h.splice(0, h.length - MAX_HISTORY);

      if (currentSnapshot.symbol === provider.symbol) {
        currentSnapshot = {
          ...currentSnapshot,
          icon: provider.icon,
          color: provider.color,
          current: value,
          history: [...h]
        };
        notify();
      }
    });
    advance();
  }

  function start() {
    const interval = getOverlayConfig().stockMarket.cycleIntervalMs;
    advance();
    intervalId = setInterval(advance, interval);
  }

  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    subscribe,
    get snapshot() {
      return currentSnapshot;
    },
    start,
    stop,
    registerProvider
  };
}

export function createAndStartCycler(): CyclerStore {
  const store = createCyclerStore();
  // Consumes everything in GLOBAL_PROVIDER_REGISTRY at call time.
  // Ensure stock/providers/index (or equivalent) is imported before this runs.
  for (const provider of GLOBAL_PROVIDER_REGISTRY.getAll()) {
    store.registerProvider(provider);
  }
  store.start();
  return store;
}
