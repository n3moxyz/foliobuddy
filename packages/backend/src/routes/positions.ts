import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { portfolioService } from '../services/portfolioService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import {
  MAX_POSITIONS_PER_CATEGORY,
  ASSET_CATEGORIES,
  STORAGE_TYPES,
  STABLECOIN_CATEGORIES,
  StorageType,
} from '../lib/constants.js';

const router = Router();

const createPositionSchema = z.object({
  assetId: z.string().min(1),
  quantity: z.number().positive(),
  avgCostUsd: z.number().min(0).default(0),
  storageType: z.enum(STORAGE_TYPES).default(StorageType.WALLET),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
  custodyOf: z.string().nullable().optional(),
});

const updatePositionSchema = createPositionSchema.partial();

router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const positions = await prisma.position.findMany({
      where: { userId },
      include: {
        asset: true,
      },
      orderBy: [{ marketValueUsd: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });

    res.json(positions);
  } catch (error) {
    next(error);
  }
});

router.get('/summary', async (req, res, next) => {
  try {
    const summary = await portfolioService.getSummary(req.userId!);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

router.get('/allocation/category', async (req, res, next) => {
  try {
    const allocation = await portfolioService.getAllocationByCategory(req.userId!);
    res.json(allocation);
  } catch (error) {
    next(error);
  }
});

router.get('/allocation/storage', async (req, res, next) => {
  try {
    const allocation = await portfolioService.getAllocationByStorage(req.userId!);
    res.json(allocation);
  } catch (error) {
    next(error);
  }
});

router.get('/performers/top', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const performers = await portfolioService.getTopPerformers(req.userId!, limit);
    res.json(performers);
  } catch (error) {
    next(error);
  }
});

router.get('/performers/worst', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const performers = await portfolioService.getWorstPerformers(req.userId!, limit);
    res.json(performers);
  } catch (error) {
    next(error);
  }
});

