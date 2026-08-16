import cron from 'node-cron';
import { priceService } from './priceService.js';
import { snapshotService } from './snapshotService.js';
import { socketService } from './socketService.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { usdRateEntries } from '../lib/fxConstants.js';
import {
  getLocalParts,
  isSnapshotHourNow,
  localDayBounds,
  resolvePreference,
  scheduledSnapshotAt,
} from '../lib/snapshotSchedule.js';

const SNAPSHOT_USER_SELECT = { id: true, snapshotHour: true, snapshotTimezone: true } as const;

type SnapshotUser = {
  id: string;
  snapshotHour: number;
  snapshotTimezone: string;
};

/**
 * True when the user already has a snapshot of `snapshotType` inside their local
 * calendar day containing `now`. Snapshot has no DB uniqueness on (user, type, day),
 * so this check-before-create is the only duplicate guard — required now that the
 * scheduler ticks hourly rather than once a day.
 */
async function hasSnapshotForLocalDay(
  user: SnapshotUser,
  snapshotType: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  now: Date
): Promise<boolean> {
  const { timeZone } = resolvePreference(user);
  const { start, end } = localDayBounds(now, timeZone);
  const existing = await prisma.snapshot.findFirst({
    where: {
      userId: user.id,
      snapshotType,
      timestamp: { gte: start, lt: end },
    },
    select: { id: true },
  });
  return existing !== null;
}

async function createSnapshotOnce(
  user: SnapshotUser,
  snapshotType: 'DAILY' | 'WEEKLY' | 'MONTHLY',
  now: Date,
  reason: string
): Promise<void> {
  try {
    if (await hasSnapshotForLocalDay(user, snapshotType, now)) {
      logger.info(`[Snapshot] ${snapshotType} snapshot already exists today for user ${user.id}`);
      return;
    }
    const snapshotId = await snapshotService.createSnapshot(user.id, snapshotType);
    logger.info(
      `[Snapshot] Created ${reason} ${snapshotType} snapshot ${snapshotId} for user ${user.id}`
    );
  } catch (error) {
    logger.error(`[Snapshot] Error creating ${snapshotType} snapshot for user ${user.id}:`, error);
  }
}

/**
 * Check and create missing daily snapshots on server startup.
 * For each user: if their scheduled snapshot time for today (in their timezone)
 * has already passed and no DAILY snapshot exists for that local day, create one.
 */
export async function createMissingSnapshots(): Promise<void> {
  try {
    logger.info('[Snapshot] Checking for missing daily snapshots...');

    const now = new Date();
    const users = await prisma.user.findMany({ select: SNAPSHOT_USER_SELECT });

    if (users.length === 0) {
      logger.info('[Snapshot] No users found, skipping catch-up');
      return;
    }

    for (const user of users) {
      const { hour, timeZone } = resolvePreference(user);
      if (now < scheduledSnapshotAt(now, timeZone, hour)) {
        logger.info(
          `[Snapshot] User ${user.id}: scheduled ${hour}:00 ${timeZone} not due yet - skipping catch-up`
        );
        continue;
      }
      await createSnapshotOnce(user, 'DAILY', now, 'catch-up');
    }

    logger.info('[Snapshot] Catch-up check complete');
  } catch (error) {
    logger.error('[Snapshot] Error in catch-up process:', error);
  }
}

async function runProviderRefresh(provider: 'coingecko' | 'yahoo', logTag: string): Promise<void> {
  try {
    logger.info(`${logTag} Starting...`);
    const result = await priceService.refreshAllPrices(provider);
    logger.info(`${logTag} Updated ${result.updated} prices, ${result.errors} errors`);

    socketService.broadcastPriceUpdate(result.updated);

    await priceService.updatePositionValues(result.changedAssetIds);

    if (result.changedAssetIds.length === 0) return;

    const usersWithPositions = await prisma.user.findMany({
      where: { positions: { some: { assetId: { in: result.changedAssetIds } } } },
      select: { id: true },
    });

    for (const user of usersWithPositions) {
      socketService.broadcastPortfolioUpdate(user.id);
    }
  } catch (error) {
    logger.error(`${logTag} Error:`, error);
  }
}

