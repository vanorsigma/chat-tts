import type { CheckInClearResponse, CheckInResponse } from './checkinInterface';
import type { Poll } from './poll.svelte';
import { SHOW_IMAGE_COOLDOWN } from './constants';

export function createMakiStore(ws: WebSocket) {
  let currentMakiMessage: string = '';
  let currentCountdown: number = 0;
  let makiMessageQueue: Array<{ message: string; duration: number }> = [];
  let subscribers: Array<
    (currentMakiMessage: string, duration: number, activated: boolean, thinking: boolean) => void
  > = [];
  let thinking: boolean = false;
  let activated: boolean = false;
  let timer: NodeJS.Timeout | null = null;

  ws.addEventListener('message', (message_event) => {
    console.log('received', message_event);
    const data = JSON.parse(message_event.data);
    switch (data['type']) {
      case 'makioutputmessage':
        const message = data['message'];
        const duration = Number(data['dismiss_after']);
        makiMessageQueue.push({ message, duration });

        if (!timer) tick();
        break;
      case 'makiactivated':
        if (data['state']) {

          // when activated, clear the message queue too
          activated = true;
          thinking = false;
          makiMessageQueue = [];
          currentCountdown = 0;
          currentMakiMessage = '';
          if (timer) clearInterval(timer);
          timer = null;
        } else {
          activated = false;
          thinking = false;
        }
        break;
      case 'makiloading':
        thinking = true;
        break;
    }

    informSubscribers();
  });

  function informSubscribers() {
    for (const subscriber of subscribers)
      subscriber(currentMakiMessage, currentCountdown, activated, thinking);
  }

  function tick() {
    if (timer) clearTimeout(timer);
    timer = null;
    currentCountdown -= 1;
    if (currentCountdown <= 0) {
      if (makiMessageQueue.length === 0) {
        currentMakiMessage = '';
        informSubscribers();
        return;
      }

      const messageItem = makiMessageQueue[0];
      makiMessageQueue = makiMessageQueue.slice(1);

      currentMakiMessage = messageItem.message;
      currentCountdown = messageItem.duration;
    }
    informSubscribers();
    timer = setTimeout(tick, 1000);
  }

  function subscribe(
    subscription: (currentMakiMessage: string, duration: number, activated: boolean, thinking: boolean) => void
  ): () => void {
    subscribers.push(subscription);
    subscription(currentMakiMessage, currentCountdown, activated, thinking);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get currentMessage() {
      return currentMakiMessage;
    },
    get currentDuration() {
      return currentCountdown;
    },
    subscribe
  };
}

function createPlayAudioStore() {
  let audioUrls: Array<string> = [];
  let subscribers: Array<(value: string | undefined) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(audioUrls.at(0)));
  }

  function addUrl(audioUrl: string) {
    audioUrls.push(audioUrl);
    updateAllSubscribers();
  }

  function dequeue() {
    audioUrls = audioUrls.slice(1);
    updateAllSubscribers();
  }

  function purge() {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return audioUrls.slice();
    },
    dequeue,
    subscribe,
    addUrl,
    purge
  };
}

/// createCheckInStore() is special in the sense that it requires a URL.
/// As such, this store should be constructed in the overlay, so that the overlay
/// manages the injection of the receiver ws
export function createCheckInStore(receiver: WebSocket) {
  let checkInsLeft: CheckInResponse[] = [];
  let subscribers: Array<(value: CheckInResponse[]) => void> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(checkInsLeft));
  }

  function addCheckInResponse(response: CheckInResponse) {
    checkInsLeft.push(response);
    updateAllSubscribers();
  }

  function addCheckInClearResponse(response: CheckInClearResponse) {
    checkInsLeft = checkInsLeft.filter((r) => r.username !== response.username);
    updateAllSubscribers();
  }

  receiver.addEventListener('message', (message_event) => {
    const data = JSON.parse(message_event.data);
    if ('type' in data) {
      switch (data['type']) {
        case 'checkincleared':
          addCheckInClearResponse(data as CheckInClearResponse);
          break;

        case 'checkinresponse':
          addCheckInResponse(data as CheckInResponse);
          break;

        default:
          console.log('unknown message in bus, ignoring...');
      }
    }
  });

  function subscribe(subscription: (value: CheckInResponse[]) => void): () => void {
    subscribers.push(subscription);
    subscription(checkInsLeft);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get checkInsLeft() {
      return checkInsLeft;
    },
    addCheckInClearResponse,
    addCheckInResponse,
    subscribe
  };
}

function createGoodnightKissStore() {
  interface KissProperties {
    username: string;
    userid: string;
    color: string;
    fast_version: boolean;
  }

  let properties: KissProperties = {
    username: '',
    userid: '',
    color: 'black',
    fast_version: false
  };
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
    /// Returns the userid before reset
    const retVal = properties.userid;
    properties = {
      username: '',
      color: properties.color,
      fast_version: false
    };
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
        const firstIndex = imageUrls.findIndex(([url, _]) => url === imageUrl);
        imageUrls = [...imageUrls.slice(0, firstIndex), ...imageUrls.slice(firstIndex + 1)];
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
      return poll?.options?.reduce((sum, option) => sum + option.votes, 0) ?? 0;
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
export const playAudioStore = createPlayAudioStore();
export const goodnightKissStore = createGoodnightKissStore();
