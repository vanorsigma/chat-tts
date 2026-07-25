import { writable } from 'svelte/store';
import type { OverlayPositionsConfig } from '$lib/config';

export const DEFAULT_POSITIONS: OverlayPositionsConfig = {
  artistWidgetX: 20,
  artistWidgetY: 20,
  rightPanelX: 1520,
  rightPanelY: 0,
  pinX: 760,
  pinY: 40,
  wheelX: '50%',
  wheelY: '50%',
  wheelWidth: '90vmin',
  wheelHeight: '90vmin'
};

export const positionStore = writable<OverlayPositionsConfig>(DEFAULT_POSITIONS);
