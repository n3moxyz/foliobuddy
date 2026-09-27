import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderNewsItem } from '../services/providers/types.js';

const mocks = vi.hoisted(() => ({
  positionFindMany: vi.fn(),
  tradeFindMany: vi.fn(),
  getNews: vi.fn(),
  googleSearch: vi.fn(),
  xPostFindMany: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    position: { findMany: mocks.positionFindMany },
    trade: { findMany: mocks.tradeFindMany },
    xPost: { findMany: mocks.xPostFindMany },
  },
}));
vi.mock('../services/priceService.js', () => ({
  priceService: { getYahooProvider: () => ({ getNews: mocks.getNews }) },
}));
vi.mock('../services/news/enrichmentService.js', () => ({
  newsEnrichmentService: { trackAndQueue: vi.fn(), getResponseFor: vi.fn() },
}));
vi.mock('../services/news/googleNews.js', () => ({
  googleNewsClient: { search: mocks.googleSearch },
}));

const { newsService, newsBucketFor } = await import('../services/newsService.js');
const { clearXPostCache } = await import('../services/news/xPostMatching.js');

const MACRO_QUERIES = ['^GSPC', '^TNX', 'DX-Y.NYB', 'Federal Reserve', 'inflation'];

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
    // Distinct signature per id — single-character tokens are dropped by
    // titleSignature, so "Story a"/"Story b" would otherwise cluster together.
    title: `Story ${id.replace(/-/g, '')}x`,
    publisher: 'Test Wire',
    url: `https://example.com/${id}`,
    publishedAt,
  } satisfies ProviderNewsItem;
}

