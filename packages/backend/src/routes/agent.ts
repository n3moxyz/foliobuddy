import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { portfolioService } from '../services/portfolioService.js';
import { newsService } from '../services/newsService.js';
import { logger } from '../lib/logger.js';
import { assetIdSchema } from './news.js';
import { projectNativeCosts } from '../services/nativeCostService.js';

const router = Router();

/**
 * GET /api/v1/agent/portfolio
 *
 * Returns a comprehensive portfolio snapshot for agent consumption.
 * All data in one call: summary, positions, allocation, open trades, performers.
 */
router.get('/portfolio', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const [summary, allocation, positions, openTrades, topPerformers, worstPerformers] =
      await Promise.all([
        portfolioService.getSummary(userId),
        portfolioService.getAllocationByCategory(userId),
        prisma.position.findMany({
          where: { userId, custodyOf: null },
          include: { asset: true },
          orderBy: { marketValueUsd: 'desc' },
          take: 100,
        }),
        prisma.trade.findMany({
          where: { userId, status: 'OPEN' },
          include: { asset: true },
          orderBy: { entryDate: 'desc' },
        }),
        portfolioService.getTopPerformers(userId, 10),
        portfolioService.getWorstPerformers(userId, 10),
      ]);

    // Compute allocation percentage per position
    const totalValue = summary.totalValueUsd;
    const positionsWithAllocation = (await projectNativeCosts(positions)).map((p) => {
      const marketValueUsd = p.marketValueUsd ?? p.quantity * (p.asset.currentPriceUsd ?? 0);
      return {
        symbol: p.asset.symbol,
        name: p.asset.name,
        category: p.asset.category,
        quantity: p.quantity,
        avgCostUsd: p.avgCostUsd,
        avgCostNative: p.avgCostNative,
        costCurrency: p.costCurrency,
        recordedAvgCostUsd: p.recordedAvgCostUsd ?? p.avgCostUsd,
        currentPriceUsd: p.asset.currentPriceUsd,
        marketValueUsd,
        unrealizedPnL: p.unrealizedPnL,
        unrealizedPnLPct: p.unrealizedPnLPct,
        allocationPct: totalValue > 0 ? (marketValueUsd / totalValue) * 100 : 0,
        storageType: p.storageType,
        storageLocation: p.storageLocation,
      };
    });

    const openTradesFormatted = openTrades.map((t) => ({
      symbol: t.asset.symbol,
      name: t.asset.name,
      direction: t.direction,
      entryPrice: t.entryPrice,
      currentPrice: t.asset.currentPriceUsd,
      quantity: t.quantity,
      entryDate: t.entryDate,
      unrealizedPnLPct:
        t.asset.currentPriceUsd !== null && t.entryPrice > 0
          ? ((t.direction === 'SHORT'
              ? t.entryPrice - t.asset.currentPriceUsd
              : t.asset.currentPriceUsd - t.entryPrice) /
              t.entryPrice) *
            100
          : null,
      notes: t.notes,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      summary,
      allocation,
      positions: positionsWithAllocation,
      openTrades: openTradesFormatted,
      topPerformers,
      worstPerformers,
    });
  } catch (error) {
    logger.error('Agent portfolio endpoint error:', error);
    next(error);
  }
});

/**
 * GET /api/v1/agent/news
 *
 * The News tab's feed for the agent's portfolio owner — the same payload as
 * the signed-in GET /news, so a deploy can be verified without a Clerk session
 * (the Production Check workflow reads it).
 */
router.get('/news', async (req, res, next) => {
  try {
    res.json(await newsService.getPortfolioNews(req.userId!));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/agent/news/asset/:assetId
 *
 * One holding's news page, as the signed-in GET /news/asset/:assetId returns it.
 */
router.get('/news/asset/:assetId', async (req, res, next) => {
  try {
    const assetId = assetIdSchema.parse(req.params.assetId);
    res.json(await newsService.getAssetNews(req.userId!, assetId));
  } catch (error) {
    next(error);
  }
});

export default router;
