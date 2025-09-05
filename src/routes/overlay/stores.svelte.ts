import type { Poll } from './poll.svelte';

function createMaxwellStore() {
  let maxwellCount = $state(0);

  function increment() {
    maxwellCount++;
  }

  return {
    get count() {
      return maxwellCount;
    },
    increment
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
