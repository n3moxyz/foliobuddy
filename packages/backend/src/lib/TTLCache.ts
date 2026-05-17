type CacheEntry<V> = {
  value: V;
  expiresAt: number;
};

export class TTLCache<K, V> {
  private readonly store = new Map<K, CacheEntry<V>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = Number.POSITIVE_INFINITY
  ) {}

  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }

    this.touch(key, entry);
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  set(key: K, value: V): void {
    this.purgeExpired();

    if (this.store.has(key)) {
      this.store.delete(key);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });

    this.evictIfNeeded();
  }

  delete(key: K): boolean {
    return this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  private isExpired(entry: CacheEntry<V>): boolean {
    return entry.expiresAt <= Date.now();
  }

  private touch(key: K, entry: CacheEntry<V>): void {
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private purgeExpired(): void {
    for (const [key, entry] of this.store.entries()) {
      if (this.isExpired(entry)) {
        this.store.delete(key);
      }
    }
  }

  private evictIfNeeded(): void {
    if (!Number.isFinite(this.maxEntries)) return;

    while (this.store.size > this.maxEntries) {
      const oldest = this.store.keys().next();
      if (oldest.done) break;
      this.store.delete(oldest.value);
    }
  }
}
