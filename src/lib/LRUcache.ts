// credit: https://gist.github.com/dherges/86012049be7b1263b2e594134ff5816a

export class LRUCache<T> {

  private values: Map<string, T> = new Map<string, T>();
  private maxEntries: number;

  constructor(maxEntries: number = 20) {
    this.maxEntries = maxEntries;
  }

  public get(key: string): T {
    const hasKey = this.values.has(key);
    let entry: T | undefined;
    if (hasKey) {
      entry = this.values.get(key);
      this.values.delete(key);
      this.values.set(key, entry!);
    }

    return entry!;
  }

  public put(key: string, value: T) {

    if (this.values.size >= this.maxEntries) {
      const keyToDelete = this.values.keys().next().value;
      this.values.delete(keyToDelete!);
    }

    this.values.set(key, value);
  }

}