/**
 * Start the crypto price refresh job (every 60 seconds via CoinGecko)
 */
export function startPriceRefreshJob(): void {
  logger.info('📈 Starting crypto price refresh scheduler (1min)');
  cron.schedule('* * * * *', () => runProviderRefresh('coingecko', '[Price Refresh Crypto]'));
}

/**
 * Start the equities price refresh job (every 15 minutes via Yahoo Finance)
 */
export function startEquityRefreshJob(): void {
  logger.info('🏦 Starting equities price refresh scheduler (15min)');
  cron.schedule('*/15 * * * *', () => runProviderRefresh('yahoo', '[Price Refresh Equities]'));
}

/**
 * Run one hourly snapshot tick: every user whose local wall-clock hour equals
 * their configured snapshot hour gets a DAILY snapshot, plus WEEKLY on their
 * local Sunday and MONTHLY on their local 1st. Exported for tests.
 */
export async function runSnapshotTick(now: Date = new Date()): Promise<void> {
  try {
    const users = await prisma.user.findMany({ select: SNAPSHOT_USER_SELECT });
    const due = users.filter((user) => isSnapshotHourNow(now, user));

    if (due.length === 0) {
      logger.debug(`[Snapshot] Hourly tick: no users due at ${now.toISOString()}`);
      return;
    }

    logger.info(`[Snapshot] Hourly tick: ${due.length} user(s) due`);

    for (const user of due) {
      await createSnapshotOnce(user, 'DAILY', now, 'daily');

      const { timeZone } = resolvePreference(user);
      const local = getLocalParts(now, timeZone);

      if (local.weekday === 0) {
        await createSnapshotOnce(user, 'WEEKLY', now, 'weekly');
      }
      if (local.day === 1) {
        await createSnapshotOnce(user, 'MONTHLY', now, 'monthly');
      }
    }
  } catch (error) {
    logger.error('[Snapshot] Error:', error);
  }
}

/**
 * Start the snapshot job. Ticks at the top of every hour (UTC) and lets each
 * user's stored hour + timezone decide whether they are due — replaces the old
 * single global 5am Asia/Singapore cron. Defaults reproduce that schedule.
 */
export function startSnapshotJob(): void {
  logger.info('📸 Starting snapshot scheduler (hourly tick, per-user local hour)');
  cron.schedule('0 * * * *', () => runSnapshotTick());
}

/**
 * Update FX rates (runs every hour)
 */
export function startFxRateJob(): void {
  logger.info('💱 Starting FX rate scheduler');

  cron.schedule('0 * * * *', async () => {
    try {
      logger.info('[FX Rates] Fetching rates...');
      const rates = await priceService.getExchangeRates();

      if (rates) {
        const now = new Date();
        const updatedRates = await Promise.all(
          usdRateEntries(rates).map(({ currency, rate }) =>
            prisma.fxRate.upsert({
              where: {
                fromCcy_toCcy: {
                  fromCcy: 'USD',
                  toCcy: currency,
                },
              },
              update: {
                rate,
                timestamp: now,
              },
              create: {
                fromCcy: 'USD',
                toCcy: currency,
                rate,
              },
            })
          )
        );

        logger.info(
          `[FX Rates] Updated ${updatedRates.map((rate) => `${rate.fromCcy}/${rate.toCcy}=${rate.rate}`).join(', ')}`
        );
      }
    } catch (error) {
      logger.error('[FX Rates] Error:', error);
    }
  });
}

/**
 * Start the price history cleanup job (daily at 2am UTC)
 * Deletes PriceHistory entries older than 90 days
 */
export function startPriceHistoryCleanupJob(): void {
  logger.info('🧹 Starting price history cleanup scheduler');

  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('[Price History Cleanup] Starting...');

      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const result = await prisma.priceHistory.deleteMany({
        where: {
          timestamp: { lt: ninetyDaysAgo },
          // Keep manual NAV entries indefinitely — unit-trust history would otherwise go stale
          source: { not: 'manual' },
        },
      });

      logger.info(`[Price History Cleanup] Deleted ${result.count} entries older than 90 days`);
    } catch (error) {
      logger.error('[Price History Cleanup] Error:', error);
    }
  });
}
