import { writable } from 'svelte/store';
import type { OverlayPositionsConfig } from '$lib/config';

export const DEFAULT_POSITIONS: OverlayPositionsConfig = {
  artistWidgetX: 20,
  artistWidgetY: 20,
  rightPanelX: 1520,
  rightPanelY: 0,
  pinX: 760,
  pinY: 40
};

export const positionStore = writable<OverlayPositionsConfig>(DEFAULT_POSITIONS);
