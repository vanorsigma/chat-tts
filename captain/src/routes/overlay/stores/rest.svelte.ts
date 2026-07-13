import { SHOW_IMAGE_COOLDOWN } from '../constants';
import type { Poll } from '../poll.svelte';
import type { BidInstance } from '../bid.svelte';

export function createBiddingStore() {
  let bidInstance: BidInstance | null = $state(null);

  function set(bi: BidInstance) {
    bidInstance = bi;
  }

  function clear() {
    bidInstance = null;
  }

  return {
    get data() {
      return bidInstance;
    },
    get totalBids() {
      return bidInstance?.bids.values().reduce((prev, curr) => prev + curr) ?? 0;
    },
    set,
    clear
  };
}

export function createPlayAudioStore() {
  let audioUrls = $state<Array<string>>([]);
  let subscribers: Array<(value: string | undefined) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(audioUrls.at(0)));
  }

  function addUrl(audioUrl: string) {
    audioUrls = [...audioUrls, audioUrl];
    updateAllSubscribers();
  }

  function dequeue() {
    audioUrls = audioUrls.slice(1);
    updateAllSubscribers();
  }

  function purge() {
    audioUrls = [];
    updateAllSubscribers();
  }

  function subscribe(subscription: (value: string | undefined) => void): () => void {
    subscribers.push(subscription);
    subscription(audioUrls.at(0));
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get audioUrls() {
      return audioUrls.slice();
    },
    dequeue,
    subscribe,
    addUrl,
    purge
  };
}

export function createGoodnightKissStore() {
  interface KissProperties {
    username: string;
    userid: string;
    color: string;
    fast_version: boolean;
  }

  let properties: KissProperties = $state({
    username: '',
    userid: '',
    color: 'black',
    fast_version: false
  });
  let subscribers: Array<(value: KissProperties) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(properties));
  }

  function setProperties(property: KissProperties) {
    properties = property;
    updateAllSubscribers();
  }

  function isPopulated(): boolean {
    return properties.username.length !== 0;
  }

  function reset(): string {
    const retVal = properties.userid;
    properties = {
      username: '',
      color: properties.color,
      fast_version: false
    } as KissProperties;
    updateAllSubscribers();
    return retVal;
  }

  function subscribe(subscription: (value: KissProperties) => void): () => void {
    subscribers.push(subscription);
    subscription(properties);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get property() {
      return properties;
    },
    isPopulated,
    subscribe,
    setProperties,
    reset
  };
}

export function createShowImageStore() {
  let imageUrls = $state<Array<[string, NodeJS.Timeout]>>([]);
  let subscribers: Array<(value: [string, NodeJS.Timeout][]) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(imageUrls));
  }

  function addUrl(imageUrl: string) {
    imageUrls = [
      ...imageUrls,
      [
        imageUrl,
        setTimeout(() => {
          const firstIndex = imageUrls.findIndex(([url]) => url === imageUrl);
          imageUrls = [...imageUrls.slice(0, firstIndex), ...imageUrls.slice(firstIndex + 1)];
          updateAllSubscribers();
        }, SHOW_IMAGE_COOLDOWN)
      ]
    ];
    updateAllSubscribers();
  }

  function removeUrl(imageUrl: string) {
    while (imageUrls.some(([url]) => url === imageUrl)) {
      const index = imageUrls.findIndex(([url]) => url === imageUrl);
      const [, timeout] = imageUrls.at(index)!;
      clearTimeout(timeout);
      imageUrls = [...imageUrls.slice(0, index), ...imageUrls.slice(index + 1)];
    }

    updateAllSubscribers();
  }

  function purge() {
    imageUrls.forEach(([, timeout]) => {
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
      return imageUrls.map(([url]) => url);
    },
    subscribe,
    addUrl,
    removeUrl,
    purge
  };
}

export function createMistakeStore() {
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

export function createMaxwellStore() {
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

export function createBlackSilenceStore() {
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

export function createFlashbangStore() {
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

export function createPollStore() {
  let poll: Poll | undefined | null = $state(undefined);

  function set(newPoll: Poll | null) {
    poll = newPoll;
  }

  return {
    get data() {
      return poll;
    },
    get totalVotes() {
      return poll?.options?.reduce((sum, option) => sum + option.votes, 0) ?? 0;
    },
    set
  };
}
