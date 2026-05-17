import { describe, it, expect } from 'vitest';
import { TTLCache } from '../lib/TTLCache.js';

describe('TTLCache', () => {
  it('evicts the oldest entry when maxEntries is exceeded', () => {
    const cache = new TTLCache<string, number>(10_000, 1);

    cache.set('oldest', 1);
    cache.set('newest', 2);

    expect(cache.has('oldest')).toBe(false);
    expect(cache.has('newest')).toBe(true);
  });

  it('evicts an undefined key when it is the oldest entry', () => {
    const cache = new TTLCache<string | undefined, number>(10_000, 1);

    cache.set(undefined, 1);
    cache.set('newest', 2);

    expect(cache.has(undefined)).toBe(false);
    expect(cache.has('newest')).toBe(true);
  });
});
