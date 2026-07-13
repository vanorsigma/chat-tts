import { KARMA_DECAY_RATE, MAX_KARMA, MIN_KARMA } from '../constants';
import { TimedCache } from '$lib/TimedCache';

export function createKarmaStore() {
  let karma = $state(0) as number;
  let timedCache: TimedCache<string, number> = new TimedCache(60 * 1000);
  let subscribers: Array<(karma: number, oldKarma: number, message?: string) => void> = [];

  function subscribe(
    subscription: (karma: number, oldKarma: number, message?: string) => void
  ): () => void {
    subscribers.push(subscription);
    subscription(karma, karma);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  function setKarma(newKarma: number, message?: string) {
    const oldKarma = karma;
    karma = Math.min(MAX_KARMA, Math.max(MIN_KARMA, newKarma));
    informSubscribers(oldKarma, message);
  }

  function updateKarma(diffKarma: number, message?: string, withDecay: boolean = true) {
    if (withDecay && message) {
      const decayFactor = timedCache.get(message) ?? 0.0;
      const decayValue = decayFactor * Math.abs(diffKarma);
      diffKarma -= decayValue;
      timedCache.put(message, decayFactor + KARMA_DECAY_RATE);
    }

    setKarma(karma + diffKarma, message);
  }

  function informSubscribers(oldKarma: number, message?: string) {
    for (const subscriber of subscribers) subscriber(karma, oldKarma, message);
  }

  return {
    get karma() {
      return karma;
    },
    subscribe,
    setKarma,
    updateKarma
  };
}
