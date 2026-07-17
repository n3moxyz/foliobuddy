import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CoinGeckoProvider } from '../services/providers/CoinGeckoProvider.js';

vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const response = (body: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 429 ? 'Too Many Requests' : 'Error',
    json: vi.fn().mockResolvedValue(body),
  }) as unknown as Response;

describe('CoinGeckoProvider adversarial behavior', () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('deduplicates IDs before batching and ignores corrupted price values', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        bitcoin: { usd: 60_000 },
        negative: { usd: -1 },
        nonfinite: { usd: Number.POSITIVE_INFINITY },
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const provider = new CoinGeckoProvider();

    const prices = await provider.getPrices([
      ...Array.from({ length: 100 }, () => 'bitcoin'),
      'negative',
      'nonfinite',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prices).toEqual(new Map([['bitcoin', { priceUsd: 60_000 }]]));
  });

  it('stops retrying a persistent 429 response so the queue cannot grow forever', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({}, 429));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new CoinGeckoProvider();
    vi.spyOn(Date, 'now').mockImplementation(
      (() => {
        let now = 1_000_000;
        return () => (now += 3_000);
      })()
    );
    vi.spyOn(provider as any, 'sleep').mockResolvedValue(undefined);

    await expect(provider.getHistoricalPrices('bitcoin', 30)).rejects.toThrow(
      'rate limit retry limit exceeded'
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('clears the abort timer even when direct fetch rejects', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    const provider = new CoinGeckoProvider();

    await expect(provider.getDirectPrice('bitcoin')).resolves.toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('filters malformed historical points before caching them', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response({
          prices: [
            [1_000, 10],
            [Number.NaN, 11],
            [2_000, -1],
            [3_000, 12],
          ],
        })
      )
    );
    const provider = new CoinGeckoProvider();

    await expect(provider.getHistoricalPrices('bitcoin', 30)).resolves.toEqual([
      { timestamp: 1_000, priceUsd: 10 },
      { timestamp: 3_000, priceUsd: 12 },
    ]);
  });
});
