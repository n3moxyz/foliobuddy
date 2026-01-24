import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { portfolioService } from '../services/portfolioService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const createInvestorSchema = z.object({
  name: z.string().min(1),
  stakePercentage: z.number().min(0).max(100),
  initialCapital: z.number().min(0).default(0),
  joinDate: z.string().transform(s => new Date(s)).optional(),
  notes: z.string().optional(),
});

const updateInvestorSchema = createInvestorSchema.partial();

// GET /api/investors - Get all investors
router.get('/', async (req, res, next) => {
  try {
    // Get current portfolio value
    const summary = await portfolioService.getSummary(req.userId!);

    const investors = await prisma.investor.findMany({
      where: { userId: req.userId! },
      orderBy: { stakePercentage: 'desc' },
    });

    // Calculate current values and YTD returns based on stake percentage
    const investorsWithValues = investors.map(investor => {
      const currentValue = summary.totalValueUsd * (investor.stakePercentage / 100);
      // Use initialCapital as capital at start of year (if set)
      const capitalAtYearStart = investor.initialCapital || 0;
      const ytdReturn = capitalAtYearStart > 0 ? currentValue - capitalAtYearStart : null;
      const ytdReturnPct = capitalAtYearStart > 0
        ? (ytdReturn! / capitalAtYearStart) * 100
        : null;

      return {
        ...investor,
        currentValue,
        capitalAtYearStart,
        ytdReturn,
        ytdReturnPct,
      };
    });

    res.json(investorsWithValues);
  } catch (error) {
    next(error);
  }
});

// GET /api/investors/:id - Get a single investor
router.get('/:id', async (req, res, next) => {
  try {
    const investor = await prisma.investor.findUnique({
      where: { id: req.params.id },
      include: {
        stakes: {
          orderBy: { timestamp: 'desc' },
          take: 50,
        },
      },
    });

    if (!investor) {
      throw new AppError('Investor not found', 404);
    }

    // Calculate current value
    const summary = await portfolioService.getSummary(req.userId!);
    const currentValue = summary.totalValueUsd * (investor.stakePercentage / 100);
    const totalReturn = currentValue - investor.initialCapital;
    const totalReturnPct = investor.initialCapital > 0
      ? (totalReturn / investor.initialCapital) * 100
      : 0;

    res.json({
      ...investor,
      currentValue,
      totalReturn,
      totalReturnPct,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/investors/:id/report - Get investor report with historical data
router.get('/:id/report', async (req, res, next) => {
  try {
    const investor = await prisma.investor.findUnique({
      where: { id: req.params.id },
    });

    if (!investor) {
      throw new AppError('Investor not found', 404);
    }

    // Get current portfolio summary
    const summary = await portfolioService.getSummary(req.userId!);
    const currentValue = summary.totalValueUsd * (investor.stakePercentage / 100);

    // Get historical stake values
    const stakeHistory = await prisma.investorStake.findMany({
      where: { investorId: investor.id },
      orderBy: { timestamp: 'asc' },
    });

    // Get portfolio snapshots for performance tracking
    const snapshots = await prisma.snapshot.findMany({
      where: {
        userId: req.userId!,
        timestamp: { gte: investor.joinDate },
      },
      orderBy: { timestamp: 'asc' },
      select: {
        timestamp: true,
        totalValueUsd: true,
        monthlyReturn: true,
        ytdReturn: true,
      },
    });

    // Calculate investor's share of each snapshot
    const performanceHistory = snapshots.map(snapshot => ({
      timestamp: snapshot.timestamp,
      portfolioValue: snapshot.totalValueUsd,
      investorValue: snapshot.totalValueUsd * (investor.stakePercentage / 100),
      monthlyReturn: snapshot.monthlyReturn,
      ytdReturn: snapshot.ytdReturn,
    }));

    const totalReturn = currentValue - investor.initialCapital;
    const totalReturnPct = investor.initialCapital > 0
      ? (totalReturn / investor.initialCapital) * 100
      : 0;

    res.json({
      investor: {
        ...investor,
        currentValue,
        totalReturn,
        totalReturnPct,
      },
      stakeHistory,
      performanceHistory,
      summary: {
        initialCapital: investor.initialCapital,
        currentValue,
        totalReturn,
        totalReturnPct,
        stakePercentage: investor.stakePercentage,
        joinDate: investor.joinDate,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/investors - Create a new investor
router.post('/', async (req, res, next) => {
  try {
    const data = createInvestorSchema.parse(req.body);

    // Verify total stake doesn't exceed 100%
    const existingInvestors = await prisma.investor.findMany({
      where: { userId: req.userId! },
    });

    const currentTotalStake = existingInvestors.reduce(
      (sum, inv) => sum + inv.stakePercentage,
      0
    );

    if (currentTotalStake + data.stakePercentage > 100) {
      throw new AppError(
        `Total stake percentage cannot exceed 100%. Current: ${currentTotalStake}%, New: ${data.stakePercentage}%`,
        400
      );
    }

    // Get current portfolio value
    const summary = await portfolioService.getSummary(req.userId!);
    const currentValue = summary.totalValueUsd * (data.stakePercentage / 100);

    const investor = await prisma.investor.create({
      data: {
        userId: req.userId!,
        name: data.name,
        stakePercentage: data.stakePercentage,
        initialCapital: data.initialCapital,
        currentValue,
        totalReturn: currentValue - data.initialCapital,
        totalReturnPct: data.initialCapital > 0
          ? ((currentValue - data.initialCapital) / data.initialCapital) * 100
          : 0,
        joinDate: data.joinDate ?? new Date(),
        notes: data.notes,
      },
    });

    // Create initial stake record
    await prisma.investorStake.create({
      data: {
        investorId: investor.id,
        stakePercentage: data.stakePercentage,
        valueAtTime: currentValue,
      },
    });

    res.status(201).json(investor);
  } catch (error) {
    next(error);
  }
});

// PUT /api/investors/:id - Update an investor
router.put('/:id', async (req, res, next) => {
  try {
    const data = updateInvestorSchema.parse(req.body);

    const existing = await prisma.investor.findUnique({
      where: { id: req.params.id },
    });

    if (!existing) {
      throw new AppError('Investor not found', 404);
    }

    // Check stake percentage change
    if (data.stakePercentage !== undefined) {
      const otherInvestors = await prisma.investor.findMany({
        where: {
          userId: req.userId!,
          id: { not: req.params.id },
        },
      });

      const otherTotalStake = otherInvestors.reduce(
        (sum, inv) => sum + inv.stakePercentage,
        0
      );

      if (otherTotalStake + data.stakePercentage > 100) {
        throw new AppError(
          `Total stake percentage cannot exceed 100%. Others: ${otherTotalStake}%, New: ${data.stakePercentage}%`,
          400
        );
      }

      // Record stake change
      const summary = await portfolioService.getSummary(req.userId!);
      const newValue = summary.totalValueUsd * (data.stakePercentage / 100);

      await prisma.investorStake.create({
        data: {
          investorId: req.params.id,
          stakePercentage: data.stakePercentage,
          valueAtTime: newValue,
        },
      });
    }

    const investor = await prisma.investor.update({
      where: { id: req.params.id },
      data,
    });

    res.json(investor);
  } catch (error) {
    next(error);
  }
});

// DELETE /api/investors/:id - Delete an investor
router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.investor.delete({
      where: { id: req.params.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
