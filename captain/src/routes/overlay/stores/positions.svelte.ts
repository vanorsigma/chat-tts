import { writable } from 'svelte/store';
import type { OverlayPositionsConfig } from '$lib/config';
import { defaultPositions } from '$lib/config/defaults';

export const DEFAULT_POSITIONS: OverlayPositionsConfig = defaultPositions;

export const positionStore = writable<OverlayPositionsConfig>(DEFAULT_POSITIONS);
