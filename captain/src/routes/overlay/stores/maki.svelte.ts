export function createMakiStore(ws: WebSocket) {
  let currentMakiMessage = $state('');
  let currentCountdown = $state(0);
  let makiMessageQueue = $state<Array<{ message: string; duration: number }>>([]);
  let subscribers: Array<
    (currentMakiMessage: string, duration: number, activated: boolean, thinking: boolean) => void
  > = [];
  let thinking = $state(false);
  let activated = $state(false);
  let timer: NodeJS.Timeout | null = null;

  ws.addEventListener('message', (message_event) => {
    const data = JSON.parse(message_event.data);
    switch (data['type']) {
      case 'makioutputmessage': {
        const msg = data['message'];
        const duration = Number(data['dismiss_after']);
        makiMessageQueue = [...makiMessageQueue, { message: msg, duration }];

        if (!timer) tick();
        break;
      }
      case 'makiactivated':
        if (data['state']) {
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
    subscription: (
      currentMakiMessage: string,
      duration: number,
      activated: boolean,
      thinking: boolean
    ) => void
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
