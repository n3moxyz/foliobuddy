import { Router } from 'express';
import { prisma } from '../index.js';
import { priceService } from '../services/priceService.js';

const router = Router();

// GET /api/prices/current - Get current prices for all assets
router.get('/current', async (req, res, next) => {
  try {
    const assets = await prisma.asset.findMany({
      where: {
        currentPriceUsd: { not: null },
      },
      select: {
        id: true,
        symbol: true,
        name: true,
        coingeckoId: true,
        currentPriceUsd: true,
        priceUpdatedAt: true,
      },
    });

    res.json(assets);
  } catch (error) {
    next(error);
  }
});

// POST /api/prices/refresh - Refresh all asset prices
router.post('/refresh', async (req, res, next) => {
  try {
    const result = await priceService.refreshAllPrices();
    await priceService.updatePositionValues();

    res.json({
      message: 'Prices refreshed',
      updated: result.updated,
      errors: result.errors,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/prices/history/:assetId - Get price history for an asset
router.get('/history/:assetId', async (req, res, next) => {
  try {
    const { days } = req.query;
    const daysNum = parseInt(days as string) || 30;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysNum);

    const history = await prisma.priceHistory.findMany({
      where: {
        assetId: req.params.assetId,
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    res.json(history);
  } catch (error) {
    next(error);
  }
});

// GET /api/prices/historical/:coingeckoId - Get historical prices from CoinGecko
router.get('/historical/:coingeckoId', async (req, res, next) => {
  try {
    const { coingeckoId } = req.params;
    const days = parseInt(req.query.days as string) || 30;

    // Cap at 365 days to avoid excessive API load
    const cappedDays = Math.min(days, 365);

    const data = await priceService.getHistoricalPrices(coingeckoId, cappedDays);

    res.json({
      coingeckoId,
      days: cappedDays,
      data,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