const bulkImportPositionSchema = z.object({
  asset: z.object({
    coingeckoId: z.string().nullable().optional(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(ASSET_CATEGORIES).default('LIQUID_CRYPTO'),
  }),
  quantity: z.number().positive(),
  avgCostUsd: z.number().min(0).default(0),
  storageType: z.enum(STORAGE_TYPES).default(StorageType.CEX),
  storageLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  custodyOf: z.string().nullable().optional(),
});

const bulkImportSchema = z.object({
  positions: z.array(bulkImportPositionSchema),
});

router.post('/bulk', async (req, res, next) => {
  try {
    logger.info(
      'Bulk position import request received:',
      JSON.stringify(req.body).substring(0, 200)
    );
    const userId = req.userId!;
    const { positions } = bulkImportSchema.parse(req.body);

    const results: Array<{ success: boolean; symbol: string; error?: string }> = [];

    const existingAssets = await prisma.asset.findMany();
    const assetMap = new Map(existingAssets.map((a) => [a.symbol.toUpperCase(), a]));
    const coingeckoMap = new Map(
      existingAssets.filter((a) => a.coingeckoId).map((a) => [a.coingeckoId!, a])
    );

    for (const pos of positions) {
      try {
        let asset =
          (pos.asset.coingeckoId && coingeckoMap.get(pos.asset.coingeckoId)) ||
          assetMap.get(pos.asset.symbol.toUpperCase());

        if (!asset) {
          asset = await prisma.asset.create({
            data: {
              coingeckoId: pos.asset.coingeckoId || null,
              symbol: pos.asset.symbol.toUpperCase(),
              name: pos.asset.name,
              category: pos.asset.category,
              currentPriceUsd: null,
            },
          });
          assetMap.set(asset.symbol.toUpperCase(), asset);
          if (asset.coingeckoId) {
            coingeckoMap.set(asset.coingeckoId, asset);
          }
        }

        const marketValueUsd = asset.currentPriceUsd ? pos.quantity * asset.currentPriceUsd : null;
        const costBasis = pos.quantity * pos.avgCostUsd;
        const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
        const unrealizedPnLPct =
          costBasis > 0 && unrealizedPnL !== null ? (unrealizedPnL / costBasis) * 100 : null;

        await prisma.position.create({
          data: {
            userId,
            assetId: asset.id,
            quantity: pos.quantity,
            avgCostUsd: pos.avgCostUsd,
            storageType: pos.storageType,
            storageLocation: pos.storageLocation?.trim() || null,
            notes: pos.notes || null,
            custodyOf: pos.custodyOf?.trim() || null,
            marketValueUsd,
            unrealizedPnL,
            unrealizedPnLPct,
          },
        });

        results.push({ success: true, symbol: pos.asset.symbol });
      } catch (e) {
        results.push({
          success: false,
          symbol: pos.asset.symbol,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    res.status(201).json({ results, successCount, totalCount: positions.length });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const position = await prisma.position.findUnique({
      where: { id: req.params.id },
      include: {
        asset: true,
      },
    });

    if (!position || position.userId !== req.userId) {
      throw new AppError('Position not found', 404);
    }

    res.json(position);
  } catch (error) {
    next(error);
  }
});

// POST /api/positions - Create a new position
router.post('/', async (req, res, next) => {
  try {
    const data = createPositionSchema.parse(req.body);

    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    const isStablecoin = (STABLECOIN_CATEGORIES as string[]).includes(asset.category);
    const categoryPositions = await prisma.position.findMany({
      where: {
        userId: req.userId!,
        custodyOf: null,
        asset: {
          category: isStablecoin ? { in: STABLECOIN_CATEGORIES } : { notIn: STABLECOIN_CATEGORIES },
        },
      },
    });

    if (categoryPositions.length >= MAX_POSITIONS_PER_CATEGORY) {
      throw new AppError(
        `Maximum ${MAX_POSITIONS_PER_CATEGORY} ${isStablecoin ? 'stables' : 'crypto'} positions allowed`,
        400
      );
    }

    const marketValueUsd = asset.currentPriceUsd ? data.quantity * asset.currentPriceUsd : null;
    const costBasis = data.quantity * data.avgCostUsd;
    const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
    const unrealizedPnLPct =
      costBasis > 0 && unrealizedPnL !== null ? (unrealizedPnL / costBasis) * 100 : null;

    const storageLocation = data.storageLocation?.trim() || null;
    const custodyOf = data.custodyOf?.trim() || null;

    const position = await prisma.position.create({
      data: {
        userId: req.userId!,
        assetId: data.assetId,
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        storageType: data.storageType,
        storageLocation,
        notes: data.notes,
        custodyOf,
        marketValueUsd,
        unrealizedPnL,
        unrealizedPnLPct,
      },
      include: {
        asset: true,
      },
    });

    res.status(201).json(position);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = updatePositionSchema.parse(req.body);

    const existing = await prisma.position.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
      include: { asset: true },
    });

    if (!existing) {
      throw new AppError('Position not found', 404);
    }

    const quantity = data.quantity ?? existing.quantity;
    const avgCostUsd = data.avgCostUsd ?? existing.avgCostUsd;
    const price = existing.asset.currentPriceUsd;

    const marketValueUsd = price ? quantity * price : null;
    const costBasis = quantity * avgCostUsd;
    const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
    const unrealizedPnLPct =
      costBasis > 0 && unrealizedPnL !== null ? (unrealizedPnL / costBasis) * 100 : null;

    const updateData = {
      ...data,
      storageLocation:
        data.storageLocation !== undefined ? data.storageLocation?.trim() || null : undefined,
      custodyOf: data.custodyOf !== undefined ? data.custodyOf?.trim() || null : undefined,
    };

    const position = await prisma.position.update({
      where: { id: req.params.id },
      data: {
        ...updateData,
        marketValueUsd,
        unrealizedPnL,
        unrealizedPnLPct,
      },
      include: {
        asset: true,
      },
    });

    res.json(position);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.position.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (result.count === 0) {
      throw new AppError('Position not found', 404);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const result = await prisma.position.deleteMany({
      where: { userId },
    });

    res.json({ count: result.count });
  } catch (error) {
    next(error);
  }
});

export default router;
