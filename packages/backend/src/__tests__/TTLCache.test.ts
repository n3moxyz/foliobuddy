import { afterEach, describe, expect, it, vi } from 'vitest';
import { TTLCache } from '../lib/TTLCache.js';

afterEach(() => vi.useRealTimers());

describe('TTLCache', () => {
  it('expires entries exactly at the TTL boundary and purges them from has/get', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const cache = new TTLCache<string, number>(100);
    cache.set('key', 42);

    vi.setSystemTime(1_099);
    expect(cache.get('key')).toBe(42);
    vi.setSystemTime(1_100);
    expect(cache.has('key')).toBe(false);
    expect(cache.get('key')).toBeUndefined();
  });

  it('uses successful reads and overwrites to refresh LRU order', () => {
    const cache = new TTLCache<string, number>(10_000, 2);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);

    cache.set('a', 10);
    cache.set('d', 4);
    expect(cache.get('a')).toBe(10);
    expect(cache.has('c')).toBe(false);
  });

  it('purges expired entries before evicting live entries', () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const cache = new TTLCache<string, number>(10, 2);
    cache.set('expired-1', 1);
    cache.set('expired-2', 2);

    vi.setSystemTime(10);
    cache.set('live', 3);

    expect(cache.has('expired-1')).toBe(false);
    expect(cache.has('expired-2')).toBe(false);
    expect(cache.get('live')).toBe(3);
  });

  it('supports undefined keys without confusing them with an exhausted iterator', () => {
    const cache = new TTLCache<string | undefined, number>(10_000, 1);
    cache.set(undefined, 1);
    cache.set('newest', 2);

    expect(cache.has(undefined)).toBe(false);
    expect(cache.has('newest')).toBe(true);
  });

  it('exposes meaningful delete and clear behavior', () => {
    const cache = new TTLCache<string, number>(10_000);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    cache.clear();
    expect(cache.has('b')).toBe(false);
  });
});
