import cron from 'node-cron';
import { priceService } from './priceService.js';
import { snapshotService } from './snapshotService.js';
import { socketService } from './socketService.js';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

/**
 * Check and create missing daily snapshots on server startup
 * Only creates catch-up snapshot if we're past 9pm SGT (1pm UTC) and no snapshot exists for today
 */
export async function createMissingSnapshots(): Promise<void> {
  try {
    logger.info('[Snapshot] Checking for missing daily snapshots...');

    const now = new Date();
    const currentHourUTC = now.getUTCHours();

    // Only run catch-up if we're past 1pm UTC (9pm SGT)
    if (currentHourUTC < 13) {
      logger.info('[Snapshot] Before 9pm SGT - skipping catch-up (scheduled snapshot not due yet)');
      return;
    }

    const users = await prisma.user.findMany({
      select: { id: true },
    });

    if (users.length === 0) {
      logger.info('[Snapshot] No users found, skipping catch-up');
      return;
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    for (const user of users) {
      try {
        const existingSnapshot = await prisma.snapshot.findFirst({
          where: {
            userId: user.id,
            snapshotType: 'DAILY',
            timestamp: {
              gte: today,
              lt: tomorrow,
            },
          },
        });

        if (!existingSnapshot) {
          const snapshotId = await snapshotService.createSnapshot(user.id, 'DAILY');
          logger.info(
            `[Snapshot] Created catch-up daily snapshot ${snapshotId} for user ${user.id}`
          );
        } else {
          logger.info(`[Snapshot] Daily snapshot already exists for user ${user.id}`);
        }
      } catch (error) {
        logger.error(`[Snapshot] Error checking/creating snapshot for user ${user.id}:`, error);
      }
    }

    logger.info('[Snapshot] Catch-up check complete');
  } catch (error) {
    logger.error('[Snapshot] Error in catch-up process:', error);
  }
}

/**
 * Start the price refresh job (every 60 seconds)
 */
export function startPriceRefreshJob(): void {
  logger.info('📈 Starting price refresh scheduler');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      logger.info('[Price Refresh] Starting...');
      const result = await priceService.refreshAllPrices();
      logger.info(`[Price Refresh] Updated ${result.updated} prices, ${result.errors} errors`);

      // Broadcast price update to all connected clients
      socketService.broadcastPriceUpdate(result.updated);

      await priceService.updatePositionValues(result.changedAssetIds);
      logger.info('[Price Refresh] Position values updated');

      const usersWithPositions = await prisma.user.findMany({
        where: {
          positions: {
            some: {},
          },
        },
        select: { id: true },
      });

      for (const user of usersWithPositions) {
        socketService.broadcastPortfolioUpdate(user.id);
      }
    } catch (error) {
      logger.error('[Price Refresh] Error:', error);
    }
  });
}

/**
 * Start the snapshot job (daily at 9pm SGT / 1pm UTC)
 */
export function startSnapshotJob(): void {
  logger.info('📸 Starting snapshot scheduler (9pm SGT / 1pm UTC)');

  // Run daily at 13:00 UTC (9pm SGT)
  cron.schedule('0 13 * * *', async () => {
    try {
      logger.info('[Snapshot] Creating daily snapshots...');

      const users = await prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          const snapshotId = await snapshotService.createSnapshot(user.id, 'DAILY');
          logger.info(`[Snapshot] Created daily snapshot ${snapshotId} for user ${user.id}`);
        } catch (error) {
          logger.error(`[Snapshot] Error creating snapshot for user ${user.id}:`, error);
        }
      }

      // Check if it's the first day of the month - create monthly snapshot
      const today = new Date();
      if (today.getDate() === 1) {
        logger.info('[Snapshot] First of month - creating monthly snapshots...');
        for (const user of users) {
          try {
            const snapshotId = await snapshotService.createSnapshot(user.id, 'MONTHLY');
            logger.info(`[Snapshot] Created monthly snapshot ${snapshotId} for user ${user.id}`);
          } catch (error) {
            logger.error(`[Snapshot] Error creating monthly snapshot for user ${user.id}:`, error);
          }
        }
      }
    } catch (error) {
      logger.error('[Snapshot] Error:', error);
    }
  });

  // Run weekly on Sunday at 00:00 UTC
  cron.schedule('0 0 * * 0', async () => {
    try {
      logger.info('[Snapshot] Creating weekly snapshots...');

      const users = await prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          const snapshotId = await snapshotService.createSnapshot(user.id, 'WEEKLY');
          logger.info(`[Snapshot] Created weekly snapshot ${snapshotId} for user ${user.id}`);
        } catch (error) {
          logger.error(`[Snapshot] Error creating weekly snapshot for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      logger.error('[Snapshot] Error:', error);
    }
  });
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
        await prisma.fxRate.upsert({
          where: {
            fromCcy_toCcy: {
              fromCcy: 'USD',
              toCcy: 'SGD',
            },
          },
          update: {
            rate: rates.usdSgd,
            timestamp: new Date(),
          },
          create: {
            fromCcy: 'USD',
            toCcy: 'SGD',
            rate: rates.usdSgd,
          },
        });

        logger.info(`[FX Rates] Updated USD/SGD rate: ${rates.usdSgd}`);
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
