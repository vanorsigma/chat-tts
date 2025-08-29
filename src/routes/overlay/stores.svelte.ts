import type { Poll } from "./poll.svelte";

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
