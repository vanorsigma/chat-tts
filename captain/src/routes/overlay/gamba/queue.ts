import type { GambaContext, GambaItem } from './gamba';
import { DEFAULT_GAMBA_ITEMS, pickWeighted } from './gamba';
import { gambaStore } from './gamba.svelte';

interface QueuedSpin {
  ctx: GambaContext;
  items: GambaItem[];
  multiplier: number;
}

const queue: QueuedSpin[] = [];
let busy = false;

export function enqueueGambaSpin(
  ctx: GambaContext,
  multiplier = 1,
  items = DEFAULT_GAMBA_ITEMS
): void {
  queue.push({ ctx, items, multiplier });
  if (!busy) {
    processNext();
  }
}

export function getQueueLength(): number {
  return queue.length;
}

function processNext() {
  if (queue.length === 0) {
    busy = false;
    return;
  }
  busy = true;
  const spin = queue.shift()!;
  const scaledItems = spin.items.map((i) => i.scaledBy(spin.multiplier));
  const item = pickWeighted(scaledItems);

  const onDone = () => {
    busy = false;
    processNext();
  };

  gambaStore.spin(scaledItems, item, spin.ctx, onDone);
}
