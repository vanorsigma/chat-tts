export class TimedCache<K, V> {
  private cache = new Map<K, { value: V; timeoutId: NodeJS.Timeout }>();
  private readonly defaultTtl: number;

  constructor(defaultTtl: number = 60 * 1000) {
    this.defaultTtl = defaultTtl;
  }

  public get(key: K): V | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }
    return entry.value;
  }

  public put(key: K, value: V, ttl: number = this.defaultTtl): void {
    // Clear any existing timeout for the key
    const existingEntry = this.cache.get(key);
    if (existingEntry) {
      clearTimeout(existingEntry.timeoutId);
    }

    // Set a new timeout to remove the entry
    const timeoutId = setTimeout(() => {
      this.cache.delete(key);
    }, ttl);

    this.cache.set(key, { value, timeoutId });
  }

  public remove(key: K): void {
    const entry = this.cache.get(key);
    if (entry) {
      clearTimeout(entry.timeoutId);
      this.cache.delete(key);
    }
  }

  public clear(): void {
    for (const entry of this.cache.values()) {
      clearTimeout(entry.timeoutId);
    }
    this.cache.clear();
  }
}
