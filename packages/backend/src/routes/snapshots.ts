import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { snapshotService } from '../services/snapshotService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// GET /api/snapshots - Get all snapshots
router.get('/', async (req, res, next) => {
  try {
    const { type, from, to, limit } = req.query;

    const where: any = { userId: req.userId! };

    if (type) {
      where.snapshotType = type;
    }

    if (from || to) {
      where.timestamp = {};
      if (from) where.timestamp.gte = new Date(from as string);
      if (to) where.timestamp.lte = new Date(to as string);
    }

    const snapshots = await prisma.snapshot.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit ? parseInt(limit as string) : 100,
    });

    res.json(snapshots);
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

// GET /api/snapshots/:id - Get a single snapshot
router.get('/:id', async (req, res, next) => {
  try {
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: req.params.id },
      include: {
        positions: true,
      },
    });

    if (!snapshot) {
      throw new AppError('Snapshot not found', 404);
    }

    res.json(snapshot);
  } catch (error) {
    next(error);
  }
});

// POST /api/snapshots - Create a new snapshot manually
router.post('/', async (req, res, next) => {
  try {
    const { type } = req.body;

    const snapshotType = type || 'DAILY';
    const snapshotId = await snapshotService.createSnapshot(req.userId!, snapshotType);

    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      include: { positions: true },
    });

    res.status(201).json(snapshot);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/snapshots/:id - Delete a snapshot
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.snapshot.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
