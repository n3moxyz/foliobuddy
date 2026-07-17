import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
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

function calculateReturn(currentValue: number, baselineValue: number | null | undefined) {
  if (!Number.isFinite(currentValue) || !Number.isFinite(baselineValue) || baselineValue! <= 0) {
    return null;
  }
  return ((currentValue - baselineValue!) / baselineValue!) * 100;
}

function subtractUtcMonth(date: Date): Date {
  const targetMonth = date.getUTCMonth() - 1;
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      targetMonth,
      Math.min(date.getUTCDate(), lastDay),
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds()
    )
  );
}

class SnapshotService {
  /**
   * Create a new portfolio snapshot
   */
  async createSnapshot(userId: string, snapshotType: string = 'DAILY'): Promise<string> {
    const [summary, fxRates, btcPrice, ethPrice, positions] = await Promise.all([
      portfolioService.getSummary(userId),
      priceService.getExchangeRates(),
      priceService.getPrice('bitcoin'),
      priceService.getPrice('ethereum'),
      prisma.position.findMany({
        where: { userId, custodyOf: null },
        include: { asset: true },
      }),
    ]);

    const usdSgdRate = fxRates?.usdSgd ?? USD_SGD_FALLBACK_RATE;
    const metrics = await this.calculatePerformanceMetrics(
      userId,
      summary.totalValueUsd,
      btcPrice,
      ethPrice
    );

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
          create: positions.map((p) => {
            const valueUsd = p.marketValueUsd ?? p.quantity * (p.asset.currentPriceUsd ?? 0);
            return {
              assetSymbol: p.asset.symbol,
              quantity: p.quantity,
              priceUsd: p.asset.currentPriceUsd ?? 0,
              valueUsd,
              allocation: summary.totalValueUsd > 0 ? (valueUsd / summary.totalValueUsd) * 100 : 0,
            };
          }),
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
    currentValue: number,
    currentBtc: number | null,
    currentEth: number | null
  ): Promise<PerformanceMetrics> {
    const now = new Date();

    const [yesterday, lastWeek, lastMonth, startOfYear, ath] = await Promise.all([
      this.getSnapshotByDate(userId, new Date(now.getTime() - 24 * 60 * 60 * 1000)),
      this.getSnapshotByDate(userId, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)),
      this.getSnapshotByDate(userId, subtractUtcMonth(now)),
      this.getSnapshotByDate(userId, new Date(Date.UTC(now.getUTCFullYear(), 0, 1))),
      this.getAllTimeHigh(userId),
    ]);

    const dailyReturn = calculateReturn(currentValue, yesterday?.totalValueUsd);
    const weeklyReturn = calculateReturn(currentValue, lastWeek?.totalValueUsd);
    const monthlyReturn = calculateReturn(currentValue, lastMonth?.totalValueUsd);
    const ytdReturn = calculateReturn(currentValue, startOfYear?.totalValueUsd);

    let btcOutperform: number | null = null;
    let ethOutperform: number | null = null;

    if (startOfYear && ytdReturn !== null) {
      if (currentBtc && startOfYear.btcPrice && startOfYear.btcPrice > 0) {
        const btcYtdReturn = ((currentBtc - startOfYear.btcPrice) / startOfYear.btcPrice) * 100;
        btcOutperform = ytdReturn - btcYtdReturn;
      }

      if (currentEth && startOfYear.ethPrice && startOfYear.ethPrice > 0) {
        const ethYtdReturn = ((currentEth - startOfYear.ethPrice) / startOfYear.ethPrice) * 100;
        ethOutperform = ytdReturn - ethYtdReturn;
      }
    }

    return {
      dailyReturn,
      weeklyReturn,
      monthlyReturn,
      ytdReturn,
      athValueUsd: Math.max(ath?.totalValueUsd ?? currentValue, currentValue),
      btcOutperform,
      ethOutperform,
    };
  }

  /**
   * Get snapshot closest to a specific date
   */
  private async getSnapshotByDate(userId: string, targetDate: Date) {
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
    const where: Prisma.SnapshotWhereInput = {
      userId,
      ...(fromDate || toDate
        ? {
            timestamp: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

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
    const startDate = new Date(Date.UTC(year, 0, 1));
    const endDate = new Date(Date.UTC(year + 1, 0, 1));

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
