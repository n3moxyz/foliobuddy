import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { snapshotService } from '../services/snapshotService.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../lib/logger.js';
import {
  DEFAULT_SNAPSHOT_LIMIT,
  SNAPSHOT_TYPES,
  SnapshotType,
  SnapshotSource,
  MAX_HISTORICAL_DAYS,
} from '../lib/constants.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { isValidDateInput, parseBoundedIntegerQuery, parseDateQuery } from '../lib/queryParams.js';

const router = Router();

const createManualSnapshotSchema = z.object({
  timestamp: z
    .string()
    .refine(isValidDateInput, 'Invalid timestamp')
    .transform((s) => new Date(s)),
  snapshotType: z.enum(SNAPSHOT_TYPES).default(SnapshotType.DAILY),
  totalValueUsd: z.number().positive(),
  totalCostBasis: z.number().optional(),
  notes: z.string().optional(),
});

const updateSnapshotSchema = z.object({
  timestamp: z
    .string()
    .refine(isValidDateInput, 'Invalid timestamp')
    .transform((s) => new Date(s))
    .optional(),
  snapshotType: z.enum(SNAPSHOT_TYPES).optional(),
  totalValueUsd: z.number().positive().optional(),
  totalCostBasis: z.number().optional(),
  notes: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { type, source, from, to, limit } = req.query;

    const where: Prisma.SnapshotWhereInput = {
      userId: req.userId!,
      ...(type ? { snapshotType: type as string } : {}),
      ...(source ? { source: source as string } : {}),
      ...(from !== undefined || to !== undefined
        ? {
            timestamp: {
              ...(from !== undefined ? { gte: parseDateQuery(from, 'from')! } : {}),
              ...(to !== undefined ? { lte: parseDateQuery(to, 'to')! } : {}),
            },
          }
        : {}),
    };

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
        take: parseBoundedIntegerQuery(limit, {
          name: 'limit',
          defaultValue: DEFAULT_SNAPSHOT_LIMIT,
          max: DEFAULT_SNAPSHOT_LIMIT,
        }),
      });
      res.json(snapshots);
    }
  } catch (error) {
    next(error);
  }
});

router.get('/performance', async (req, res, next) => {
  try {
    const { days, from, to, all } = req.query;

    let history;
    if (all === 'true') {
      history = await snapshotService.getPerformanceHistoryByRange(req.userId!);
    } else if (from !== undefined || to !== undefined) {
      const fromDate = parseDateQuery(from, 'from');
      const toDate = parseDateQuery(to, 'to');
      history = await snapshotService.getPerformanceHistoryByRange(req.userId!, fromDate, toDate);
    } else {
      const numDays = parseBoundedIntegerQuery(days, {
        name: 'days',
        defaultValue: 30,
        max: MAX_HISTORICAL_DAYS,
      });
      history = await snapshotService.getPerformanceHistory(req.userId!, numDays);
    }

    res.json(history);
  } catch (error) {
    next(error);
  }
});

router.get('/monthly', async (req, res, next) => {
  try {
    const year = parseBoundedIntegerQuery(req.query.year, {
      name: 'year',
      defaultValue: new Date().getUTCFullYear(),
      min: 1970,
      max: 9999,
      clampMax: false,
    });
    const returns = await snapshotService.getMonthlyReturns(req.userId!, year);
    res.json(returns);
  } catch (error) {
    next(error);
  }
});

const bulkImportSnapshotSchema = z.object({
  timestamp: z.string().refine(isValidDateInput, 'Invalid timestamp'),
  snapshotType: z.enum(SNAPSHOT_TYPES).default(SnapshotType.DAILY),
  totalValueUsd: z.number().min(0),
  totalCostBasis: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

const bulkImportSchema = z.object({
  snapshots: z.array(bulkImportSnapshotSchema),
});

router.post('/bulk', async (req, res, next) => {
  try {
    logger.info('Bulk import request received:', JSON.stringify(req.body).substring(0, 200));
    const userId = req.userId!;
    const { snapshots } = bulkImportSchema.parse(req.body);

    const results: Array<{ success: boolean; timestamp: string; error?: string }> = [];

    for (const snap of snapshots) {
      try {
        const timestamp = new Date(snap.timestamp);

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

    const enrichedPositions = await Promise.all(
      snapshot.positions.map(async (pos) => {
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

router.post('/', async (req, res, next) => {
  try {
    const { manual } = req.body;

    if (manual) {
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
      const { type: snapshotType } = z
        .object({ type: z.enum(SNAPSHOT_TYPES).default(SnapshotType.DAILY) })
        .parse(req.body);
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

router.put('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const existing = await prisma.snapshot.findFirst({
      where: { id, userId: req.userId! },
    });

    if (!existing) {
      throw new AppError('Snapshot not found', 404);
    }

    const parsed = updateSnapshotSchema.parse(req.body);

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

router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

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