function customItem(
  id: string,
  title: string,
  publisher: string,
  publishedAt: string | null,
  url = ''
): ProviderNewsItem {
  return { id, title, publisher, url: url || `https://example.com/${id}`, publishedAt };
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

describe('newsService.getPortfolioNews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    mocks.positionFindMany.mockResolvedValue([]);
    mocks.tradeFindMany.mockResolvedValue([]);
    mocks.getNews.mockResolvedValue([]);
    mocks.googleSearch.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
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

  it('queries coins by name, non-US listings by company name, and skips unmappable assets', async () => {
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

    const queried = mocks.getNews.mock.calls.map(([query]) => query as string);
    // Yahoo returns nothing for SOL-USD / 285A.T, but tagged coverage by name.
    expect(queried.filter((q) => !MACRO_QUERIES.includes(q)).sort()).toEqual([
      'Bitcoin',
      'Kioxia Holdings',
    ]);
    expect(queried.filter((q) => MACRO_QUERIES.includes(q))).toEqual(MACRO_QUERIES);
    // Google News is only for Singapore listings.
    expect(mocks.googleSearch).not.toHaveBeenCalled();
  });

  it('fetches the 40 largest holdings but lists every holding for search', async () => {
    mocks.positionFindMany.mockResolvedValue(
      Array.from({ length: 42 }, (_, index) => {
        const asset = makeAsset({
          id: `asset-${index}`,
          symbol: `C${index}`,
          name: `Coin ${index}`,
        });
        return makePosition(asset, { marketValueUsd: 42 - index });
      })
    );
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'Coin 0' ? [newsItem('c0-story')] : []
    );

    const result = await newsService.getPortfolioNews('user-1');

    const holdingQueries = mocks.getNews.mock.calls
      .map(([query]) => query as string)
      .filter((query) => !MACRO_QUERIES.includes(query));
    expect(holdingQueries).toHaveLength(40);
    expect(holdingQueries).toContain('Coin 0');
    expect(holdingQueries).not.toContain('Coin 41');

    expect(result.holdings).toHaveLength(42);
    expect(result.holdings[0]).toEqual({
      assetId: 'asset-0',
      symbol: 'C0',
      name: 'Coin 0',
      category: 'LIQUID_CRYPTO',
      bucket: 'crypto',
      openTradeOnly: false,
      storyCount: 1,
      loaded: true,
    });
    expect(result.holdings[1]).toMatchObject({ assetId: 'asset-1', storyCount: 0, loaded: true });
    expect(result.holdings.slice(40).map((h) => [h.assetId, h.loaded])).toEqual([
      ['asset-40', false],
      ['asset-41', false],
    ]);
  });

  it('keeps partial Yahoo results but rejects an all-failed refresh', async () => {
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === '^GSPC') return [newsItem('macro-ok')];
      throw new Error(`Yahoo unavailable for ${query}`);
    });

    const partial = await newsService.getPortfolioNews('user-1');
    expect(partial.macro.map((item) => item.id)).toEqual(['macro-ok']);

    mocks.getNews.mockRejectedValue(new Error('Yahoo unavailable'));
    await expect(newsService.getPortfolioNews('user-1')).rejects.toThrow('Yahoo unavailable');
  });

  it('orders groups by their best story, drops empty groups, and flags open-trade-only assets', async () => {
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
      if (query === 'Bitcoin') return [newsItem('btc-1')];
      if (query === 'Ethereum') return [newsItem('eth-1')];
      if (query === 'Solana') return [newsItem('sol-1')];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    // Equal stories: the larger holding's relevance bonus decides the order.
    expect(result.crypto.map((g) => g.symbol)).toEqual(['ETH', 'BTC', 'SOL']);
    expect(result.crypto.map((g) => g.openTradeOnly)).toEqual([false, false, true]);
    expect(result.crypto.map((g) => g.storyCount)).toEqual([1, 1, 1]);
    expect(result.equities).toEqual([]);
    expect(result.holdings.find((h) => h.assetId === 'asset-quiet')).toMatchObject({
      storyCount: 0,
      loaded: true,
    });
    // A quiet feed of trivial stories must not manufacture Top stories.
    expect(result.topStories).toEqual([]);
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
      if (query === 'Bitcoin') return [shared, newsItem('btc-only')];
      if (query === 'Ethereum') return [shared];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto.map((g) => g.symbol)).toEqual(['ETH', 'BTC']);
    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['shared-story']);
    expect(result.crypto[0].items[0].affectedSymbols).toEqual(['ETH', 'BTC']);
    expect(result.crypto[1].items.map((i) => i.id)).toEqual(['btc-only']);
    // Counts include the shared story wherever it touches.
    expect(result.crypto.map((g) => g.storyCount)).toEqual([1, 2]);
  });

  it('shows a shared story under a holding whose only coverage was filed elsewhere', async () => {
    const btc = makeAsset();
    const eth = makeAsset({ id: 'asset-eth', symbol: 'ETH', name: 'Ethereum' });
    mocks.positionFindMany.mockResolvedValue([
      makePosition(btc, { marketValueUsd: 100 }),
      makePosition(eth, { marketValueUsd: 5000 }),
    ]);
    const shared = newsItem('shared-story');
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'Bitcoin' || query === 'Ethereum' ? [shared] : []
    );

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto.map((g) => [g.symbol, g.items.map((i) => i.id)])).toEqual([
      ['ETH', ['shared-story']],
      ['BTC', ['shared-story']],
    ]);
    expect(result.holdings.map((h) => h.storyCount)).toEqual([1, 1]);
  });

  it('caps per-asset items at 5 sorted newest first', async () => {
    const btc = makeAsset();
    mocks.positionFindMany.mockResolvedValue([makePosition(btc)]);
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query !== 'Bitcoin') return [];
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
    expect(result.macro).toEqual([]);
    expect(result.topStories).toEqual([]);
    expect(result.holdings).toEqual([]);
    expect(Number.isNaN(Date.parse(result.fetchedAt))).toBe(false);
  });

  it('never exposes portfolio values or ranking weights in the response', async () => {
    const btc = makeAsset();
    mocks.positionFindMany.mockResolvedValue([makePosition(btc, { marketValueUsd: 123456 })]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'Bitcoin' ? [{ ...newsItem('btc-1'), relatedTickers: ['BTC-USD'] }] : []
    );

    const result = await newsService.getPortfolioNews('user-1');
    const serialized = JSON.stringify(result);

    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['btc-1']);
    // Provider tags are internal relevance inputs, not API surface.
    expect(serialized).not.toContain('relatedTickers');
    expect(serialized).not.toContain('valueUsd');
    expect(serialized).not.toContain('marketValue');
    expect(serialized).not.toContain('weight');
    expect(serialized).not.toContain('score');
    expect(serialized).not.toContain('123456');
  });

  it('surfaces genuinely material stories as top stories with interpretable labels', async () => {
    const btc = makeAsset();
    mocks.positionFindMany.mockResolvedValue([makePosition(btc, { marketValueUsd: 5000 })]);
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query !== 'Bitcoin') return [];
      return [
        customItem(
          'material',
          'SEC approves spot Bitcoin ETF options',
          'Reuters',
          '2026-08-25T06:00:00.000Z'
        ),
        newsItem('trivial', '2026-08-25T11:00:00.000Z'),
      ];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.topStories.map((i) => i.id)).toEqual(['material']);
    expect(result.topStories[0]).toMatchObject({
      importance: 'high',
      eventType: 'regulation',
      sourceTier: 2,
      primarySource: false,
      affectedSymbols: ['BTC'],
    });
    expect(result.topStories[0].rankingReasons).toContain('Regulation');
    // The story also stays in its holding group, ranked above the trivial one.
    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['material', 'trivial']);
  });

  it('keeps two assets that share a ticker symbol in separate groups', async () => {
    const dupCoin = makeAsset({ id: 'asset-dup-crypto', symbol: 'DUP', name: 'Dup Coin' });
    const dupCorp = makeAsset({
      id: 'asset-dup-equity',
      symbol: 'DUP',
      name: 'Dup Corp',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'DUP',
    });
    mocks.positionFindMany.mockResolvedValue([
      makePosition(dupCoin, { marketValueUsd: 3000 }),
      makePosition(dupCorp, { marketValueUsd: 1000 }),
    ]);
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === 'Dup Coin') return [newsItem('coin-story')];
      if (query === 'DUP') return [newsItem('corp-story')];
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.crypto.map((g) => g.assetId)).toEqual(['asset-dup-crypto']);
    expect(result.crypto[0].items.map((i) => i.id)).toEqual(['coin-story']);
    expect(result.equities.map((g) => g.assetId)).toEqual(['asset-dup-equity']);
    expect(result.equities[0].items.map((i) => i.id)).toEqual(['corp-story']);
  });

  it('awards Company announcement status via an asset officialDomain', async () => {
    const nvda = makeAsset({
      id: 'asset-nvda',
      symbol: 'NVDA',
      name: 'NVIDIA',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'NVDA',
      officialDomain: 'nvidia.com',
    });
    mocks.positionFindMany.mockResolvedValue([makePosition(nvda, { marketValueUsd: 5000 })]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'NVDA'
        ? [
            customItem(
              'ir',
              'Nvidia announces quarterly results and guidance',
              'NVIDIA Newsroom',
              '2026-08-25T06:00:00.000Z',
              'https://nvidianews.nvidia.com/news/q3-results'
            ),
          ]
        : []
    );

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.equities[0].items[0]).toMatchObject({
      primarySource: true,
      sourceTier: 1,
      sourceLabel: 'Company announcement',
    });
    expect(result.topStories.map((i) => i.id)).toEqual(['ir']);
  });

  it('ranks macro stories by importance rather than raw recency', async () => {
    mocks.getNews.mockImplementation(async (query: string) => {
      if (query === '^GSPC') {
        return [
          customItem(
            'drift',
            'S&P drifts sideways in quiet trading',
            'Test Wire',
            '2026-08-25T11:00:00.000Z'
          ),
        ];
      }
      if (query === 'Federal Reserve') {
        return [
          customItem(
            'fed',
            'Fed cuts rates by 25 basis points',
            'Reuters',
            '2026-08-24T06:00:00.000Z'
          ),
        ];
      }
      return [];
    });

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.macro.map((i) => i.id)).toEqual(['fed', 'drift']);
  });

  it('keeps only relevant name-query results and adds Google News for SGX listings', async () => {
    const dbs = makeAsset({
      id: 'asset-dbs',
      symbol: 'D05.SI',
      name: 'DBS Group Holdings Ltd',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'D05.SI',
    });
    mocks.positionFindMany.mockResolvedValue([makePosition(dbs, { marketValueUsd: 5000 })]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'DBS Group Holdings'
        ? [
            {
              ...customItem(
                'tagged',
                'Jefferies starts coverage of Singapore banks',
                'Reuters',
                '2026-08-24T06:00:00.000Z'
              ),
              relatedTickers: ['D05.SI', 'O39.SI'],
            },
            {
              ...customItem(
                'named',
                'DBS expands its gold vault in Singapore',
                'Bloomberg',
                '2026-08-24T07:00:00.000Z'
              ),
              relatedTickers: ['DBSDY'],
            },
            {
              ...customItem(
                'unrelated',
                'Restaurant group widens distribution deal',
                'Test Wire',
                '2026-08-24T08:00:00.000Z'
              ),
              relatedTickers: ['GENK'],
            },
          ]
        : []
    );
    mocks.googleSearch.mockResolvedValue([
      {
        id: 'gnews:abc',
        title: 'DBS planning successor for long-term chairman',
        publisher: 'The Straits Times',
        url: 'https://news.google.com/rss/articles/abc?oc=5',
        publishedAt: '2026-08-25T01:00:00.000Z',
        sourceUrl: 'https://www.straitstimes.com',
      },
    ]);

    const result = await newsService.getPortfolioNews('user-1');

    expect(mocks.getNews).toHaveBeenCalledWith('DBS Group Holdings', 10);
    expect(mocks.googleSearch).toHaveBeenCalledWith('"DBS Group Holdings"', 14, 10);
    const [group] = result.equities;
    expect(group.items.map((i) => i.id).sort()).toEqual(['gnews:abc', 'named', 'tagged']);
    expect(group.storyCount).toBe(3);
    const google = group.items.find((i) => i.id === 'gnews:abc')!;
    // Classified by the publisher's own site, not the news.google.com redirect.
    expect(google).toMatchObject({ sourceTier: 3, sourceLabel: 'Specialist' });
    expect(JSON.stringify(result)).not.toContain('sourceUrl');
  });

  it('never lets a Google News failure fail the feed', async () => {
    const dbs = makeAsset({
      id: 'asset-dbs',
      symbol: 'D05.SI',
      name: 'DBS Group Holdings Ltd',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'D05.SI',
    });
    mocks.positionFindMany.mockResolvedValue([makePosition(dbs)]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'DBS Group Holdings' ? [newsItem('yahoo-dbs')] : []
    );
    mocks.googleSearch.mockRejectedValue(new Error('blocked'));

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.equities[0].items.map((i) => i.id)).toEqual(['yahoo-dbs']);
  });
});

