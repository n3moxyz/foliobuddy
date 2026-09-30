import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  positionFindMany: vi.fn(),
  fxRateFindUnique: vi.fn(),
  snapshotFindFirst: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    position: { findMany: mocks.positionFindMany },
    fxRate: { findUnique: mocks.fxRateFindUnique },
    snapshot: { findFirst: mocks.snapshotFindFirst },
  },
}));

const { portfolioService } = await import('../services/portfolioService.js');

function position(overrides: Record<string, unknown> = {}) {
  return {
    assetId: 'asset-1',
    quantity: 2,
    marketValueUsd: null,
    unrealizedPnL: 10,
    unrealizedPnLPct: 5,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    asset: {
      symbol: 'ABC',
      name: 'ABC Corp',
      category: 'EQUITY',
      currentPriceUsd: 50,
    },
    ...overrides,
  };
}

describe('portfolioService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-17T10:00:00.000Z'));
    vi.clearAllMocks();
    mocks.fxRateFindUnique.mockResolvedValue(null);
    mocks.snapshotFindFirst.mockResolvedValue(null);
    mocks.positionFindMany.mockResolvedValue([]);
  });

  afterEach(() => vi.useRealTimers());

  it('uses the current UTC-year anchor and derives value when cached market value is absent', async () => {
    mocks.positionFindMany.mockResolvedValue([position()]);
    mocks.snapshotFindFirst.mockResolvedValue({
      timestamp: new Date('2026-01-02T00:00:00.000Z'),
      totalValueUsd: 80,
    });

    const summary = await portfolioService.getSummary('user-1');

    expect(summary).toMatchObject({
      totalValueUsd: 100,
      totalValueSgd: 135,
      totalCostBasis: 80,
      unrealizedPnL: 20,
      unrealizedPnLPct: 25,
      positionCount: 1,
      ytdStartDate: '2026-01-02T00:00:00.000Z',
    });
    expect(mocks.snapshotFindFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        timestamp: { gte: new Date('2026-01-01T00:00:00.000Z') },
      },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, totalValueUsd: true },
    });
  });

  it('keeps category allocation consistent with summary fallback valuation', async () => {
    mocks.positionFindMany.mockResolvedValue([
      position(),
      position({
        assetId: 'asset-2',
        marketValueUsd: 300,
        storageType: 'WALLET',
        storageLocation: null,
        asset: {
          symbol: 'BTC',
          name: 'Bitcoin',
          category: 'LIQUID_CRYPTO',
          currentPriceUsd: 300,
        },
      }),
    ]);

    await expect(portfolioService.getAllocationByCategory('user-1')).resolves.toEqual([
      { category: 'LIQUID_CRYPTO', valueUsd: 300, percentage: 75, positionCount: 1 },
      { category: 'EQUITY', valueUsd: 100, percentage: 25, positionCount: 1 },
    ]);
  });

  it('groups null storage locations without colliding with a literal default location', async () => {
    mocks.positionFindMany.mockResolvedValue([
      position({ marketValueUsd: 100, storageLocation: null }),
      position({ marketValueUsd: 50, storageLocation: 'default' }),
    ]);

    await expect(portfolioService.getAllocationByStorage('user-1')).resolves.toEqual([
      {
        storageType: 'BROKERAGE',
        storageLocation: null,
        valueUsd: 100,
        percentage: 100 * (100 / 150),
        positionCount: 1,
      },
      {
        storageType: 'BROKERAGE',
        storageLocation: 'default',
        valueUsd: 50,
        percentage: 100 * (50 / 150),
        positionCount: 1,
      },
    ]);
  });

  it('ranks owned performers by current P&L and honors the requested result count', async () => {
    mocks.positionFindMany.mockResolvedValue([
      position({ assetId: 'winner-small', unrealizedPnL: 10 }),
      position({ assetId: 'loser', unrealizedPnL: -50 }),
      position({ assetId: 'winner-large', unrealizedPnL: 80 }),
    ]);

    expect((await portfolioService.getTopPerformers('user-1', 1)).map((p) => p.assetId)).toEqual([
      'winner-large',
    ]);
    expect(mocks.positionFindMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', custodyOf: null },
      include: { asset: true },
    });

    expect((await portfolioService.getWorstPerformers('user-1', 4)).map((p) => p.assetId)).toEqual([
      'loser',
    ]);
    expect(mocks.positionFindMany).toHaveBeenLastCalledWith({
      where: { userId: 'user-1', custodyOf: null },
      include: { asset: true },
    });
  });
});
