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

    expect(searchMock).toHaveBeenCalledWith('kioxia', expect.objectContaining({ region: 'JP' }));
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
});
