import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  coingeckoGetHistoricalPrices: vi.fn(),
  yahooGetHistoricalPrices: vi.fn(),
  manualGetHistoricalPrices: vi.fn(),
  assetFindFirst: vi.fn(),
  priceHistoryFindMany: vi.fn(),
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    asset: {
      findFirst: mocks.assetFindFirst,
    },
    priceHistory: {
      findMany: mocks.priceHistoryFindMany,
    },
  },
}));

vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: mocks.loggerWarn,
    error: mocks.loggerError,
  },
}));

vi.mock('../services/providers/CoinGeckoProvider.js', () => ({
  CoinGeckoProvider: vi.fn().mockImplementation(function () {
    return {
      name: 'coingecko',
      refreshIntervalMinutes: 1,
      getPrices: vi.fn(),
      search: vi.fn(),
      getHistoricalPrices: mocks.coingeckoGetHistoricalPrices,
      clearCache: vi.fn(),
    };
  }),
}));

vi.mock('../services/providers/YahooFinanceProvider.js', () => ({
  YahooFinanceProvider: vi.fn().mockImplementation(function () {
    return {
      name: 'yahoo',
      refreshIntervalMinutes: 60,
      getPrices: vi.fn(),
      search: vi.fn(),
      getHistoricalPrices: mocks.yahooGetHistoricalPrices,
      getUsdExchangeRates: vi.fn(),
      clearCache: vi.fn(),
    };
  }),
}));

vi.mock('../services/providers/ManualProvider.js', () => ({
  ManualProvider: vi.fn().mockImplementation(function () {
    return {
      name: 'manual',
      refreshIntervalMinutes: Infinity,
      getPrices: vi.fn(),
      search: vi.fn(),
      getHistoricalPrices: mocks.manualGetHistoricalPrices,
    };
  }),
}));

const { priceService } = await import('../services/priceService.js');

describe('priceService.getAssetHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns provider history when the provider succeeds', async () => {
    mocks.coingeckoGetHistoricalPrices.mockResolvedValue([
      { timestamp: 1767225600000, priceUsd: 50000 },
    ]);

    await expect(priceService.getAssetHistory('coingecko', 'bitcoin', 30)).resolves.toEqual([
      { timestamp: 1767225600000, priceUsd: 50000 },
    ]);
    expect(mocks.assetFindFirst).not.toHaveBeenCalled();
    expect(mocks.priceHistoryFindMany).not.toHaveBeenCalled();
  });

  it('falls back to stored price history when the provider fails', async () => {
    mocks.coingeckoGetHistoricalPrices.mockRejectedValue(new Error('network unavailable'));
    mocks.assetFindFirst.mockResolvedValue({ id: 'asset-btc' });
    mocks.priceHistoryFindMany.mockResolvedValue([
      {
        timestamp: new Date('2026-01-01T00:00:00.000Z'),
        priceUsd: 49000,
        nativePrice: null,
      },
      {
        timestamp: new Date('2026-01-01T23:00:00.000Z'),
        priceUsd: 50000,
        nativePrice: null,
      },
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z'),
        priceUsd: 50500,
        nativePrice: null,
      },
    ]);

    await expect(priceService.getAssetHistory('coingecko', 'bitcoin', 30)).resolves.toEqual([
      { timestamp: 1767308400000, priceUsd: 50000, nativePrice: null },
      { timestamp: 1767312000000, priceUsd: 50500, nativePrice: null },
    ]);
    expect(mocks.loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('coingecko provider failed for bitcoin'),
      expect.any(Error)
    );
    expect(mocks.assetFindFirst).toHaveBeenCalledWith({
      where: {
        priceProvider: 'coingecko',
        providerAssetId: 'bitcoin',
      },
      select: { id: true },
    });
    expect(mocks.priceHistoryFindMany).toHaveBeenCalledWith({
      where: {
        assetId: 'asset-btc',
        timestamp: { gte: expect.any(Date) },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        priceUsd: true,
        nativePrice: true,
      },
    });
  });
});
