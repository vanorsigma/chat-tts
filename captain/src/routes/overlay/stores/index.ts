import { createKarmaStore } from './karma.svelte';
import { createMakiStore } from './maki.svelte';
import { createCheckInStore } from './checkin.svelte';
import { createPinStore } from './pin.svelte';
import {
  createBiddingStore,
  createPlayAudioStore,
  createGoodnightKissStore,
  createShowImageStore,
  createMistakeStore,
  createMaxwellStore,
  createBlackSilenceStore,
  createFlashbangStore,
  createPollStore,
  createPredictionStore,
  createImportantStore
} from './rest.svelte';
import { createCutStore } from './cut.svelte';
import { createRotateStore } from './rotate';

export const pollStore = createPollStore();
export const predictionStore = createPredictionStore();
export const flashbangStore = createFlashbangStore();
export const blackSilenceStore = createBlackSilenceStore();
export const maxwellStore = createMaxwellStore();
export const mistakeStore = createMistakeStore();
export const showImageStore = createShowImageStore();
export const playAudioStore = createPlayAudioStore();
export const goodnightKissStore = createGoodnightKissStore();
export const karmaStore = createKarmaStore();
export const biddingStore = createBiddingStore();
export const pinStore = createPinStore();
export const importantStore = createImportantStore();
export const cutStore = createCutStore();
export const rotateStore = createRotateStore();

export { positionStore, DEFAULT_POSITIONS } from './positions.svelte';

export {
  createBiddingStore,
  createCheckInStore,
  createKarmaStore,
  createMakiStore,
  createPinStore
};
