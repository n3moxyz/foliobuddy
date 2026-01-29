import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { portfolioService } from '../services/portfolioService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const createPositionSchema = z.object({
  assetId: z.string().min(1),
  quantity: z.number().positive(),
  avgCostUsd: z.number().min(0).default(0),
  storageType: z.enum(['WALLET', 'CEX', 'DEFI', 'BANK']).default('WALLET'),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
});

const updatePositionSchema = createPositionSchema.partial();

// GET /api/positions - Get all positions
router.get('/', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const positions = await prisma.position.findMany({
      where: { userId },
      include: {
        asset: true,
      },
      orderBy: [
        { marketValueUsd: 'desc' },
        { createdAt: 'desc' },
      ],
    });

    res.json(positions);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/summary - Get portfolio summary
router.get('/summary', async (req, res, next) => {
  try {
    const summary = await portfolioService.getSummary(req.userId!);
    res.json(summary);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/allocation/category - Get allocation by category
router.get('/allocation/category', async (req, res, next) => {
  try {
    const allocation = await portfolioService.getAllocationByCategory(req.userId!);
    res.json(allocation);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/allocation/storage - Get allocation by storage
router.get('/allocation/storage', async (req, res, next) => {
  try {
    const allocation = await portfolioService.getAllocationByStorage(req.userId!);
    res.json(allocation);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/performers/top - Get top performers
router.get('/performers/top', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const performers = await portfolioService.getTopPerformers(req.userId!, limit);
    res.json(performers);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/performers/worst - Get worst performers
router.get('/performers/worst', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit as string) || 5;
    const performers = await portfolioService.getWorstPerformers(req.userId!, limit);
    res.json(performers);
  } catch (error) {
    next(error);
  }
});

// GET /api/positions/:id - Get a single position
router.get('/:id', async (req, res, next) => {
  try {
    const position = await prisma.position.findUnique({
      where: { id: req.params.id },
      include: {
        asset: true,
      },
    });

    if (!position) {
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

    // Check position limit (20 per category)
    const isStablecoin = asset.category === 'STABLECOIN' || asset.category === 'CASH';
    const categoryPositions = await prisma.position.findMany({
      where: {
        userId: req.userId!,
        asset: {
          category: isStablecoin
            ? { in: ['STABLECOIN', 'CASH'] }
            : { notIn: ['STABLECOIN', 'CASH'] }
        }
      },
    });

    if (categoryPositions.length >= 20) {
      throw new AppError(
        `Maximum 20 ${isStablecoin ? 'stables' : 'crypto'} positions allowed`,
        400
      );
    }

    // Calculate market value if asset has price
    const marketValueUsd = asset.currentPriceUsd
      ? data.quantity * asset.currentPriceUsd
      : null;
    const costBasis = data.quantity * data.avgCostUsd;
    const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
    const unrealizedPnLPct = costBasis > 0 && unrealizedPnL !== null
      ? (unrealizedPnL / costBasis) * 100
      : null;

    // Convert empty string to null for storageLocation
    const storageLocation = data.storageLocation?.trim() || null;

    const position = await prisma.position.create({
      data: {
        userId: req.userId!,
        assetId: data.assetId,
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        storageType: data.storageType,
        storageLocation,
        notes: data.notes,
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

// PUT /api/positions/:id - Update a position
router.put('/:id', async (req, res, next) => {
  try {
    const data = updatePositionSchema.parse(req.body);

    // Get existing position
    const existing = await prisma.position.findUnique({
      where: { id: req.params.id },
      include: { asset: true },
    });

    if (!existing) {
      throw new AppError('Position not found', 404);
    }

    // Recalculate market values
    const quantity = data.quantity ?? existing.quantity;
    const avgCostUsd = data.avgCostUsd ?? existing.avgCostUsd;
    const price = existing.asset.currentPriceUsd;

    const marketValueUsd = price ? quantity * price : null;
    const costBasis = quantity * avgCostUsd;
    const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
    const unrealizedPnLPct = costBasis > 0 && unrealizedPnL !== null
      ? (unrealizedPnL / costBasis) * 100
      : null;

    // Convert empty string to null for storageLocation
    const updateData = {
      ...data,
      storageLocation: data.storageLocation !== undefined
        ? (data.storageLocation?.trim() || null)
        : undefined,
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

// DELETE /api/positions/:id - Delete a position
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.position.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Bulk import schema
const bulkImportPositionSchema = z.object({
  asset: z.object({
    coingeckoId: z.string().nullable().optional(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(['LIQUID_CRYPTO', 'STABLECOIN', 'NFT', 'ANGEL', 'CASH']).default('LIQUID_CRYPTO'),
  }),
  quantity: z.number().positive(),
  avgCostUsd: z.number().min(0).default(0),
  storageType: z.enum(['WALLET', 'CEX', 'DEFI', 'BANK']).default('CEX'),
  storageLocation: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const bulkImportSchema = z.object({
  positions: z.array(bulkImportPositionSchema),
});

// POST /api/positions/bulk - Bulk import positions
router.post('/bulk', async (req, res, next) => {
  try {
    const userId = req.userId!;
    const { positions } = bulkImportSchema.parse(req.body);

    const results: Array<{ success: boolean; symbol: string; error?: string }> = [];

    // Get all existing assets once
    const existingAssets = await prisma.asset.findMany();
    const assetMap = new Map(existingAssets.map(a => [a.symbol.toUpperCase(), a]));
    const coingeckoMap = new Map(
      existingAssets.filter(a => a.coingeckoId).map(a => [a.coingeckoId!, a])
    );

    // Process all positions
    for (const pos of positions) {
      try {
        // Find existing asset by coingeckoId or symbol
        let asset = (pos.asset.coingeckoId && coingeckoMap.get(pos.asset.coingeckoId)) ||
                    assetMap.get(pos.asset.symbol.toUpperCase());

        // Create asset if it doesn't exist
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
          // Add to maps for subsequent positions
          assetMap.set(asset.symbol.toUpperCase(), asset);
          if (asset.coingeckoId) {
            coingeckoMap.set(asset.coingeckoId, asset);
          }
        }

        // Calculate market value if asset has price
        const marketValueUsd = asset.currentPriceUsd
          ? pos.quantity * asset.currentPriceUsd
          : null;
        const costBasis = pos.quantity * pos.avgCostUsd;
        const unrealizedPnL = marketValueUsd !== null ? marketValueUsd - costBasis : null;
        const unrealizedPnLPct = costBasis > 0 && unrealizedPnL !== null
          ? (unrealizedPnL / costBasis) * 100
          : null;

        // Create position
        await prisma.position.create({
          data: {
            userId,
            assetId: asset.id,
            quantity: pos.quantity,
            avgCostUsd: pos.avgCostUsd,
            storageType: pos.storageType,
            storageLocation: pos.storageLocation?.trim() || null,
            notes: pos.notes || null,
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

    const successCount = results.filter(r => r.success).length;
    res.status(201).json({ results, successCount, totalCount: positions.length });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/positions - Delete all positions for the user
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
