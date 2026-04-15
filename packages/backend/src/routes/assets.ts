import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from '../services/priceService.js';
import { AppError } from '../middleware/errorHandler.js';
import { ASSET_CATEGORIES, AssetCategory } from '../lib/constants.js';

const router = Router();

const createAssetSchema = z.object({
  coingeckoId: z.string().optional(),
  symbol: z.string().min(1).max(20),
  name: z.string().min(1),
  category: z.enum(ASSET_CATEGORIES).default(AssetCategory.LIQUID_CRYPTO),
});

const updateAssetSchema = createAssetSchema.partial();

router.get('/', async (req, res, next) => {
  try {
    const { category, search } = req.query;

    const where: Prisma.AssetWhereInput = {
      ...(category ? { category: category as string } : {}),
      ...(search
        ? {
            OR: [
              { symbol: { contains: search as string } },
              { name: { contains: search as string } },
            ],
          }
        : {}),
    };

    const assets = await prisma.asset.findMany({
      where,
      orderBy: [{ symbol: 'asc' }],
      take: 500,
    });

    res.json(assets);
  } catch (error) {
    next(error);
  }
});

router.get('/search', async (req, res, next) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      throw new AppError('Search query is required', 400);
    }

    const results = await priceService.searchCoins(q);
    res.json(results);
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        positions: true,
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 30,
        },
      },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    res.json(asset);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = createAssetSchema.parse(req.body);

    const existing = await prisma.asset.findFirst({
      where: { symbol: data.symbol.toUpperCase() },
    });

    if (existing) {
      throw new AppError(`Asset with symbol ${data.symbol} already exists`, 409);
    }

    let currentPriceUsd: number | null = null;
    if (data.coingeckoId) {
      currentPriceUsd = await priceService.getDirectPrice(data.coingeckoId);
    }

    const asset = await prisma.asset.create({
      data: {
        ...data,
        symbol: data.symbol.toUpperCase(),
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd ? new Date() : null,
      },
    });

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

router.post('/from-coingecko', async (req, res, next) => {
  try {
    const { coingeckoId, symbol, name, category, skipPriceFetch } = req.body;

    if (!coingeckoId || !symbol || !name) {
      throw new AppError('coingeckoId, symbol, and name are required', 400);
    }

    const existing = await prisma.asset.findFirst({
      where: {
        OR: [{ coingeckoId }, { symbol: symbol.toUpperCase() }],
      },
    });

    if (existing) {
      return res.json(existing);
    }

    let currentPriceUsd = null;
    if (!skipPriceFetch) {
      currentPriceUsd = await priceService.getDirectPrice(coingeckoId);
    }

    const asset = await prisma.asset.create({
      data: {
        coingeckoId,
        symbol: symbol.toUpperCase(),
        name,
        category: category || AssetCategory.LIQUID_CRYPTO,
        currentPriceUsd,
        priceUpdatedAt: currentPriceUsd ? new Date() : null,
      },
    });

    res.status(201).json(asset);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = updateAssetSchema.parse(req.body);

    const asset = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        ...data,
        symbol: data.symbol?.toUpperCase(),
      },
    });

    res.json(asset);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const positions = await prisma.position.findMany({
      where: { assetId: req.params.id },
    });

    if (positions.length > 0) {
      throw new AppError('Cannot delete asset with existing positions', 400);
    }

    await prisma.asset.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.post('/:id/refresh-price', async (req, res, next) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    if (!asset.coingeckoId) {
      throw new AppError('Asset does not have a CoinGecko ID', 400);
    }

    const price = await priceService.getPrice(asset.coingeckoId);

    if (price === null) {
      throw new AppError('Failed to fetch price from CoinGecko', 502);
    }

    const updated = await prisma.asset.update({
      where: { id: req.params.id },
      data: {
        currentPriceUsd: price,
        priceUpdatedAt: new Date(),
      },
    });

    await prisma.priceHistory.create({
      data: {
        assetId: asset.id,
        priceUsd: price,
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

export default router;
