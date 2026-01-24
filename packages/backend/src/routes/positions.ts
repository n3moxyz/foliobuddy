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

export default router;
