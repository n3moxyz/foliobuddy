import { prisma } from '../index.js';

interface PortfolioSummary {
  totalValueUsd: number;
  totalValueSgd: number;
  totalCostBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  positionCount: number;
  lastUpdated: Date;
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
   */
  async getSummary(userId: string): Promise<PortfolioSummary> {
    const positions = await prisma.position.findMany({
      where: { userId },
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

    const usdSgdRate = fxRate?.rate ?? 1.35; // Default rate if not found

    let totalValueUsd = 0;
    let totalCostBasis = 0;

    for (const position of positions) {
      const marketValue = position.marketValueUsd ?? (position.quantity * (position.asset.currentPriceUsd ?? 0));
      const costBasis = position.quantity * position.avgCostUsd;

      totalValueUsd += marketValue;
      totalCostBasis += costBasis;
    }

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
    };
  }

  /**
   * Get allocation by asset category
   */
  async getAllocationByCategory(userId: string): Promise<AllocationByCategory[]> {
    const positions = await prisma.position.findMany({
      where: { userId },
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
      where: { userId },
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
   * Get top performing positions
   */
  async getTopPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: {
        userId,
        unrealizedPnL: { not: null },
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
   * Get worst performing positions
   */
  async getWorstPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: {
        userId,
        unrealizedPnL: { not: null },
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
