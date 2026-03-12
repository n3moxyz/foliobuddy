import { prisma } from '../index.js';
import { USD_SGD_FALLBACK_RATE } from '../lib/constants.js';

interface PortfolioSummary {
  totalValueUsd: number;
  totalValueSgd: number;
  totalCostBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  positionCount: number;
  lastUpdated: Date;
  ytdStartDate: string | null;
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

type PositionWithAsset = Awaited<
  ReturnType<
    typeof prisma.position.findMany<{
      include: { asset: true };
    }>
  >
>[number];

class PortfolioService {
  private async getOwnedPositions(userId: string): Promise<PositionWithAsset[]> {
    return prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: { asset: true },
    });
  }

  async getSummary(userId: string): Promise<PortfolioSummary> {
    const [positions, fxRate, ytdSnapshot] = await Promise.all([
      this.getOwnedPositions(userId),
      prisma.fxRate.findUnique({
        where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
      }),
      prisma.snapshot.findFirst({
        where: { userId },
        orderBy: { timestamp: 'asc' },
        select: { timestamp: true, totalValueUsd: true },
      }),
    ]);

    const usdSgdRate = fxRate?.rate ?? USD_SGD_FALLBACK_RATE;

    let totalValueUsd = 0;
    for (const position of positions) {
      totalValueUsd +=
        position.marketValueUsd ?? position.quantity * (position.asset.currentPriceUsd ?? 0);
    }

    const totalCostBasis = ytdSnapshot?.totalValueUsd ?? totalValueUsd;
    const ytdStartDate = ytdSnapshot?.timestamp?.toISOString() ?? null;
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

  async getAllocationByCategory(userId: string): Promise<AllocationByCategory[]> {
    const positions = await this.getOwnedPositions(userId);
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

    return Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        valueUsd: data.valueUsd,
        percentage: totalValue > 0 ? (data.valueUsd / totalValue) * 100 : 0,
        positionCount: data.count,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  }

  async getAllocationByStorage(userId: string): Promise<AllocationByStorage[]> {
    const positions = await this.getOwnedPositions(userId);
    const totalValue = positions.reduce((sum, p) => sum + (p.marketValueUsd ?? 0), 0);

    const storageMap = new Map<
      string,
      { storageType: string; location: string | null; valueUsd: number; count: number }
    >();

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

    return Array.from(storageMap.values())
      .map((data) => ({
        storageType: data.storageType,
        storageLocation: data.location,
        valueUsd: data.valueUsd,
        percentage: totalValue > 0 ? (data.valueUsd / totalValue) * 100 : 0,
        positionCount: data.count,
      }))
      .sort((a, b) => b.valueUsd - a.valueUsd);
  }

  async getTopPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null, unrealizedPnL: { gt: 0 } },
      include: { asset: true },
      orderBy: { unrealizedPnLPct: 'desc' },
      take: limit,
    });

    return positions.map((p) => ({
      assetId: p.assetId,
      symbol: p.asset.symbol,
      name: p.asset.name,
      unrealizedPnL: p.unrealizedPnL ?? 0,
      unrealizedPnLPct: p.unrealizedPnLPct ?? 0,
      marketValueUsd: p.marketValueUsd ?? 0,
    }));
  }

  async getWorstPerformers(userId: string, limit = 5): Promise<TopPerformer[]> {
    const positions = await prisma.position.findMany({
      where: { userId, custodyOf: null, unrealizedPnL: { lt: 0 } },
      include: { asset: true },
      orderBy: { unrealizedPnLPct: 'asc' },
      take: limit,
    });

    return positions.map((p) => ({
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
