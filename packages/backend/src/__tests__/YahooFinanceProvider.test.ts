import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartMock = vi.fn();
const quoteMock = vi.fn();
const searchMock = vi.fn();

vi.mock('yahoo-finance2', () => ({
  default: vi.fn(function YahooFinance() {
    return {
      chart: chartMock,
      quote: quoteMock,
      search: searchMock,
    };
  }),
}));

const mockPrisma = {
  fxRate: { findUnique: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { YahooFinanceProvider } = await import('../services/providers/YahooFinanceProvider.js');

describe('YahooFinanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fxRate.findUnique.mockResolvedValue(null);
  });

  it('fetches index history through yahoo-finance2 chart for symbols like ^GSPC', async () => {
    chartMock.mockResolvedValue({
      meta: { currency: 'USD' },
      quotes: [
        { date: new Date('2026-01-02T00:00:00.000Z'), close: 5000 },
        { date: new Date('2026-01-03T00:00:00.000Z'), close: null },
        { date: new Date('2026-01-04T00:00:00.000Z'), close: 5100 },
      ],
    });

    const provider = new YahooFinanceProvider();
    const history = await provider.getHistoricalPrices('^GSPC', 30);

    expect(chartMock).toHaveBeenCalledWith(
      '^GSPC',
      expect.objectContaining({
        interval: '1d',
        includePrePost: false,
        return: 'array',
      })
    );
    expect(history).toEqual([
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z').getTime(),
        priceUsd: 5000,
        nativePrice: 5000,
      },
      {
        timestamp: new Date('2026-01-04T00:00:00.000Z').getTime(),
        priceUsd: 5100,
        nativePrice: 5100,
      },
    ]);
  });

  it('surfaces Kioxia Tokyo listing ahead of OTC and European cross-listings', async () => {
    searchMock
      .mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'KXHICF',
            shortname: 'KIOXIA HLDGS CORP',
            quoteType: 'EQUITY',
            exchDisp: 'OTC Markets',
          },
          {
            symbol: 'KXIAY',
            shortname: 'KIOXIA HLDGS CORP',
            quoteType: 'EQUITY',
            exchDisp: 'OTC Markets',
          },
          {
            symbol: 'KI5.F',
            longname: 'Kioxia Holdings Corporation',
            quoteType: 'EQUITY',
            exchDisp: 'Frankfurt',
          },
        ],
      })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] });
    quoteMock.mockImplementation(async (symbol: string) => {
      if (symbol === '285A.T') {
        return {
          symbol: '285A.T',
          quoteType: 'EQUITY',
          longName: 'Kioxia Holdings Corporation',
          fullExchangeName: 'Tokyo Stock Exchange',
          currency: 'JPY',
        };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const results = await provider.search('kioxia');

    // Fans out across all configured regions, not just JP — guards against a region
    // being dropped from SEARCH_REGIONS (which would silently lose listings).
    expect(searchMock).toHaveBeenCalledTimes(5);
    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'US' }));
    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'JP' }));
    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'TW' }));
    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'KR' }));
    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'NO' }));
    expect(results[0]).toMatchObject({
      providerAssetId: '285A.T',
      symbol: '285A.T',
      exchange: 'Tokyo Stock Exchange',
      nativeCurrency: 'JPY',
    });
    expect(results.findIndex((result) => result.symbol === '285A.T')).toBeLessThan(
      results.findIndex((result) => result.symbol === 'KXHICF')
    );
  });

  it('surfaces Oslo listings as NOK-native equity search results', async () => {
    searchMock
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({ quotes: [] })
      .mockResolvedValueOnce({
        quotes: [
          {
            symbol: 'ENH.OL',
            longname: 'FED Energy Holdings ASA',
            quoteType: 'EQUITY',
            exchDisp: 'Oslo',
          },
        ],
      });

    const provider = new YahooFinanceProvider();
    const results = await provider.search('FED Energy Holdings');

    expect(results[0]).toMatchObject({
      providerAssetId: 'ENH.OL',
      symbol: 'ENH.OL',
      exchange: 'Oslo',
      nativeCurrency: 'NOK',
    });
  });

  it('looks up Oslo suffix tickers directly', async () => {
    searchMock.mockResolvedValue({ quotes: [] });
    quoteMock.mockImplementation(async (symbol: string) => {
      if (symbol === 'ENH.OL') {
        return {
          symbol: 'ENH.OL',
          quoteType: 'EQUITY',
          longName: 'FED Energy Holdings ASA',
          fullExchangeName: 'Oslo Stock Exchange',
          currency: 'NOK',
        };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const results = await provider.search('ENH');

    expect(quoteMock).toHaveBeenCalledWith('ENH.OL');
    expect(results[0]).toMatchObject({
      providerAssetId: 'ENH.OL',
      symbol: 'ENH.OL',
      exchange: 'Oslo Stock Exchange',
      nativeCurrency: 'NOK',
    });
  });

  it('converts Japanese equity prices to USD using USD/JPY', async () => {
    quoteMock.mockImplementation(async (symbolOrSymbols: string | string[]) => {
      if (Array.isArray(symbolOrSymbols)) {
        return [{ symbol: '285A.T', regularMarketPrice: 2400, currency: 'JPY' }];
      }
      if (symbolOrSymbols === 'JPY=X') {
        return { symbol: 'JPY=X', regularMarketPrice: 150 };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const prices = await provider.getPrices(['285A.T']);

    expect(prices.get('285A.T')).toEqual({
      priceUsd: 16,
      nativePrice: 2400,
      nativeCurrency: 'JPY',
      fxRateToUsd: 1 / 150,
    });
  });

  it('converts Taiwanese equity prices to USD using USD/TWD', async () => {
    quoteMock.mockImplementation(async (symbolOrSymbols: string | string[]) => {
      if (Array.isArray(symbolOrSymbols)) {
        return [{ symbol: '2330.TW', regularMarketPrice: 640, currency: 'TWD' }];
      }
      if (symbolOrSymbols === 'TWD=X') {
        return { symbol: 'TWD=X', regularMarketPrice: 32 };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const prices = await provider.getPrices(['2330.TW']);

    expect(prices.get('2330.TW')).toEqual({
      priceUsd: 20,
      nativePrice: 640,
      nativeCurrency: 'TWD',
      fxRateToUsd: 1 / 32,
    });
  });

  it('converts Korean equity prices to USD using USD/KRW', async () => {
    quoteMock.mockImplementation(async (symbolOrSymbols: string | string[]) => {
      if (Array.isArray(symbolOrSymbols)) {
        return [{ symbol: '005930.KS', regularMarketPrice: 69000, currency: 'KRW' }];
      }
      if (symbolOrSymbols === 'KRW=X') {
        return { symbol: 'KRW=X', regularMarketPrice: 1380 };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const prices = await provider.getPrices(['005930.KS']);

    expect(prices.get('005930.KS')).toEqual({
      priceUsd: 50,
      nativePrice: 69000,
      nativeCurrency: 'KRW',
      fxRateToUsd: 1 / 1380,
    });
  });

  it('converts Norwegian equity prices to USD using USD/NOK', async () => {
    quoteMock.mockImplementation(async (symbolOrSymbols: string | string[]) => {
      if (Array.isArray(symbolOrSymbols)) {
        return [{ symbol: 'ENH.OL', regularMarketPrice: 21, currency: 'NOK' }];
      }
      if (symbolOrSymbols === 'NOK=X') {
        return { symbol: 'NOK=X', regularMarketPrice: 10.5 };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const prices = await provider.getPrices(['ENH.OL']);

    expect(prices.get('ENH.OL')).toEqual({
      priceUsd: 2,
      nativePrice: 21,
      nativeCurrency: 'NOK',
      fxRateToUsd: 1 / 10.5,
    });
  });

  it('converts non-USD historical chart prices to USD using the currency FX rate', async () => {
    chartMock.mockResolvedValue({
      meta: { currency: 'JPY' },
      quotes: [
        { date: new Date('2026-01-02T00:00:00.000Z'), close: 3000 },
        { date: new Date('2026-01-03T00:00:00.000Z'), close: null },
        { date: new Date('2026-01-04T00:00:00.000Z'), close: 3300 },
      ],
    });
    quoteMock.mockImplementation(async (symbol: string) => {
      if (symbol === 'JPY=X') return { symbol: 'JPY=X', regularMarketPrice: 150 };
      return null;
    });

    const provider = new YahooFinanceProvider();
    const history = await provider.getHistoricalPrices('285A.T', 30);

    expect(history).toEqual([
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z').getTime(),
        priceUsd: 20,
        nativePrice: 3000,
      },
      {
        timestamp: new Date('2026-01-04T00:00:00.000Z').getTime(),
        priceUsd: 22,
        nativePrice: 3300,
      },
    ]);
  });

  it('uses a stored DB FX rate instead of fetching one from Yahoo', async () => {
    mockPrisma.fxRate.findUnique.mockResolvedValue({
      fromCcy: 'USD',
      toCcy: 'JPY',
      rate: 160,
    });
    quoteMock.mockImplementation(async (symbolOrSymbols: string | string[]) => {
      if (Array.isArray(symbolOrSymbols)) {
        return [{ symbol: '285A.T', regularMarketPrice: 3200, currency: 'JPY' }];
      }
      // Yahoo FX fallback — must NOT be reached when the DB rate is present.
      if (symbolOrSymbols === 'JPY=X') {
        return { symbol: 'JPY=X', regularMarketPrice: 150 };
      }
      return null;
    });

    const provider = new YahooFinanceProvider();
    const prices = await provider.getPrices(['285A.T']);

    expect(quoteMock).not.toHaveBeenCalledWith('JPY=X');
    expect(prices.get('285A.T')).toEqual({
      priceUsd: 20,
      nativePrice: 3200,
      nativeCurrency: 'JPY',
      fxRateToUsd: 1 / 160,
    });
  });

  it('maps search news into news items, tolerating unix-second timestamps, and caches', async () => {
    searchMock.mockResolvedValue({
      quotes: [],
      news: [
        {
          uuid: 'story-1',
          title: 'Bitcoin ETF inflows climb',
          publisher: 'CoinDesk',
          link: 'https://example.com/story-1',
          providerPublishTime: new Date('2026-08-24T08:00:00.000Z'),
        },
        {
          uuid: 'story-2',
          title: 'Unix-stamped story',
          publisher: 'Wire',
          link: 'https://example.com/story-2',
          providerPublishTime: 1787904000,
        },
        { uuid: 'broken', publisher: 'Wire' },
      ],
    });

    const provider = new YahooFinanceProvider();
    const first = await provider.getNews('BTC-USD', 8);
    const second = await provider.getNews('BTC-USD', 8);

    expect(searchMock).toHaveBeenCalledTimes(1);
    expect(searchMock).toHaveBeenCalledWith('BTC-USD', {
      quotesCount: 0,
      newsCount: 8,
      lang: 'en-US',
      region: 'US',
    });
    expect(first).toEqual([
      {
        id: 'story-1',
        title: 'Bitcoin ETF inflows climb',
        publisher: 'CoinDesk',
        url: 'https://example.com/story-1',
        publishedAt: '2026-08-24T08:00:00.000Z',
      },
      {
        id: 'story-2',
        title: 'Unix-stamped story',
        publisher: 'Wire',
        url: 'https://example.com/story-2',
        publishedAt: new Date(1787904000 * 1000).toISOString(),
      },
    ]);
    expect(second).toEqual(first);
  });

  it('returns an empty news list on failure without caching the failure', async () => {
    searchMock.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce({
      quotes: [],
      news: [
        {
          uuid: 'story-3',
          title: 'Recovered story',
          publisher: 'Wire',
          link: 'https://example.com/story-3',
          providerPublishTime: new Date('2026-08-24T09:00:00.000Z'),
        },
      ],
    });

    const provider = new YahooFinanceProvider();
    const failed = await provider.getNews('ETH-USD', 8);
    const retried = await provider.getNews('ETH-USD', 8);

    expect(failed).toEqual([]);
    expect(retried).toHaveLength(1);
    expect(searchMock).toHaveBeenCalledTimes(2);
  });
});
