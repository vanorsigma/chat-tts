import type { GambaItem, GambaContext } from './gamba';
import { createPubSub, type Unsubscribe } from '../stores/pubsub';

export interface GambaWheelState {
  spinning: boolean;
  items: GambaItem[];
  result: GambaItem | null;
  context: GambaContext | null;
  onDone?: () => void;
}

function createGambaStore() {
  let state = $state<GambaWheelState>({
    spinning: false,
    items: [],
    result: null,
    context: null
  });

  const pub = createPubSub<GambaWheelState>();

  function spin(items: GambaItem[], result: GambaItem, ctx: GambaContext, onDone?: () => void) {
    state = { spinning: true, items, result, context: ctx, onDone };
    pub.notify(state);
  }

  function clear() {
    state = { spinning: false, items: [], result: null, context: null };
    pub.notify(state);
  }

  return {
    get state() {
      return state;
    },
    subscribe: (fn: (value: GambaWheelState) => void): Unsubscribe => {
      fn(state);
      return pub.subscribe(fn);
    },
    spin,
    clear
  };
}

export const gambaStore = createGambaStore();
