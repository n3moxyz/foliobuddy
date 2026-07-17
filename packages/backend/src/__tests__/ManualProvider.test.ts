import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assetFindMany: vi.fn(),
  assetFindFirst: vi.fn(),
  priceHistoryFindMany: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    asset: { findMany: mocks.assetFindMany, findFirst: mocks.assetFindFirst },
    priceHistory: { findMany: mocks.priceHistoryFindMany },
  },
}));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: mocks.loggerInfo, warn: vi.fn(), error: vi.fn() },
}));

const { ManualProvider } = await import('../services/providers/ManualProvider.js');

describe('ManualProvider', () => {
  beforeEach(() => vi.clearAllMocks());

  it('avoids a database query for an empty price request', async () => {
    await expect(new ManualProvider().getPrices([])).resolves.toEqual(new Map());
    expect(mocks.assetFindMany).not.toHaveBeenCalled();
  });

  it('maps only assets that have both an ID and a latest NAV row', async () => {
    mocks.assetFindMany.mockResolvedValue([
      {
        providerAssetId: 'fund-1',
        priceHistory: [{ priceUsd: 2, nativePrice: 2.5, nativeCurrency: 'SGD', fxRateToUsd: 0.8 }],
      },
      { providerAssetId: 'fund-2', priceHistory: [] },
      { providerAssetId: null, priceHistory: [{ priceUsd: 99 }] },
    ]);

    await expect(new ManualProvider().getPrices(['fund-1', 'fund-2'])).resolves.toEqual(
      new Map([
        ['fund-1', { priceUsd: 2, nativePrice: 2.5, nativeCurrency: 'SGD', fxRateToUsd: 0.8 }],
      ])
    );
  });

  it('returns empty history without querying rows when the asset is unknown', async () => {
    mocks.assetFindFirst.mockResolvedValue(null);
    await expect(new ManualProvider().getHistoricalPrices('missing', 30)).resolves.toEqual([]);
    expect(mocks.priceHistoryFindMany).not.toHaveBeenCalled();
  });

  it('maps stored history to provider points in chronological order', async () => {
    mocks.assetFindFirst.mockResolvedValue({ id: 'asset-1' });
    mocks.priceHistoryFindMany.mockResolvedValue([
      { timestamp: new Date('2026-01-01T00:00:00Z'), priceUsd: 1, nativePrice: 1.3 },
      { timestamp: new Date('2026-01-02T00:00:00Z'), priceUsd: 2, nativePrice: 2.6 },
    ]);

    await expect(new ManualProvider().getHistoricalPrices('fund-1', 30)).resolves.toEqual([
      { timestamp: 1767225600000, priceUsd: 1, nativePrice: 1.3 },
      { timestamp: 1767312000000, priceUsd: 2, nativePrice: 2.6 },
    ]);
    expect(mocks.priceHistoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { timestamp: 'asc' } })
    );
  });
});
