import type { GambaContext, GambaItem } from './gamba';
import { DEFAULT_GAMBA_ITEMS, pickWeighted } from './gamba';
import { gambaStore } from './gamba.svelte';

interface QueuedSpin {
  ctx: GambaContext;
  items: GambaItem[];
}

let queue: QueuedSpin[] = [];
let busy = false;

export function enqueueGambaSpin(
  ctx: GambaContext,
  items?: GambaItem[]
): void {
  queue.push({ ctx, items: items ?? DEFAULT_GAMBA_ITEMS });
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
  const item = pickWeighted(spin.items);

  const onDone = () => {
    busy = false;
    processNext();
  };

  gambaStore.spin(spin.items, item, spin.ctx, onDone);
}
