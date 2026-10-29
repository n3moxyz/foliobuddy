import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  portfolioGetSummary: vi.fn(),
  getExchangeRates: vi.fn(),
  getPrice: vi.fn(),
  positionFindMany: vi.fn(),
  snapshotFindFirst: vi.fn(),
  snapshotFindMany: vi.fn(),
  snapshotCreate: vi.fn(),
  fxRateFindUnique: vi.fn(),
  fxRateFindMany: vi.fn(),
}));

vi.mock('../services/portfolioService.js', () => ({
  portfolioService: { getSummary: mocks.portfolioGetSummary },
}));
vi.mock('../services/priceService.js', () => ({
  priceService: {
    getExchangeRates: mocks.getExchangeRates,
    getPrice: mocks.getPrice,
  },
}));
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    $transaction: (work: (tx: unknown) => unknown) =>
      work({
        position: { findMany: mocks.positionFindMany },
        fxRate: { findUnique: mocks.fxRateFindUnique, findMany: mocks.fxRateFindMany },
      }),
    position: { findMany: mocks.positionFindMany },
    snapshot: {
      findFirst: mocks.snapshotFindFirst,
      findMany: mocks.snapshotFindMany,
      create: mocks.snapshotCreate,
    },
  },
}));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { snapshotService } = await import('../services/snapshotService.js');

describe('snapshotService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T10:00:00.000Z'));
    vi.clearAllMocks();
    mocks.portfolioGetSummary.mockResolvedValue({
      totalValueUsd: 200,
      totalCostBasis: 100,
      unrealizedPnL: 100,
    });
    mocks.getExchangeRates.mockResolvedValue({ usdSgd: 1.4 });
    mocks.fxRateFindUnique.mockResolvedValue({ rate: 1.4 });
    mocks.fxRateFindMany.mockResolvedValue([]);
    mocks.positionFindMany.mockResolvedValue([
      {
        assetId: 'abc-row',
        quantity: 2,
        marketValueUsd: null,
        asset: { symbol: 'ABC', currentPriceUsd: 50 },
      },
    ]);
    mocks.snapshotCreate.mockImplementation(async ({ data }) => ({ id: 'snapshot-1', ...data }));
  });

  afterEach(() => vi.useRealTimers());

  it('uses one stored FX view for cash rows and snapshot conversion even when the provider has moved', async () => {
    mocks.portfolioGetSummary.mockResolvedValue({
      totalValueUsd: 80,
      totalValueSgd: 100,
      totalCostBasis: 80,
      unrealizedPnL: 0,
    });
    mocks.getExchangeRates.mockResolvedValue({ usdSgd: 1.3 });
    mocks.fxRateFindUnique.mockResolvedValue({ rate: 1.25 });
    mocks.fxRateFindMany.mockResolvedValue([{ toCcy: 'SGD', rate: 1.25, timestamp: new Date() }]);
    mocks.positionFindMany.mockResolvedValue([
      {
        assetId: 'sgd',
        quantity: 100,
        avgCostUsd: 0.74,
        asset: { symbol: 'SGD', category: 'CASH', priceProvider: 'manual', currentPriceUsd: 0.74 },
      },
    ]);
    mocks.getPrice.mockResolvedValue(100);
    mocks.snapshotFindFirst.mockResolvedValue(null);
    await snapshotService.createSnapshot('user-1');
    const data = mocks.snapshotCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({ totalValueUsd: 80, totalValueSgd: 100, usdSgdRate: 1.25 });
    expect(data.positions.create[0]).toMatchObject({
      priceUsd: 0.8,
      valueUsd: 80,
      allocation: 100,
    });
    expect(mocks.getExchangeRates).not.toHaveBeenCalled();
  });

  it('uses one coherent benchmark price state and never divides by zero baselines', async () => {
    mocks.getPrice
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(200)
      .mockResolvedValueOnce(110)
      .mockResolvedValueOnce(220);
    mocks.snapshotFindFirst
      .mockResolvedValueOnce({ totalValueUsd: 0 })
      .mockResolvedValueOnce({ totalValueUsd: 0 })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ totalValueUsd: 100, btcPrice: 50, ethPrice: 100 })
      .mockResolvedValueOnce({ totalValueUsd: 250 });

    await snapshotService.createSnapshot('user-1');

    expect(mocks.getPrice).toHaveBeenCalledTimes(2);
    const data = mocks.snapshotCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      btcPrice: 100,
      ethPrice: 200,
      dailyReturn: null,
      weeklyReturn: null,
      monthlyReturn: null,
      ytdReturn: 100,
      btcOutperform: 0,
      ethOutperform: 0,
      athValueUsd: 250,
    });
    expect(data.positions.create).toEqual([
      {
        // Stored so the label never depends on a ticker other assets can share.
        assetId: 'abc-row',
        assetSymbol: 'ABC',
        quantity: 2,
        priceUsd: 50,
        valueUsd: 100,
        allocation: 50,
      },
    ]);
  });

  it('returns null metrics when the YTD baseline is zero instead of serializing non-finite values', async () => {
    mocks.getPrice.mockResolvedValueOnce(100).mockResolvedValueOnce(200);
    mocks.snapshotFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ totalValueUsd: 0, btcPrice: 0, ethPrice: 0 })
      .mockResolvedValueOnce(null);

    await snapshotService.createSnapshot('user-1');

    expect(mocks.snapshotCreate.mock.calls[0][0].data).toMatchObject({
      ytdReturn: null,
      btcOutperform: null,
      ethOutperform: null,
    });
  });

  it('queries calendar-year monthly returns with UTC boundaries', async () => {
    mocks.snapshotFindMany.mockResolvedValue([]);

    await snapshotService.getMonthlyReturns('user-1', 2026);

    expect(mocks.snapshotFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          timestamp: {
            gte: new Date('2026-01-01T00:00:00.000Z'),
            lt: new Date('2027-01-01T00:00:00.000Z'),
          },
        }),
      })
    );
  });
});
