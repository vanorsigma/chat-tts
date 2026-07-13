export type Unsubscribe = () => void;

export function createPubSub<T>() {
  let subscribers: Array<(value: T) => void> = [];

  function subscribe(fn: (value: T) => void): Unsubscribe {
    subscribers.push(fn);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== fn);
    };
  }

  function notify(value: T) {
    for (const sub of subscribers) sub(value);
  }

  return { subscribe, notify };
}
