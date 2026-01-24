import cron from 'node-cron';
import { priceService } from './priceService.js';
import { snapshotService } from './snapshotService.js';
import { prisma } from '../index.js';

/**
 * Check and create missing daily snapshots on server startup
 * This ensures snapshots are created even if the server wasn't running at midnight
 */
export async function createMissingSnapshots(): Promise<void> {
  try {
    console.log('[Snapshot] Checking for missing daily snapshots...');

    // Get all users
    const users = await prisma.user.findMany({
      select: { id: true },
    });

    if (users.length === 0) {
      console.log('[Snapshot] No users found, skipping catch-up');
      return;
    }

    // Check today's date (start of day in UTC)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

    for (const user of users) {
      try {
        // Check if snapshot exists for today
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
          console.log(`[Snapshot] Created catch-up daily snapshot ${snapshotId} for user ${user.id}`);
        } else {
          console.log(`[Snapshot] Daily snapshot already exists for user ${user.id}`);
        }
      } catch (error) {
        console.error(`[Snapshot] Error checking/creating snapshot for user ${user.id}:`, error);
      }
    }

    console.log('[Snapshot] Catch-up check complete');
  } catch (error) {
    console.error('[Snapshot] Error in catch-up process:', error);
  }
}

/**
 * Start the price refresh job (every 60 seconds)
 */
export function startPriceRefreshJob(): void {
  console.log('📈 Starting price refresh scheduler');

  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      console.log('[Price Refresh] Starting...');
      const result = await priceService.refreshAllPrices();
      console.log(`[Price Refresh] Updated ${result.updated} prices, ${result.errors} errors`);

      // Update position market values
      await priceService.updatePositionValues();
      console.log('[Price Refresh] Position values updated');
    } catch (error) {
      console.error('[Price Refresh] Error:', error);
    }
  });
}

/**
 * Start the snapshot job (daily at midnight UTC)
 */
export function startSnapshotJob(): void {
  console.log('📸 Starting snapshot scheduler');

  // Run daily at 00:00 UTC
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('[Snapshot] Creating daily snapshots...');

      // Get all users
      const users = await prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          const snapshotId = await snapshotService.createSnapshot(user.id, 'DAILY');
          console.log(`[Snapshot] Created daily snapshot ${snapshotId} for user ${user.id}`);
        } catch (error) {
          console.error(`[Snapshot] Error creating snapshot for user ${user.id}:`, error);
        }
      }

      // Check if it's the first day of the month - create monthly snapshot
      const today = new Date();
      if (today.getDate() === 1) {
        console.log('[Snapshot] First of month - creating monthly snapshots...');
        for (const user of users) {
          try {
            const snapshotId = await snapshotService.createSnapshot(user.id, 'MONTHLY');
            console.log(`[Snapshot] Created monthly snapshot ${snapshotId} for user ${user.id}`);
          } catch (error) {
            console.error(`[Snapshot] Error creating monthly snapshot for user ${user.id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('[Snapshot] Error:', error);
    }
  });

  // Run weekly on Sunday at 00:00 UTC
  cron.schedule('0 0 * * 0', async () => {
    try {
      console.log('[Snapshot] Creating weekly snapshots...');

      const users = await prisma.user.findMany({
        select: { id: true },
      });

      for (const user of users) {
        try {
          const snapshotId = await snapshotService.createSnapshot(user.id, 'WEEKLY');
          console.log(`[Snapshot] Created weekly snapshot ${snapshotId} for user ${user.id}`);
        } catch (error) {
          console.error(`[Snapshot] Error creating weekly snapshot for user ${user.id}:`, error);
        }
      }
    } catch (error) {
      console.error('[Snapshot] Error:', error);
    }
  });
}

/**
 * Update FX rates (runs every hour)
 */
export function startFxRateJob(): void {
  console.log('💱 Starting FX rate scheduler');

  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[FX Rates] Fetching rates...');
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

        console.log(`[FX Rates] Updated USD/SGD rate: ${rates.usdSgd}`);
      }
    } catch (error) {
      console.error('[FX Rates] Error:', error);
    }
  });
}
