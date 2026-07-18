export interface PinnedMessage {
  username: string;
  text: string;
  kamoji: string;
  emoji: string;
  expiresAt: number;
}

export function createPinStore() {
  let current = $state<PinnedMessage | null>(null);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let subscribers: Array<(pin: PinnedMessage | null) => void> = [];

  function subscribe(subscription: (pin: PinnedMessage | null) => void) {
    subscribers.push(subscription);
    subscription(current);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  function inform() {
    for (const sub of subscribers) sub(current);
  }

  function set(pin: PinnedMessage) {
    if (timer) clearTimeout(timer);
    current = pin;
    timer = setTimeout(() => {
      current = null;
      timer = null;
      inform();
    }, Math.max(0, pin.expiresAt - Date.now()));
    inform();
  }

  function clear() {
    if (timer) clearTimeout(timer);
    timer = null;
    current = null;
    inform();
  }

  return {
    get current() {
      return current;
    },
    subscribe,
    set,
    clear
  };
}
