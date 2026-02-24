import { prisma } from '../index.js';
import { logger } from '../lib/logger.js';
import { USD_SGD_FALLBACK_RATE } from '../lib/constants.js';

interface PortfolioSummary {
  totalValueUsd: number;
  totalValueSgd: number;
  totalCostBasis: number; // Now represents YTD starting value (earliest snapshot of current year)
  unrealizedPnL: number;  // Now represents YTD P&L
  unrealizedPnLPct: number; // Now represents YTD return %
  positionCount: number;
  lastUpdated: Date;
  ytdStartDate: string | null; // The date of the earliest snapshot used for YTD calculation
}

interface AllocationByCategory {
  category: string;
  valueUsd: number;
  percentage: number;
  positionCount: number;
}

interface AllocationByStorage {
  storageType: string;
  storageLocation: string | null;
  valueUsd: number;
  percentage: number;
  positionCount: number;
}

interface TopPerformer {
  assetId: string;
  symbol: string;
  name: string;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  marketValueUsd: number;
}

class PortfolioService {
  /**
   * Get portfolio summary for a user
   * Cost basis is now YTD-based: the portfolio value on the earliest snapshot of the current year
   */
  async getSummary(userId: string): Promise<PortfolioSummary> {
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: {
        asset: true,
      },
    });

    // Get current USD/SGD rate
    const fxRate = await prisma.fxRate.findUnique({
      where: {
        fromCcy_toCcy: {
          fromCcy: 'USD',
          toCcy: 'SGD',
        },
      },
    });

    const usdSgdRate = fxRate?.rate ?? USD_SGD_FALLBACK_RATE; // Default rate if not found

    // Calculate current total value
    let totalValueUsd = 0;
    for (const position of positions) {
      const marketValue = position.marketValueUsd ?? (position.quantity * (position.asset.currentPriceUsd ?? 0));
      totalValueUsd += marketValue;
    }

    // Get YTD cost basis: earliest snapshot of this year
    // First, get ALL snapshots for this user to debug
    const allSnapshots = await prisma.snapshot.findMany({
      where: { userId },
      orderBy: { timestamp: 'asc' },
      select: { id: true, timestamp: true, totalValueUsd: true },
    });

    logger.debug('[YTD Debug] All snapshots for user:', allSnapshots.map(s => ({
      timestamp: s.timestamp.toISOString(),
      value: s.totalValueUsd
    })));

    // Find the earliest snapshot (should be the YTD start)
    const ytdSnapshot = allSnapshots.length > 0 ? allSnapshots[0] : null;

    logger.debug('[YTD Debug] Using earliest snapshot:', ytdSnapshot ? {
      timestamp: ytdSnapshot.timestamp.toISOString(),
      totalValueUsd: ytdSnapshot.totalValueUsd,
    } : 'NONE');

    // Use earliest snapshot value as cost basis, or current value if no snapshots at all
    const totalCostBasis = ytdSnapshot?.totalValueUsd ?? totalValueUsd;
    const ytdStartDate = ytdSnapshot?.timestamp?.toISOString() ?? null;

    logger.debug('[YTD Debug] Final totalCostBasis:', totalCostBasis);

    const unrealizedPnL = totalValueUsd - totalCostBasis;
    const unrealizedPnLPct = totalCostBasis > 0 ? (unrealizedPnL / totalCostBasis) * 100 : 0;

    return {
      totalValueUsd,
      totalValueSgd: totalValueUsd * usdSgdRate,
      totalCostBasis,
      unrealizedPnL,
      unrealizedPnLPct,
      positionCount: positions.length,
      lastUpdated: new Date(),
      ytdStartDate,
    };
  }

  /**
   * Get allocation by asset category
   */
  async getAllocationByCategory(userId: string): Promise<AllocationByCategory[]> {
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: {
        asset: true,
      },
    });

    const totalValue = positions.reduce((sum, p) => sum + (p.marketValueUsd ?? 0), 0);

    const categoryMap = new Map<string, { valueUsd: number; count: number }>();

    for (const position of positions) {
      const category = position.asset.category;
      const value = position.marketValueUsd ?? 0;

      const existing = categoryMap.get(category) ?? { valueUsd: 0, count: 0 };
      categoryMap.set(category, {
        valueUsd: existing.valueUsd + value,
        count: existing.count + 1,
      });
    }

    const allocations: AllocationByCategory[] = [];

    for (const [category, data] of categoryMap) {
      allocations.push({
        category,
        valueUsd: data.valueUsd,
        percentage: totalValue > 0 ? (data.valueUsd / totalValue) * 100 : 0,
        positionCount: data.count,
      });
    }

    return allocations.sort((a, b) => b.valueUsd - a.valueUsd);
  }

  /**
   * Get allocation by storage type/location
   */
  async getAllocationByStorage(userId: string): Promise<AllocationByStorage[]> {
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: {
        asset: true,
      },
    });

    const totalValue = positions.reduce((sum, p) => sum + (p.marketValueUsd ?? 0), 0);

    const storageMap = new Map<string, { storageType: string; location: string | null; valueUsd: number; count: number }>();

    for (const position of positions) {
      const key = `${position.storageType}:${position.storageLocation ?? 'default'}`;
      const value = position.marketValueUsd ?? 0;

      const existing = storageMap.get(key) ?? {
        storageType: position.storageType,
        location: position.storageLocation,
        valueUsd: 0,
        count: 0,
      };

      storageMap.set(key, {
        ...existing,
        valueUsd: existing.valueUsd + value,
        count: existing.count + 1,
      });
    }

    const allocations: AllocationByStorage[] = [];

    for (const data of storageMap.values()) {
      allocations.push({
        storageType: data.storageType,
        storageLocation: data.location,
        valueUsd: data.valueUsd,
        percentage: totalValue > 0 ? (data.valueUsd / totalValue) * 100 : 0,
        positionCount: data.count,
      });
    }

    return allocations.sort((a, b) => b.valueUsd - a.valueUsd);
  }

  /**
   * Get top performing positions (only those with positive PnL)
   */
  async getTopPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: {
        userId,
        custodyOf: null,
        unrealizedPnL: { gt: 0 },
      },
      include: {
        asset: true,
      },
      orderBy: {
        unrealizedPnLPct: 'desc',
      },
      take: limit,
    });

    return positions.map(p => ({
      assetId: p.assetId,
      symbol: p.asset.symbol,
      name: p.asset.name,
      unrealizedPnL: p.unrealizedPnL ?? 0,
      unrealizedPnLPct: p.unrealizedPnLPct ?? 0,
      marketValueUsd: p.marketValueUsd ?? 0,
    }));
  }

  /**
   * Get worst performing positions (only those with negative PnL)
   */
  async getWorstPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: {
        userId,
        custodyOf: null,
        unrealizedPnL: { lt: 0 },
      },
      include: {
        asset: true,
      },
      orderBy: {
        unrealizedPnLPct: 'asc',
      },
      take: limit,
    });

    return positions.map(p => ({
      assetId: p.assetId,
      symbol: p.asset.symbol,
      name: p.asset.name,
      unrealizedPnL: p.unrealizedPnL ?? 0,
      unrealizedPnLPct: p.unrealizedPnLPct ?? 0,
      marketValueUsd: p.marketValueUsd ?? 0,
    }));
  }
}

export const portfolioService = new PortfolioService();
