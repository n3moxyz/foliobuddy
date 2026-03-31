import { prisma } from '../index.js';
import { portfolioService } from './portfolioService.js';
import { priceService } from './priceService.js';
import { logger } from '../lib/logger.js';
import { USD_SGD_FALLBACK_RATE } from '../lib/constants.js';

interface PerformanceMetrics {
  dailyReturn: number | null;
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  ytdReturn: number | null;
  athValueUsd: number | null;
  btcOutperform: number | null;
  ethOutperform: number | null;
}

class SnapshotService {
  /**
   * Create a new portfolio snapshot
   */
  async createSnapshot(userId: string, snapshotType: string = 'DAILY'): Promise<string> {
    // Get current portfolio summary
    const summary = await portfolioService.getSummary(userId);

    // Get FX rate
    const fxRates = await priceService.getExchangeRates();
    const usdSgdRate = fxRates?.usdSgd ?? USD_SGD_FALLBACK_RATE;

    // Get BTC and ETH prices for benchmark comparison
    const btcPrice = await priceService.getPrice('bitcoin');
    const ethPrice = await priceService.getPrice('ethereum');

    // Calculate performance metrics
    const metrics = await this.calculatePerformanceMetrics(userId, summary.totalValueUsd);

    // Get all owned positions for the snapshot (exclude custody positions)
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: { asset: true },
    });

    // Create snapshot
    const snapshot = await prisma.snapshot.create({
      data: {
        userId,
        snapshotType,
        source: 'AUTOMATIC',
        totalValueUsd: summary.totalValueUsd,
        totalValueSgd: summary.totalValueUsd * usdSgdRate,
        usdSgdRate,
        totalCostBasis: summary.totalCostBasis,
        unrealizedPnL: summary.unrealizedPnL,
        btcPrice,
        ethPrice,
        ...metrics,
        positions: {
          create: positions.map((p) => ({
            assetSymbol: p.asset.symbol,
            quantity: p.quantity,
            priceUsd: p.asset.currentPriceUsd ?? 0,
            valueUsd: p.marketValueUsd ?? 0,
            allocation:
              summary.totalValueUsd > 0
                ? ((p.marketValueUsd ?? 0) / summary.totalValueUsd) * 100
                : 0,
          })),
        },
      },
    });

    return snapshot.id;
  }

  /**
   * Calculate performance metrics relative to historical snapshots
   */
  private async calculatePerformanceMetrics(
    userId: string,
    currentValue: number
  ): Promise<PerformanceMetrics> {
    const now = new Date();

    // Get previous snapshots for comparison
    const [yesterday, lastWeek, lastMonth, startOfYear, ath] = await Promise.all([
      this.getSnapshotByDate(userId, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      this.getSnapshotByDate(userId, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      this.getSnapshotByDate(
        userId,
        new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      ),
      this.getSnapshotByDate(userId, new Date(now.getFullYear(), 0, 1)),
      this.getAllTimeHigh(userId),
    ]);

    // Calculate returns
    const dailyReturn = yesterday
      ? ((currentValue - yesterday.totalValueUsd) / yesterday.totalValueUsd) * 100
      : null;

    const weeklyReturn = lastWeek
      ? ((currentValue - lastWeek.totalValueUsd) / lastWeek.totalValueUsd) * 100
      : null;

    const monthlyReturn = lastMonth
      ? ((currentValue - lastMonth.totalValueUsd) / lastMonth.totalValueUsd) * 100
      : null;

    const ytdReturn = startOfYear
      ? ((currentValue - startOfYear.totalValueUsd) / startOfYear.totalValueUsd) * 100
      : null;

    // Calculate benchmark outperformance (if we have BTC/ETH prices)
    let btcOutperform: number | null = null;
    let ethOutperform: number | null = null;

    if (startOfYear && startOfYear.btcPrice && startOfYear.ethPrice) {
      const currentBtc = await priceService.getPrice('bitcoin');
      const currentEth = await priceService.getPrice('ethereum');

      if (currentBtc && ytdReturn !== null) {
        const btcYtdReturn = ((currentBtc - startOfYear.btcPrice) / startOfYear.btcPrice) * 100;
        btcOutperform = ytdReturn - btcYtdReturn;
      }

      if (currentEth && ytdReturn !== null) {
        const ethYtdReturn = ((currentEth - startOfYear.ethPrice) / startOfYear.ethPrice) * 100;
        ethOutperform = ytdReturn - ethYtdReturn;
      }
    }

    return {
      dailyReturn,
      weeklyReturn,
      monthlyReturn,
      ytdReturn,
      athValueUsd: ath?.totalValueUsd ?? currentValue,
      btcOutperform,
      ethOutperform,
    };
  }

  /**
   * Get snapshot closest to a specific date
   */
  private async getSnapshotByDate(userId: string, targetDate: Date) {
    // Find snapshot within 1 day of target date
    const startRange = new Date(targetDate.getTime() - 12 * 60 * 60 * 1000);
    const endRange = new Date(targetDate.getTime() + 12 * 60 * 60 * 1000);

    return prisma.snapshot.findFirst({
      where: {
        userId,
        timestamp: {
          gte: startRange,
          lte: endRange,
        },
      },
      orderBy: {
        timestamp: 'desc',
      },
    });
  }

  /**
   * Get all-time high snapshot
   */
  private async getAllTimeHigh(userId: string) {
    return prisma.snapshot.findFirst({
      where: { userId },
      orderBy: {
        totalValueUsd: 'desc',
      },
    });
  }

  /**
   * Get historical performance data for charts (by number of days)
   */
  async getPerformanceHistory(userId: string, days: number = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const snapshots = await prisma.snapshot.findMany({
      where: {
        userId,
        timestamp: {
          gte: startDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        timestamp: true,
        totalValueUsd: true,
        totalValueSgd: true,
        unrealizedPnL: true,
        btcPrice: true,
        ethPrice: true,
      },
    });

    return snapshots;
  }

  /**
   * Get historical performance data for charts (by date range)
   */
  async getPerformanceHistoryByRange(userId: string, fromDate?: Date, toDate?: Date) {
    const where: any = { userId };

    if (fromDate || toDate) {
      where.timestamp = {};
      if (fromDate) where.timestamp.gte = fromDate;
      if (toDate) where.timestamp.lte = toDate;
    }

    const snapshots = await prisma.snapshot.findMany({
      where,
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        timestamp: true,
        totalValueUsd: true,
        totalValueSgd: true,
        unrealizedPnL: true,
        btcPrice: true,
        ethPrice: true,
      },
    });

    return snapshots;
  }

  /**
   * Get monthly returns for a given year
   */
  async getMonthlyReturns(userId: string, year: number) {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const snapshots = await prisma.snapshot.findMany({
      where: {
        userId,
        snapshotType: 'MONTHLY',
        timestamp: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        timestamp: true,
        totalValueUsd: true,
        monthlyReturn: true,
        ytdReturn: true,
        btcOutperform: true,
        ethOutperform: true,
      },
    });

    return snapshots;
  }
}

export const snapshotService = new SnapshotService();
