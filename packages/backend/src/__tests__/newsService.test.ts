import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderNewsItem } from '../services/providers/types.js';

const mocks = vi.hoisted(() => ({
  positionFindMany: vi.fn(),
  tradeFindMany: vi.fn(),
  getNews: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    position: { findMany: mocks.positionFindMany },
    trade: { findMany: mocks.tradeFindMany },
  },
}));
vi.mock('../services/priceService.js', () => ({
  priceService: { getYahooProvider: () => ({ getNews: mocks.getNews }) },
}));

const { newsService, newsBucketFor, yahooNewsTicker } = await import('../services/newsService.js');

function makeAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    category: 'LIQUID_CRYPTO',
    priceProvider: 'coingecko',
    providerAssetId: 'bitcoin',
    currentPriceUsd: 60000,
    ...overrides,
  };
}

function makePosition(asset: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    assetId: asset.id,
    quantity: 1,
    marketValueUsd: 1000,
    asset,
    ...overrides,
  };
}

function newsItem(id: string, publishedAt: string | null = '2026-08-24T10:00:00.000Z') {
  return {
    id,
    title: `Story ${id}`,
    publisher: 'Test Wire',
    url: `https://example.com/${id}`,
    publishedAt,
  } satisfies ProviderNewsItem;
}

describe('newsBucketFor', () => {
  it('buckets crypto and equities, and excludes categories without a news feed', () => {
    expect(newsBucketFor('LIQUID_CRYPTO')).toBe('crypto');
    expect(newsBucketFor('EQUITY')).toBe('equities');
    expect(newsBucketFor('UNIT_TRUST')).toBe('equities');
    expect(newsBucketFor('STABLECOIN')).toBeNull();
    expect(newsBucketFor('CASH')).toBeNull();
    expect(newsBucketFor('NFT')).toBeNull();
    expect(newsBucketFor('ANGEL')).toBeNull();
  });
});

describe('yahooNewsTicker', () => {
  it('appends -USD to CoinGecko symbols and passes Yahoo tickers through unchanged', () => {
    expect(
      yahooNewsTicker({ symbol: 'btc', priceProvider: 'coingecko', providerAssetId: 'bitcoin' })
    ).toBe('BTC-USD');
    expect(
      yahooNewsTicker({ symbol: '285A.T', priceProvider: 'yahoo', providerAssetId: '285A.T' })
    ).toBe('285A.T');
  });

  it('rejects manual-priced assets and unmappable symbols', () => {
    expect(
      yahooNewsTicker({ symbol: 'FUND', priceProvider: 'manual', providerAssetId: null })
    ).toBeNull();
    expect(
      yahooNewsTicker({ symbol: 'NOT A TICKER!', priceProvider: 'coingecko', providerAssetId: 'x' })
    ).toBeNull();
    expect(
      yahooNewsTicker({ symbol: 'X', priceProvider: 'yahoo', providerAssetId: '  ' })
    ).toBeNull();
  });
});