describe('newsService.getAssetNews', () => {
  const dbs = makeAsset({
    id: 'asset-dbs',
    symbol: 'D05.SI',
    name: 'DBS Group Holdings Ltd',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: 'D05.SI',
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    mocks.positionFindMany.mockResolvedValue([]);
    mocks.tradeFindMany.mockResolvedValue([]);
    mocks.getNews.mockResolvedValue([]);
    mocks.googleSearch.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('404s unless the asset is an owned holding or open trade with a news feed', async () => {
    const fund = makeAsset({
      id: 'asset-fund',
      symbol: 'FUND',
      name: 'Manual Fund',
      category: 'UNIT_TRUST',
      priceProvider: 'manual',
      providerAssetId: null,
    });
    mocks.positionFindMany.mockResolvedValue([makePosition(fund)]);

    await expect(newsService.getAssetNews('user-1', 'asset-btc')).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(newsService.getAssetNews('user-1', 'asset-fund')).rejects.toMatchObject({
      statusCode: 404,
    });
    // Ownership comes from the same scoped queries as the feed (custody excluded).
    expect(mocks.positionFindMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', custodyOf: null },
      include: { asset: true },
    });
    expect(mocks.getNews).not.toHaveBeenCalled();
  });

  it('returns 60 days of stories newest first, with undated ones last', async () => {
    const btc = makeAsset();
    mocks.positionFindMany.mockResolvedValue([makePosition(btc)]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'Bitcoin'
        ? [
            newsItem('undated', null),
            newsItem('forty-days', '2026-07-16T12:00:00.000Z'),
            newsItem('seventy-days', '2026-06-16T12:00:00.000Z'),
            newsItem('two-days', '2026-08-23T12:00:00.000Z'),
          ]
        : []
    );

    const result = await newsService.getAssetNews('user-1', 'asset-btc');

    expect(mocks.getNews).toHaveBeenCalledWith('Bitcoin', 30);
    expect(result.items.map((i) => i.id)).toEqual(['two-days', 'forty-days', 'undated']);
    expect(result.windowDays).toBe(60);
    expect(result.holding).toEqual({
      assetId: 'asset-btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      category: 'LIQUID_CRYPTO',
      bucket: 'crypto',
      openTradeOnly: false,
    });
    expect(mocks.googleSearch).not.toHaveBeenCalled();
  });

  it('serves open-trade-only holdings', async () => {
    const sol = makeAsset({ id: 'asset-sol', symbol: 'SOL', name: 'Solana' });
    mocks.tradeFindMany.mockResolvedValue([{ assetId: sol.id, asset: sol }]);
    mocks.getNews.mockResolvedValue([newsItem('sol-1')]);

    const result = await newsService.getAssetNews('user-1', 'asset-sol');

    expect(result.holding.openTradeOnly).toBe(true);
    expect(result.items.map((i) => i.id)).toEqual(['sol-1']);
  });

  it('merges 60 days of Google News for SGX holdings and survives a Yahoo failure', async () => {
    mocks.positionFindMany.mockResolvedValue([makePosition(dbs)]);
    mocks.getNews.mockRejectedValue(new Error('Yahoo unavailable'));
    mocks.googleSearch.mockResolvedValue([
      {
        id: 'gnews:1',
        title: 'DBS lifts dividend after record quarter',
        publisher: 'The Business Times',
        url: 'https://news.google.com/rss/articles/1',
        publishedAt: '2026-08-10T00:00:00.000Z',
        sourceUrl: 'https://www.businesstimes.com.sg',
      },
    ]);

    const result = await newsService.getAssetNews('user-1', 'asset-dbs');

    expect(mocks.googleSearch).toHaveBeenCalledWith('"DBS Group Holdings"', 60, 40);
    expect(result.items.map((i) => i.id)).toEqual(['gnews:1']);
  });

  it('rejects when Yahoo fails and Google has nothing, so the client can retry', async () => {
    mocks.positionFindMany.mockResolvedValue([makePosition(dbs)]);
    mocks.getNews.mockRejectedValue(new Error('Yahoo unavailable'));

    await expect(newsService.getAssetNews('user-1', 'asset-dbs')).rejects.toThrow(
      'Yahoo unavailable'
    );
  });
});

describe('newsService with X roster posts', () => {
  const NOW_MS = Date.parse('2026-08-25T12:00:00.000Z');
  const nvda = makeAsset({
    id: 'asset-nvda',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: 'NVDA',
  });

  function xPost(id: string, text: string, hoursAgo: number, handle = 'fx_anchor') {
    return {
      id,
      authorHandle: handle,
      authorKey: handle,
      text,
      quotedPostId: null,
      quotedText: null,
      hasExternalLink: false,
      cashtags: [],
      postedAt: new Date(NOW_MS - hoursAgo * 60 * 60 * 1000),
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW_MS));
    vi.stubEnv('X_NEWS_SOURCES', 'fx_anchor:anchor_source,fx_radar:radar_only');
    clearXPostCache();
    mocks.positionFindMany.mockResolvedValue([makePosition(nvda, { marketValueUsd: 5000 })]);
    mocks.tradeFindMany.mockResolvedValue([]);
    mocks.googleSearch.mockResolvedValue([]);
    mocks.getNews.mockImplementation(async (query: string) =>
      query === 'NVDA'
        ? [
            customItem(
              'press',
              'Nvidia shares slip in quiet trading',
              'Reuters',
              '2026-08-25T06:00:00.000Z'
            ),
          ]
        : []
    );
    mocks.xPostFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('adds matched posts to the holding feed, capped per holding, never as Top stories', async () => {
    mocks.xPostFindMany.mockResolvedValue([
      xPost('1', 'Nvidia wins a $5 billion supply deal with a hyperscaler', 1),
      xPost('2', 'Nvidia Rubin orders keep climbing into next year', 2),
      xPost('3', 'Nvidia raises the Rubin build plan by a third', 3),
      xPost('4', 'Nvidia channel checks look healthy this month', 4),
      xPost('5', 'Nvidia radar chatter never reaches the main feed', 1, 'fx_radar'),
    ]);

    const result = await newsService.getPortfolioNews('user-1');

    const group = result.equities[0];
    expect(group.items.map((i) => i.id)).toEqual(['x:1', 'press', 'x:2', 'x:3']);
    expect(group.storyCount).toBe(4);
    expect(group.items[0]).toMatchObject({
      sourceKind: 'x_post',
      publisher: '@fx_anchor',
      url: 'https://x.com/fx_anchor/status/1',
      // Roles rank but are never sent: every post reads as unrated.
      sourceTier: 4,
      sourceLabel: null,
      primarySource: false,
      importance: 'high',
      affectedSymbols: ['NVDA'],
    });
    expect(group.items[1].sourceKind).toBe('article');
    expect(result.topStories).toEqual([]);
    expect(mocks.xPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postedAt: { gte: new Date(NOW_MS - 14 * 86400000) } } })
    );
  });

  it('keeps chatter from corroboration accounts out of the feed but on the holding page', async () => {
    vi.stubEnv('X_NEWS_SOURCES', 'fx_anchor:anchor_source,fx_corro:corroboration_source');
    mocks.xPostFindMany.mockResolvedValue([
      xPost('1', 'Nvidia channel checks look healthy this month', 1, 'fx_corro'),
      xPost('2', 'Nvidia wins a $5 billion supply deal with a hyperscaler', 2, 'fx_corro'),
      xPost('3', 'Nvidia Rubin orders keep climbing into next year', 3),
    ]);

    const feed = await newsService.getPortfolioNews('user-1');
    const page = await newsService.getAssetNews('user-1', 'asset-nvda');

    // Low-importance corroboration (x:1) never reaches the feed; an anchor's
    // post (x:3) and a corroborated event (x:2, capped at medium) do.
    expect(feed.equities[0].items.map((i) => i.id).sort()).toEqual(['press', 'x:2', 'x:3']);
    expect(feed.equities[0].items.find((i) => i.id === 'x:2')?.importance).toBe('medium');
    expect(page.items.map((i) => i.id)).toContain('x:1');
  });

  it('never exposes X internals in the response', async () => {
    mocks.xPostFindMany.mockResolvedValue([
      { ...xPost('1', 'Nvidia raises the Rubin build plan by a third', 1), quotedText: 'Q' },
    ]);

    const serialized = JSON.stringify(await newsService.getPortfolioNews('user-1'));

    expect(serialized).toContain('x:1');
    for (const internal of [
      'xRole',
      'maxImportance',
      'classificationText',
      'cashtags',
      'quotedText',
      'authorKey',
      'Anchor source',
      'Corroboration',
      'Radar',
    ]) {
      expect(serialized).not.toContain(internal);
    }
  });

  it('keeps the feed when stored posts cannot be read', async () => {
    mocks.xPostFindMany.mockRejectedValue(new Error('db down'));

    const result = await newsService.getPortfolioNews('user-1');

    expect(result.equities[0].items.map((i) => i.id)).toEqual(['press']);
  });

  it("shows radar posts on a holding's page, capped at 20, newest first", async () => {
    mocks.xPostFindMany.mockResolvedValue(
      Array.from({ length: 25 }, (_, i) =>
        xPost(
          String(100 + i),
          `Nvidia supply chain note ${100 + i} from the desk`,
          i + 1,
          i % 2 === 0 ? 'fx_anchor' : 'fx_radar'
        )
      )
    );

    const result = await newsService.getAssetNews('user-1', 'asset-nvda');

    const posts = result.items.filter((i) => i.sourceKind === 'x_post');
    expect(posts).toHaveLength(20);
    // Anchors (even ids) outrank radar, so all 13 anchor posts survive the cap.
    const anchorIds = Array.from({ length: 13 }, (_, i) => `x:${100 + 2 * i}`);
    expect(posts.map((i) => i.id)).toEqual(expect.arrayContaining(anchorIds));
    const times = result.items.map((i) => Date.parse(i.publishedAt!));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(mocks.xPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { postedAt: { gte: new Date(NOW_MS - 60 * 86400000) } } })
    );
  });

  it('still rejects a holding page when every headline source failed, posts or not', async () => {
    mocks.getNews.mockRejectedValue(new Error('Yahoo unavailable'));
    mocks.xPostFindMany.mockResolvedValue([xPost('1', 'Nvidia raises the build plan', 1)]);

    await expect(newsService.getAssetNews('user-1', 'asset-nvda')).rejects.toThrow(
      'Yahoo unavailable'
    );
  });
});
