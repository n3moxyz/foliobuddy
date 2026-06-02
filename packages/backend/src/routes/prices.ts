import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ProviderName } from '../services/providers/types.js';

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

// GET /api/prices/historical/:providerAssetId - Get historical prices from a price provider
router.get('/historical/:providerAssetId', async (req, res, next) => {
  try {
    const { providerAssetId } = req.params;
    const days = parseInt(req.query.days as string) || 30;
    const providerParam = typeof req.query.provider === 'string' ? req.query.provider : 'coingecko';

    // Cap at 365 days to avoid excessive API load
    const cappedDays = Math.min(days, 365);
    if (providerParam !== 'coingecko' && providerParam !== 'yahoo') {
      throw new AppError('Historical benchmark provider must be coingecko or yahoo', 400);
    }

    const provider = providerParam as ProviderName;
    const history = await priceService.getAssetHistory(provider, providerAssetId, cappedDays);
    const data = history.map((point) => ({
      timestamp: point.timestamp,
      price: point.priceUsd,
    }));

    res.json({
      coingeckoId: provider === 'coingecko' ? providerAssetId : undefined,
      provider,
      providerAssetId,
      days: cappedDays,
      data,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
