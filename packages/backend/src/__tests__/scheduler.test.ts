import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const scheduledJobs: Array<{
    expression: string;
    callback: () => unknown | Promise<unknown>;
  }> = [];

  return {
    scheduledJobs,
    cronSchedule: vi.fn((expression: string, callback: () => unknown | Promise<unknown>) => {
      scheduledJobs.push({ expression, callback });
      return { stop: vi.fn() };
    }),
    priceService: {
      refreshAllPrices: vi.fn(),
      updatePositionValues: vi.fn(),
      getExchangeRates: vi.fn(),
    },
    snapshotService: {
      createSnapshot: vi.fn(),
    },
    socketService: {
      broadcastPriceUpdate: vi.fn(),
      broadcastPortfolioUpdate: vi.fn(),
    },
    prisma: {
      user: {
        findMany: vi.fn(),
      },
      snapshot: {
        findFirst: vi.fn(),
      },
      fxRate: {
        upsert: vi.fn(),
      },
      priceHistory: {
        deleteMany: vi.fn(),
      },
    },
    logger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  };
});

vi.mock('node-cron', () => ({
  default: {
    schedule: mocks.cronSchedule,
  },
}));
vi.mock('../services/priceService.js', () => ({ priceService: mocks.priceService }));
vi.mock('../services/snapshotService.js', () => ({ snapshotService: mocks.snapshotService }));
vi.mock('../services/socketService.js', () => ({ socketService: mocks.socketService }));
vi.mock('../lib/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../lib/logger.js', () => ({ logger: mocks.logger }));

const {
  startPriceRefreshJob,
  startEquityRefreshJob,
  startSnapshotJob,
  startFxRateJob,
  startPriceHistoryCleanupJob,
} = await import('../services/scheduler.js');

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduledJobs.length = 0;
  });

  it('refreshes crypto prices and notifies users whose positions changed', async () => {
    mocks.priceService.refreshAllPrices.mockResolvedValue({
      updated: 2,
      errors: 0,
      changedAssetIds: ['asset-1', 'asset-2'],
    });
    mocks.priceService.updatePositionValues.mockResolvedValue(undefined);
    mocks.prisma.user.findMany.mockResolvedValue([{ id: 'user-1' }, { id: 'user-2' }]);

    startPriceRefreshJob();

    expect(mocks.cronSchedule).toHaveBeenCalledWith('* * * * *', expect.any(Function));

    await mocks.scheduledJobs[0].callback();

    expect(mocks.priceService.refreshAllPrices).toHaveBeenCalledWith('coingecko');
    expect(mocks.socketService.broadcastPriceUpdate).toHaveBeenCalledWith(2);
    expect(mocks.priceService.updatePositionValues).toHaveBeenCalledWith(['asset-1', 'asset-2']);
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith({
      where: { positions: { some: { assetId: { in: ['asset-1', 'asset-2'] } } } },
      select: { id: true },
    });
    expect(mocks.socketService.broadcastPortfolioUpdate).toHaveBeenCalledWith('user-1');
    expect(mocks.socketService.broadcastPortfolioUpdate).toHaveBeenCalledWith('user-2');
  });

  it('does not fan out portfolio updates when no asset prices changed', async () => {
    mocks.priceService.refreshAllPrices.mockResolvedValue({
      updated: 0,
      errors: 0,
      changedAssetIds: [],
    });
    mocks.priceService.updatePositionValues.mockResolvedValue(undefined);

    startEquityRefreshJob();

    expect(mocks.cronSchedule).toHaveBeenCalledWith('*/15 * * * *', expect.any(Function));

    await mocks.scheduledJobs[0].callback();

    expect(mocks.priceService.refreshAllPrices).toHaveBeenCalledWith('yahoo');
    expect(mocks.socketService.broadcastPriceUpdate).toHaveBeenCalledWith(0);
    expect(mocks.priceService.updatePositionValues).toHaveBeenCalledWith([]);
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
    expect(mocks.socketService.broadcastPortfolioUpdate).not.toHaveBeenCalled();
  });

  it('registers snapshot, FX, and cleanup cron jobs with the expected schedules', () => {
    startSnapshotJob();
    startFxRateJob();
    startPriceHistoryCleanupJob();

    expect(mocks.scheduledJobs.map((job) => job.expression)).toEqual([
      '0 13 * * *',
      '0 0 * * 0',
      '0 * * * *',
      '0 2 * * *',
    ]);
  });
});
