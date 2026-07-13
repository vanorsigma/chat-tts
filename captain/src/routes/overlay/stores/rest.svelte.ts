import { SHOW_IMAGE_COOLDOWN } from '../constants';
import type { Poll } from '../poll.svelte';
import type { BidInstance } from '../bid.svelte';
import { createPubSub, type Unsubscribe } from './pubsub';

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
  const pub = createPubSub<string | undefined>();

  function addUrl(audioUrl: string) {
    audioUrls = [...audioUrls, audioUrl];
    pub.notify(audioUrls.at(0));
  }

  function dequeue() {
    audioUrls = audioUrls.slice(1);
    pub.notify(audioUrls.at(0));
  }

  function purge() {
    audioUrls = [];
    pub.notify(undefined);
  }

  return {
    dequeue,
    subscribe: (fn: (value: string | undefined) => void): Unsubscribe => {
      fn(audioUrls.at(0));
      return pub.subscribe(fn);
    },
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
  const pub = createPubSub<KissProperties>();

  function setProperties(property: KissProperties) {
    properties = property;
    pub.notify(properties);
  }

  function isPopulated(): boolean {
    return properties.username.length !== 0;
  }

  function reset(): string {
    const retVal = properties.userid;
    properties = {
      username: '',
      userid: '',
      color: properties.color,
      fast_version: false
    };
    pub.notify(properties);
    return retVal;
  }

  return {
    isPopulated,
    subscribe: (fn: (value: KissProperties) => void): Unsubscribe => {
      fn(properties);
      return pub.subscribe(fn);
    },
    setProperties,
    reset
  };
}

export function createShowImageStore() {
  let imageUrls = $state<Array<[string, NodeJS.Timeout]>>([]);
  const pub = createPubSub<[string, NodeJS.Timeout][]>();

  function addUrl(imageUrl: string) {
    imageUrls = [
      ...imageUrls,
      [
        imageUrl,
        setTimeout(() => {
          const firstIndex = imageUrls.findIndex(([url]) => url === imageUrl);
          imageUrls = [...imageUrls.slice(0, firstIndex), ...imageUrls.slice(firstIndex + 1)];
          pub.notify(imageUrls);
        }, SHOW_IMAGE_COOLDOWN)
      ]
    ];
    pub.notify(imageUrls);
  }

  function purge() {
    imageUrls.forEach(([, timeout]) => {
      clearTimeout(timeout);
    });
    imageUrls = [];
    pub.notify(imageUrls);
  }

  return {
    subscribe: (fn: (value: [string, NodeJS.Timeout][]) => void): Unsubscribe => {
      fn(imageUrls);
      return pub.subscribe(fn);
    },
    addUrl,
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
  const pub = createPubSub<number>();

  function increment() {
    maxwellCount++;
    pub.notify(maxwellCount);
  }

  return {
    get count() {
      return maxwellCount;
    },
    increment,
    subscribe: (fn: (value: number) => void): Unsubscribe => {
      return pub.subscribe(fn);
    }
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
