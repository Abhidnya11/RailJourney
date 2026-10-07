import type { Cache, CacheGetOptions } from './cache';

interface Entry {
  value: unknown;
  storedAt: number;
}

/**
 * In-memory TTL cache with request coalescing (concurrent loads for one key share a promise) and
 * stale-while-revalidate. Failed loads are never cached.
 */
export class MemoryCache implements Cache {
  private entries = new Map<string, Entry>();
  private inflight = new Map<string, Promise<unknown>>();
  private counters = { hits: 0, misses: 0, staleServed: 0 };

  constructor(
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 5000,
  ) {}

  async getOrLoad<T>(key: string, load: () => Promise<T>, opts: CacheGetOptions): Promise<T> {
    const entry = this.entries.get(key);
    if (entry) {
      const ageMs = this.now() - entry.storedAt;
      if (ageMs <= opts.ttlSeconds * 1000) {
        this.counters.hits++;
        return entry.value as T;
      }
      if (ageMs <= (opts.ttlSeconds + (opts.staleWhileRevalidateSeconds ?? 0)) * 1000) {
        this.counters.staleServed++;
        void this.load(key, load).catch(() => undefined);
        return entry.value as T;
      }
    }
    this.counters.misses++;
    return this.load(key, load);
  }

  private load<T>(key: string, load: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;
    const p = load()
      .then((value) => {
        this.set(key, value);
        return value;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private set(key: string, value: unknown) {
    this.entries.delete(key);
    this.entries.set(key, { value, storedAt: this.now() });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  invalidate(key: string) {
    this.entries.delete(key);
  }
  clear() {
    this.entries.clear();
  }
  stats() {
    return { ...this.counters, size: this.entries.size };
  }
}
