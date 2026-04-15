import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { snapshotService } from '../services/snapshotService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import {
  DEFAULT_SNAPSHOT_LIMIT,
  SNAPSHOT_TYPES,
  SnapshotType,
  SnapshotSource,
} from '../lib/constants.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';

const router = Router();

const createManualSnapshotSchema = z.object({
  timestamp: z.string().transform((s) => new Date(s)),
  snapshotType: z.enum(SNAPSHOT_TYPES).default(SnapshotType.DAILY),
  totalValueUsd: z.number().positive(),
  totalCostBasis: z.number().optional(),
  notes: z.string().optional(),
});

const updateSnapshotSchema = z.object({
  timestamp: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  snapshotType: z.enum(SNAPSHOT_TYPES).optional(),
  totalValueUsd: z.number().positive().optional(),
  totalCostBasis: z.number().optional(),
  notes: z.string().optional(),
});

// GET /api/snapshots - Get all snapshots
router.get('/', async (req, res, next) => {
  try {
    const { type, source, from, to, limit } = req.query;

    const where: any = { userId: req.userId! };

    if (type) {
      where.snapshotType = type;
    }

    if (source) {
      where.source = source;
    }

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from as string);
      if (to) where.timestamp.lte = new Date(to as string);
    }

    const pagination = parsePagination(req);

    if (pagination) {
      const [snapshots, total] = await Promise.all([
        prisma.snapshot.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: pagination.skip,
          take: pagination.limit,
        }),
        prisma.snapshot.count({ where }),
      ]);
      res.json(paginatedResponse(snapshots, total, pagination));
    } else {
      const snapshots = await prisma.snapshot.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit ? parseInt(limit as string) : DEFAULT_SNAPSHOT_LIMIT,
      });
      res.json(snapshots);
    }
  } catch (error) {
    next(error);
  }
});

// GET /api/snapshots/performance - Get performance chart data
router.get('/performance', async (req, res, next) => {
  try {
    const { days, from, to } = req.query;

    let history;
    if (from || to) {
      // Use date range if provided
      const fromDate = from ? new Date(from as string) : undefined;
      const toDate = to ? new Date(to as string) : undefined;
      history = await snapshotService.getPerformanceHistoryByRange(req.userId!, fromDate, toDate);
    } else {
      // Fall back to days parameter
      const numDays = parseInt(days as string) || 30;
      history = await snapshotService.getPerformanceHistory(req.userId!, numDays);
    }

    res.json(history);
  } catch (error) {
    next(error);
  }
});

// GET /api/snapshots/monthly - Get monthly returns
router.get('/monthly', async (req, res, next) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear();
    const returns = await snapshotService.getMonthlyReturns(req.userId!, year);
    res.json(returns);
  } catch (error) {
    next(error);
  }
});