describe('newsService.getPortfolioNews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.positionFindMany.mockResolvedValue([]);
    mocks.tradeFindMany.mockResolvedValue([]);
    mocks.getNews.mockResolvedValue([]);
  });

  it('queries only owned positions and open trades', async () => {
    await newsService.getPortfolioNews('user-1');

    expect(mocks.positionFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', custodyOf: null },
      include: { asset: true },
    });
    expect(mocks.tradeFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', status: 'OPEN' },
      include: { asset: true },
    });
  });

  it('fetches per-holding news with mapped tickers and skips unmappable assets', async () => {
    const btc = makeAsset();
    const kioxia = makeAsset({
      id: 'asset-kioxia',
      symbol: '285A.T',
      name: 'Kioxia Holdings',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: '285A.T',
    });
    const usdt = makeAsset({
      id: 'asset-usdt',
      symbol: 'USDT',
      name: 'Tether',
      category: 'STABLECOIN',
    });
    const fund = makeAsset({
      id: 'asset-fund',
      symbol: 'FUND',
      name: 'Manual Fund',
      category: 'UNIT_TRUST',
      priceProvider: 'manual',
      providerAssetId: null,
    });
    mocks.positionFindMany.mockResolvedValue([
      makePosition(btc),
      makePosition(kioxia),
      makePosition(usdt),
      makePosition(fund),
    ]);

    await newsService.getPortfolioNews('user-1');

    const queried = mocks.getNews.mock.calls.map(([query]) => query);
    expect(queried).toContain('BTC-USD');
    expect(queried).toContain('285A.T');
    expect(queried.filter((q: string) => !q.includes('-USD') && q !== '285A.T')).toEqual([
      '^GSPC',
      '^TNX',
      'DX-Y.NYB',
      'Federal Reserve',
      'inflation',
    ]);
  });

  it('orders groups by position value, drops empty groups, and flags open-trade-only assets', async () => {
    const btc = makeAsset();
    const eth = makeAsset({ id: 'asset-eth', symbol: 'ETH', name: 'Ethereum' });
    const quiet = makeAsset({ id: 'asset-quiet', symbol: 'QUIET', name: 'Quiet Coin' });
    const sol = makeAsset({ id: 'asset-sol', symbol: 'SOL', name: 'Solana' });
    mocks.positionFindMany.mockResolvedValue([
      makePosition(btc, { marketValueUsd: 500 }),
      makePosition(eth, { marketValueUsd: 2000 }),
      makePosition(quiet, { marketValueUsd: 9000 }),
    ]);
    mocks.tradeFindMany.mockResolvedValue([{ assetId: sol.id, asset: sol }]);
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === 'BTC-USD') return [newsItem('btc-1')];
      if (query === 'ETH-USD') return [newsItem('eth-1')];
      if (query === 'SOL-USD') return [newsItem('sol-1')];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto.map((g) => g.symbol)).toEqual(['ETH', 'BTC', 'SOL']);
    expect(result.crypto.map((g) => g.openTradeOnly)).toEqual([false, false, true]);
    expect(result.equities).toEqual([]);
  });

  it('dedupes a story shared across tickers so the larger holding keeps it', async () => {
    const btc = makeAsset({ currentPriceUsd: null });
    const eth = makeAsset({ id: 'asset-eth', symbol: 'ETH', name: 'Ethereum' });
    mocks.positionFindMany.mockResolvedValue([
      makePosition(btc, { marketValueUsd: 100 }),
      makePosition(eth, { marketValueUsd: 5000 }),
    ]);
    const shared = newsItem('shared-story');
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === 'BTC-USD') return [shared, newsItem('btc-only')];
      if (query === 'ETH-USD') return [shared];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto.map((g) => g.symbol)).toEqual(['ETH', 'BTC']);
    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['shared-story']);
    expect(result.crypto[1].items.map((i) => i.id)).toEqual(['btc-only']);
  });

  it('caps per-asset items at 5 sorted newest first', async () => {
    const btc = makeAsset();
    mocks.positionFindMany.mockResolvedValue([makePosition(btc)]);
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query !== 'BTC-USD') return [];
      return [
        newsItem('old', '2026-08-20T00:00:00.000Z'),
        newsItem('newest', '2026-08-24T00:00:00.000Z'),
        newsItem('a', '2026-08-23T00:00:00.000Z'),
        newsItem('b', '2026-08-22T00:00:00.000Z'),
        newsItem('c', '2026-08-21T00:00:00.000Z'),
        newsItem('undated', null),
      ];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['newest', 'a', 'b', 'c', 'old']);
  });

  it('merges macro queries, dedupes repeats, and caps at 10 newest', async () => {
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === '^GSPC') {
        return [
          newsItem('spx-0', '2026-08-24T12:00:00.000Z'),
          ...Array.from({ length: 5 }, (_, i) =>
            newsItem(`spx-${i + 1}`, `2026-08-2${i % 4}T00:00:00.000Z`)
          ),
        ];
      }
      if (query === '^TNX')
        return [newsItem('spx-0'), ...[1, 2, 3, 4, 5].map((i) => newsItem(`tnx-${i}`))];
      if (query === 'inflation') return [newsItem('cpi-1')];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.macro).toHaveLength(10);
    const ids = result.macro.map((i) => i.id);
    expect(new Set(ids).size).toBe(10);
    expect(ids.filter((id) => id === 'spx-0')).toHaveLength(1);
  });

  it('returns a valid empty response when the user holds nothing newsworthy', async () => {
    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto).toEqual([]);
    expect(result.equities).toEqual([]);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
  });
});
