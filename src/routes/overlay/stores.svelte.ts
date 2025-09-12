import type { Poll } from './poll.svelte';

function createMistakeStore() {
  let mistakeCount = $state(0);

  function increment() {
    mistakeCount++;
  }

  return {
    get count() {
      return mistakeCount;
    },
    increment
  }
}

function createMaxwellStore() {
  let maxwellCount = $state(0);
  let callbacks: Array<(value: number) => void> = [];

  function increment() {
    maxwellCount++;
    callbacks.forEach(cb => cb(maxwellCount));
  }

  function subscribe(subscription: (value: number) => void): (() => void) {
    callbacks.push(subscription);
    return () => {
      callbacks = callbacks.filter(cb => cb !== subscription);
    }
  }

  return {
    get count() {
      return maxwellCount;
    },
    increment,
    subscribe
  }
}

function createBlackSilenceStore() {
  let blackSilenceCount = $state(0);

  function increment() {
    blackSilenceCount++;
  }

  return {
    get count() {
      return blackSilenceCount;
    },
    increment
  }
}

function createFlashbangStore() {
  let flashbangTargetCount = $state(0);

  function increment() {
    flashbangTargetCount++;
  }

  return {
    get count() {
      return flashbangTargetCount;
    },
    increment
  };
}

function createPollStore() {
  let poll: Poll | undefined | null = $state(undefined);

  function set(newPoll: Poll | null) {
    poll = newPoll;
  }

  return {
    get data() {
      return poll;
    },
    get totalVotes() {
      return poll?.options.reduce((sum, option) => sum + option.votes, 0) ?? 0;
    },
    set
  };
}

export const pollStore = createPollStore();
export const flashbangStore = createFlashbangStore();
export const blackSilenceStore = createBlackSilenceStore();
export const maxwellStore = createMaxwellStore();
export const mistakeStore = createMistakeStore();
