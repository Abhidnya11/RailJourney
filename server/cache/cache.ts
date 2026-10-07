export interface CacheGetOptions {
  /** Fresh window in seconds. */
  ttlSeconds: number;
  /** Extra seconds during which a stale value may be served while a refresh runs in the background. */
  staleWhileRevalidateSeconds?: number;
}

/** Cache abstraction so the in-memory store can be swapped for Redis later. */
export interface Cache {
  getOrLoad<T>(key: string, load: () => Promise<T>, opts: CacheGetOptions): Promise<T>;
  invalidate(key: string): void;
  clear(): void;
  stats(): { hits: number; misses: number; staleServed: number; size: number };
}
