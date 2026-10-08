import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from './memory.js';

describe('MemoryCache', () => {
  it('serves cached values within ttl and reloads after', async () => {
    let t = 0;
    const cache = new MemoryCache(() => t);
    const load = vi.fn(async () => Math.random());
    const a = await cache.getOrLoad('k', load, { ttlSeconds: 10 });
    t = 5_000;
    expect(await cache.getOrLoad('k', load, { ttlSeconds: 10 })).toBe(a);
    t = 11_000;
    expect(await cache.getOrLoad('k', load, { ttlSeconds: 10 })).not.toBe(a);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('coalesces concurrent loads', async () => {
    const cache = new MemoryCache();
    const load = vi.fn(async () => 'v');
    await Promise.all([1, 2, 3].map(() => cache.getOrLoad('k', load, { ttlSeconds: 10 })));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('serves stale while revalidating', async () => {
    let t = 0;
    const cache = new MemoryCache(() => t);
    let n = 0;
    const load = async () => ++n;
    await cache.getOrLoad('k', load, { ttlSeconds: 10, staleWhileRevalidateSeconds: 30 });
    t = 20_000;
    expect(await cache.getOrLoad('k', load, { ttlSeconds: 10, staleWhileRevalidateSeconds: 30 })).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(await cache.getOrLoad('k', load, { ttlSeconds: 10, staleWhileRevalidateSeconds: 30 })).toBe(2);
  });

  it('does not cache failures', async () => {
    const cache = new MemoryCache();
    await expect(cache.getOrLoad('k', async () => Promise.reject(new Error('x')), { ttlSeconds: 10 })).rejects.toThrow('x');
    expect(await cache.getOrLoad('k', async () => 'ok', { ttlSeconds: 10 })).toBe('ok');
  });
});
