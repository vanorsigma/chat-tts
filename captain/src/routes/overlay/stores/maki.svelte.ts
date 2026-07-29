type Segment = { text: string; speed: number };
type QueueItem = { segments: Segment[]; duration: number };

export function createMakiStore(ws: WebSocket) {
  let currentSegments: Segment[] = $state([]);
  let currentCountdown = $state(0);
  let makiMessageQueue = $state<QueueItem[]>([]);
  let subscribers: Array<
    (segments: Segment[], duration: number, activated: boolean, thinking: boolean) => void
  > = [];
  let thinking = $state(false);
  let activated = $state(false);
  let timer: NodeJS.Timeout | null = null;

  ws.addEventListener('message', (message_event) => {
    const data = JSON.parse(message_event.data);
    switch (data['type']) {
      case 'makioutputmessage': {
        const segments = extractSegments(data);
        const duration = Number(data['dismiss_after']);
        makiMessageQueue = [...makiMessageQueue, { segments, duration }];

        if (!timer) tick();
        break;
      }
      case 'makiactivated':
        if (data['state']) {
          activated = true;
          thinking = false;
          makiMessageQueue = [];
          currentCountdown = 0;
          currentSegments = [];
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
      subscriber(currentSegments, currentCountdown, activated, thinking);
  }

  function tick() {
    if (timer) clearTimeout(timer);
    timer = null;
    currentCountdown -= 1;
    if (currentCountdown <= 0) {
      if (makiMessageQueue.length === 0) {
        currentSegments = [];
        informSubscribers();
        return;
      }

      const messageItem = makiMessageQueue[0];
      makiMessageQueue = makiMessageQueue.slice(1);

      currentSegments = messageItem.segments;
      currentCountdown = messageItem.duration;
    }
    informSubscribers();
    timer = setTimeout(tick, 1000);
  }

  function subscribe(
    subscription: (
      segments: Segment[],
      duration: number,
      activated: boolean,
      thinking: boolean
    ) => void
  ): () => void {
    subscribers.push(subscription);
    subscription(currentSegments, currentCountdown, activated, thinking);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get currentSegments() {
      return currentSegments;
    },
    get currentDuration() {
      return currentCountdown;
    },
    subscribe
  };
}

function extractSegments(data: Record<string, unknown>): Segment[] {
  const raw = data['segments'];
  if (Array.isArray(raw)) {
    return raw.map((s: Record<string, unknown>) => ({
      text: String(s.text ?? ''),
      speed: Number(s.speed) || 0
    }));
  }
  const msg = data['message'];
  if (typeof msg === 'string' && msg.length > 0) {
    return [{ text: msg, speed: 0 }];
  }
  return [];
}
