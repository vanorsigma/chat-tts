import { createKarmaStore } from './karma.svelte';
import { createMakiStore } from './maki.svelte';
import { createCheckInStore } from './checkin.svelte';
import {
  createBiddingStore,
  createPlayAudioStore,
  createGoodnightKissStore,
  createShowImageStore,
  createMistakeStore,
  createMaxwellStore,
  createBlackSilenceStore,
  createFlashbangStore,
  createPollStore
} from './rest.svelte';

export const pollStore = createPollStore();
export const flashbangStore = createFlashbangStore();
export const blackSilenceStore = createBlackSilenceStore();
export const maxwellStore = createMaxwellStore();
export const mistakeStore = createMistakeStore();
export const showImageStore = createShowImageStore();
export const playAudioStore = createPlayAudioStore();
export const goodnightKissStore = createGoodnightKissStore();
export const karmaStore = createKarmaStore();
export const biddingStore = createBiddingStore();

export { createBiddingStore, createCheckInStore, createKarmaStore, createMakiStore };