// Bulk import schema
const bulkImportSnapshotSchema = z.object({
  timestamp: z.string(),
  snapshotType: z.enum(SNAPSHOT_TYPES).default(SnapshotType.DAILY),
  totalValueUsd: z.number().min(0),
  totalCostBasis: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bulkImportSchema = z.object({
  snapshots: z.array(bulkImportSnapshotSchema),
});

// POST /api/snapshots/bulk - Bulk import snapshots (must be before /:id routes)
router.post('/bulk', async (req, res, next) => {
  try {
    logger.info('Bulk import request received:', JSON.stringify(req.body).substring(0, 200));
    const userId = req.userId!;
    const { snapshots } = bulkImportSchema.parse(req.body);

    const results: Array<{ success: boolean; timestamp: string; error?: string }> = [];

    for (const snap of snapshots) {
      try {
        const timestamp = new Date(snap.timestamp);

        // Check if snapshot already exists for this date
        const startOfDay = new Date(timestamp);
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(timestamp);
        endOfDay.setUTCHours(23, 59, 59, 999);

        const existing = await prisma.snapshot.findFirst({
          where: {
            userId,
            timestamp: {
              gte: startOfDay,
              lte: endOfDay,
            },
          },
        });

        if (existing) {
          // Update existing snapshot
          await prisma.snapshot.update({
            where: { id: existing.id },
            data: {
              totalValueUsd: snap.totalValueUsd,
              totalCostBasis: snap.totalCostBasis ?? undefined,
              notes: snap.notes ?? undefined,
              source: SnapshotSource.MANUAL,
            },
          });
          results.push({ success: true, timestamp: snap.timestamp });
        } else {
          // Create new snapshot
          await prisma.snapshot.create({
            data: {
              userId,
              timestamp,
              snapshotType: snap.snapshotType,
              source: SnapshotSource.MANUAL,
              totalValueUsd: snap.totalValueUsd,
              totalCostBasis: snap.totalCostBasis ?? undefined,
              notes: snap.notes ?? undefined,
            },
          });
          results.push({ success: true, timestamp: snap.timestamp });
        }
      } catch (e) {
        results.push({
          success: false,
          timestamp: snap.timestamp,
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    res.status(201).json({ results, successCount, totalCount: snapshots.length });
  } catch (error) {
    next(error);
  }
});

// GET /api/snapshots/:id - Get a single snapshot
router.get('/:id', async (req, res, next) => {
  try {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: req.params.id },
      include: {
        positions: true,
      },
    });

    if (!snapshot || snapshot.userId !== req.userId) {
      throw new AppError('Snapshot not found', 404);
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// GET /api/snapshots/:id/positions - Get snapshot positions with enriched asset data
router.get('/:id/positions', async (req, res, next) => {
  try {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: req.params.id },
      include: {
        positions: true,
      },
    });

    if (!snapshot || snapshot.userId !== req.userId) {
      throw new AppError('Snapshot not found', 404);
    }

    // Enrich positions with asset data for import compatibility
    const enrichedPositions = await Promise.all(
      snapshot.positions.map(async (pos) => {
        // Try to find the asset by symbol
        const asset = await prisma.asset.findFirst({
          where: { symbol: pos.assetSymbol },
        });

        return {
          ...pos,
          asset: asset
            ? {
                coingeckoId: asset.coingeckoId,
                symbol: asset.symbol,
                name: asset.name,
                category: asset.category,
              }
            : {
                coingeckoId: null,
                symbol: pos.assetSymbol,
                name: pos.assetSymbol,
                category: 'LIQUID_CRYPTO',
              },
        };
      })
    );

    res.json(enrichedPositions);
  } catch (error) {
    next(error);
  }
});

// POST /api/snapshots - Create a new snapshot
router.post('/', async (req, res, next) => {
  try {
    const { manual } = req.body;

    if (manual) {
      // Manual snapshot with user-provided data
      const parsed = createManualSnapshotSchema.parse(req.body);

      const snapshot = await prisma.snapshot.create({
        data: {
          userId: req.userId!,
          timestamp: parsed.timestamp,
          snapshotType: parsed.snapshotType,
          source: SnapshotSource.MANUAL,
          totalValueUsd: parsed.totalValueUsd,
          totalCostBasis: parsed.totalCostBasis,
          notes: parsed.notes,
        },
      });

      res.status(201).json(snapshot);
    } else {
      // Automatic snapshot from current portfolio state
      const { type } = req.body;
      const snapshotType = type || 'DAILY';
      const snapshotId = await snapshotService.createSnapshot(req.userId!, snapshotType);

      const snapshot = await prisma.snapshot.findUnique({
        where: { id: snapshotId },
        include: { positions: true },
      });

      res.status(201).json(snapshot);
    }
  } catch (error) {
    next(error);
  }
});

// PUT /api/snapshots/:id - Update a snapshot
router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.snapshot.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      throw new AppError('Snapshot not found', 404);
    }

    const parsed = updateSnapshotSchema.parse(req.body);

    // Only allow timestamp changes for manual snapshots
    if (parsed.timestamp && existing.source === SnapshotSource.AUTOMATIC) {
      throw new AppError('Cannot change timestamp of automatic snapshots', 400);
    }

    const snapshot = await prisma.snapshot.update({
      where: { id },
      data: {
        ...(parsed.timestamp && { timestamp: parsed.timestamp }),
        ...(parsed.snapshotType && { snapshotType: parsed.snapshotType }),
        ...(parsed.totalValueUsd !== undefined && { totalValueUsd: parsed.totalValueUsd }),
        ...(parsed.totalCostBasis !== undefined && { totalCostBasis: parsed.totalCostBasis }),
        ...(parsed.notes !== undefined && { notes: parsed.notes }),
      },
    });

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/snapshots/:id - Delete a snapshot
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existing = await prisma.snapshot.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      throw new AppError('Snapshot not found', 404);
    }

    await prisma.snapshot.delete({
      where: { id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// DELETE /api/snapshots - Delete all snapshots for the user
router.delete('/', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const result = await prisma.snapshot.deleteMany({
      where: { userId },
    });

    res.json({ count: result.count });
  } catch (error) {
    next(error);
  }
});

export default router;
