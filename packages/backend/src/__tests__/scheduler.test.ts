import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const scheduledJobs: Array<{
    expression: string;
    callback: () => unknown | Promise<unknown>;
  }> = [];

  return {
    scheduledJobs,
    cronSchedule: vi.fn(
      (
        expression: string,
        callback: () => unknown | Promise<unknown>,
        _options?: { timezone?: string }
      ) => {
        scheduledJobs.push({ expression, callback });
        return { stop: vi.fn() };
      }
    ),
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
  createMissingSnapshots,
  runSnapshotTick,
} = await import('../services/scheduler.js');

const SNAPSHOT_USER_SELECT = { id: true, snapshotHour: true, snapshotTimezone: true };
const sgtUser = (id: string, hour = 5) => ({
  id,
  snapshotHour: hour,
  snapshotTimezone: 'Asia/Singapore',
});

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scheduledJobs.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
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

    // Snapshot job is a single hourly UTC tick; per-user hour/timezone decides who is due.
    expect(mocks.scheduledJobs.map((job) => job.expression)).toEqual([
      '0 * * * *',
      '0 * * * *',
      '0 2 * * *',
    ]);
    expect(mocks.cronSchedule).toHaveBeenNthCalledWith(1, '0 * * * *', expect.any(Function));
  });

  describe('hourly snapshot tick', () => {
    beforeEach(() => {
      mocks.prisma.snapshot.findFirst.mockResolvedValue(null);
      mocks.snapshotService.createSnapshot.mockResolvedValue('snapshot-1');
    });

    it('snapshots only the users whose local hour matches (default 5am SGT = 21:00Z)', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([
        sgtUser('sgt-5am', 5),
        sgtUser('sgt-1am', 1),
        { id: 'ny-8am', snapshotHour: 8, snapshotTimezone: 'America/New_York' },
      ]);

      await runSnapshotTick(new Date('2026-07-15T21:00:00.000Z'));

      expect(mocks.prisma.user.findMany).toHaveBeenCalledWith({ select: SNAPSHOT_USER_SELECT });
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'sgt-5am',
        'DAILY',
        '2026-07-16'
      );
    });

    it('fires the 1am-SGT user at 17:00Z and the 8am-New-York user at 12:00Z (EDT)', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([
        sgtUser('sgt-5am', 5),
        sgtUser('sgt-1am', 1),
        { id: 'ny-8am', snapshotHour: 8, snapshotTimezone: 'America/New_York' },
      ]);

      await runSnapshotTick(new Date('2026-07-15T17:00:00.000Z'));
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'sgt-1am',
        'DAILY',
        '2026-07-16'
      );
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledTimes(1);

      mocks.snapshotService.createSnapshot.mockClear();
      await runSnapshotTick(new Date('2026-07-15T12:00:00.000Z'));
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'ny-8am',
        'DAILY',
        '2026-07-15'
      );
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
    });

    it('does nothing on a tick where nobody is due', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5)]);

      await runSnapshotTick(new Date('2026-07-15T10:00:00.000Z'));

      expect(mocks.snapshotService.createSnapshot).not.toHaveBeenCalled();
      expect(mocks.prisma.snapshot.findFirst).not.toHaveBeenCalled();
    });

    it('never duplicates: skips users who already have a DAILY snapshot in their local day', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5)]);
      mocks.prisma.snapshot.findFirst.mockResolvedValue({ id: 'existing' });

      await runSnapshotTick(new Date('2026-07-15T21:00:00.000Z'));

      expect(mocks.prisma.snapshot.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'sgt-5am',
          snapshotType: 'DAILY',
          timestamp: {
            gte: new Date('2026-07-15T16:00:00.000Z'),
            lt: new Date('2026-07-16T16:00:00.000Z'),
          },
        },
        select: { id: true },
      });
      expect(mocks.snapshotService.createSnapshot).not.toHaveBeenCalled();
    });

    it("adds a MONTHLY snapshot on the user's local 1st of the month", async () => {
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5)]);

      // 21:00Z Jul 31 = 05:00 Aug 1 in Singapore
      await runSnapshotTick(new Date('2026-07-31T21:00:00.000Z'));

      expect(mocks.snapshotService.createSnapshot).toHaveBeenNthCalledWith(
        1,
        'sgt-5am',
        'DAILY',
        '2026-08-01'
      );
      expect(mocks.snapshotService.createSnapshot).toHaveBeenNthCalledWith(
        2,
        'sgt-5am',
        'MONTHLY',
        '2026-08-01'
      );
    });

    it("adds a WEEKLY snapshot on the user's local Sunday", async () => {
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5)]);

      // 21:00Z Sat Jul 18 = 05:00 Sun Jul 19 in Singapore
      await runSnapshotTick(new Date('2026-07-18T21:00:00.000Z'));

      expect(mocks.snapshotService.createSnapshot).toHaveBeenNthCalledWith(
        1,
        'sgt-5am',
        'DAILY',
        '2026-07-19'
      );
      expect(mocks.snapshotService.createSnapshot).toHaveBeenNthCalledWith(
        2,
        'sgt-5am',
        'WEEKLY',
        '2026-07-19'
      );
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledTimes(2);
    });

    it('treats a corrupted timezone as the default instead of skipping the user forever', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([
        { id: 'broken', snapshotHour: 5, snapshotTimezone: 'Mars/Olympus' },
      ]);

      await runSnapshotTick(new Date('2026-07-15T21:00:00.000Z'));

      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'broken',
        'DAILY',
        '2026-07-16'
      );
    });

    it('treats a database idempotency conflict as an already-created snapshot', async () => {
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5)]);
      mocks.snapshotService.createSnapshot.mockRejectedValue({
        code: 'P2002',
        meta: { target: ['userId', 'snapshotType', 'scheduledLocalDate'] },
      });

      await runSnapshotTick(new Date('2026-07-15T21:00:00.000Z'));

      expect(mocks.logger.error).not.toHaveBeenCalled();
      expect(mocks.logger.info).toHaveBeenCalledWith(
        '[Snapshot] DAILY snapshot already claimed today for user sgt-5am'
      );
    });
  });

  describe('catch-up on boot', () => {
    it('creates a catch-up snapshot for a user whose local snapshot time has passed today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-31T21:01:00.000Z'));
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('user-1', 5)]);
      mocks.prisma.snapshot.findFirst.mockResolvedValue(null);
      mocks.snapshotService.createSnapshot.mockResolvedValue('snapshot-1');

      await createMissingSnapshots();

      expect(mocks.prisma.snapshot.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          snapshotType: 'DAILY',
          timestamp: {
            gte: new Date('2026-07-31T16:00:00.000Z'),
            lt: new Date('2026-08-01T16:00:00.000Z'),
          },
        },
        select: { id: true },
      });
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'user-1',
        'DAILY',
        '2026-08-01'
      );
    });

    it('skips users whose local snapshot time has not arrived yet, per user', async () => {
      vi.useFakeTimers();
      // 20:59Z Jul 31 = 04:59 Aug 1 SGT: 5am user not due, 1am user is due
      vi.setSystemTime(new Date('2026-07-31T20:59:00.000Z'));
      mocks.prisma.user.findMany.mockResolvedValue([sgtUser('sgt-5am', 5), sgtUser('sgt-1am', 1)]);
      mocks.prisma.snapshot.findFirst.mockResolvedValue(null);
      mocks.snapshotService.createSnapshot.mockResolvedValue('snapshot-1');

      await createMissingSnapshots();

      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledTimes(1);
      expect(mocks.snapshotService.createSnapshot).toHaveBeenCalledWith(
        'sgt-1am',
        'DAILY',
        '2026-08-01'
      );
    });
  });
});
