import type { Poll } from './poll.svelte';
import { SHOW_IMAGE_COOLDOWN } from './showImage';

function createShowImageStore() {
  let imageUrls: Array<[string, NodeJS.Timeout]> = [];
  let subscribers: Array<(value: [string, NodeJS.Timeout][]) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(imageUrls));
  }

  function addUrl(imageUrl: string) {
    imageUrls.push([
      imageUrl,
      setTimeout(() => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        imageUrls = imageUrls.filter(([url, _]) => url !== imageUrl);
        updateAllSubscribers();
      }, SHOW_IMAGE_COOLDOWN)
    ]);

    updateAllSubscribers();
  }

  function removeUrl(imageUrl: string) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    while (imageUrls.some(([url, _]) => url === imageUrl)) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const index = imageUrls.findIndex(([url, _]) => url === imageUrl)!;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const [_, timeout] = imageUrls.at(index)!;
      clearTimeout(timeout);
      imageUrls = [...imageUrls.slice(0, index), ...imageUrls.slice(index + 1)];
    }

    updateAllSubscribers();
  }

  function purge() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    imageUrls.forEach(([_, timeout]) => {
      clearTimeout(timeout);
    });
    imageUrls = [];
    updateAllSubscribers();
  }

  function subscribe(subscription: (value: [string, NodeJS.Timeout][]) => void): () => void {
    subscribers.push(subscription);
    subscription(imageUrls);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get imageUrls() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return imageUrls.map(([url, _]) => url);
    },
    subscribe,
    addUrl,
    removeUrl,
    purge
  };
}

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
  };
}

function createMaxwellStore() {
  let maxwellCount = $state(0);
  let callbacks: Array<(value: number) => void> = [];

  function increment() {
    maxwellCount++;
    callbacks.forEach((cb) => cb(maxwellCount));
  }

  function subscribe(subscription: (value: number) => void): () => void {
    callbacks.push(subscription);
    return () => {
      callbacks = callbacks.filter((cb) => cb !== subscription);
    };
  }

  return {
    get count() {
      return maxwellCount;
    },
    increment,
    subscribe
  };
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
  };
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
export const showImageStore = createShowImageStore();
