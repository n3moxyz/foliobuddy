import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../index.js';
import { portfolioService } from '../services/portfolioService.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();

// Validation schemas
const createInvestorSchema = z.object({
  name: z.string().min(1),
  stakePercentage: z.number().min(0).max(100).optional(), // Optional - will auto-calculate as remainder
  initialCapital: z.number().min(0).default(0),
  joinDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  notes: z.string().optional(),
  isOwner: z.boolean().optional(),
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
    const investorsWithValues = investors.map((investor) => {
      const currentValue = summary.totalValueUsd * (investor.stakePercentage / 100);
      // Use initialCapital as capital at start of year (if set)
      const capitalAtYearStart = investor.initialCapital || 0;
      const ytdReturn = capitalAtYearStart > 0 ? currentValue - capitalAtYearStart : null;
      const ytdReturnPct = capitalAtYearStart > 0 ? (ytdReturn! / capitalAtYearStart) * 100 : null;

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

    if (!investor || investor.userId !== req.userId) {
      throw new AppError('Investor not found', 404);
    }

    // Calculate current value
    const summary = await portfolioService.getSummary(req.userId!);
    const currentValue = summary.totalValueUsd * (investor.stakePercentage / 100);
    const totalReturn = currentValue - investor.initialCapital;
    const totalReturnPct =
      investor.initialCapital > 0 ? (totalReturn / investor.initialCapital) * 100 : 0;

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

    if (!investor || investor.userId !== req.userId) {
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
    const performanceHistory = snapshots.map((snapshot) => ({
      timestamp: snapshot.timestamp,
      portfolioValue: snapshot.totalValueUsd,
      investorValue: snapshot.totalValueUsd * (investor.stakePercentage / 100),
      monthlyReturn: snapshot.monthlyReturn,
      ytdReturn: snapshot.ytdReturn,
    }));

    const totalReturn = currentValue - investor.initialCapital;
    const totalReturnPct =
      investor.initialCapital > 0 ? (totalReturn / investor.initialCapital) * 100 : 0;

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

    // If setting as owner, clear existing owner first
    if (data.isOwner) {
      await prisma.investor.updateMany({
        where: { userId: req.userId!, isOwner: true },
        data: { isOwner: false },
      });
    }

    // Get existing investors to calculate available stake
    const existingInvestors = await prisma.investor.findMany({
      where: { userId: req.userId! },
    });

    const currentTotalStake = existingInvestors.reduce((sum, inv) => sum + inv.stakePercentage, 0);

    // Auto-calculate stake as remainder if not provided
    const stakePercentage = data.stakePercentage ?? 100 - currentTotalStake;

    // Verify total stake doesn't exceed 100%
    if (currentTotalStake + stakePercentage > 100) {
      throw new AppError(
        `Total stake percentage cannot exceed 100%. Current: ${currentTotalStake}%, New: ${stakePercentage}%`,
        400
      );
    }

    if (stakePercentage <= 0) {
      throw new AppError(`No stake available. Current total: ${currentTotalStake}%`, 400);
    }

    // Get current portfolio value
    const summary = await portfolioService.getSummary(req.userId!);
    const currentValue = summary.totalValueUsd * (stakePercentage / 100);

    const investor = await prisma.investor.create({
      data: {
        userId: req.userId!,
        name: data.name,
        stakePercentage,
        initialCapital: data.initialCapital,
        currentValue,
        totalReturn: currentValue - data.initialCapital,
        totalReturnPct:
          data.initialCapital > 0
            ? ((currentValue - data.initialCapital) / data.initialCapital) * 100
            : 0,
        joinDate: data.joinDate ?? new Date(),
        notes: data.notes,
        isOwner: data.isOwner ?? false,
      },
    });

    // Create initial stake record
    await prisma.investorStake.create({
      data: {
        investorId: investor.id,
        stakePercentage,
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

    const existing = await prisma.investor.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      throw new AppError('Investor not found', 404);
    }

    // If setting as owner, clear existing owner first
    if (data.isOwner) {
      await prisma.investor.updateMany({
        where: { userId: req.userId!, isOwner: true, id: { not: req.params.id } },
        data: { isOwner: false },
      });
    }

    if (data.stakePercentage !== undefined) {
      const otherStakeTotal = await prisma.investor.aggregate({
        where: {
          userId: req.userId!,
          id: { not: req.params.id },
        },
        _sum: {
          stakePercentage: true,
        },
      });

      const projectedTotal = (otherStakeTotal._sum.stakePercentage ?? 0) + data.stakePercentage;
      if (projectedTotal > 100) {
        throw new AppError(
          `Total stake percentage cannot exceed 100%. Projected: ${projectedTotal}%`,
          400
        );
      }
    }

    // Record stake change if stake percentage is being updated
    if (data.stakePercentage !== undefined) {
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
// Query param: reassignTo - ID of investor to receive the freed stake
router.delete('/:id', async (req, res, next) => {
  try {
    const investorToDelete = await prisma.investor.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!investorToDelete) {
      throw new AppError('Investor not found', 404);
    }

    const reassignToId = req.query.reassignTo as string | undefined;

    // If reassignTo is provided, transfer the stake
    if (reassignToId) {
      if (reassignToId === req.params.id) {
        throw new AppError('Cannot reassign stake to the same investor', 400);
      }

      const targetInvestor = await prisma.investor.findFirst({
        where: {
          id: reassignToId,
          userId: req.userId!,
        },
      });

      if (!targetInvestor) {
        throw new AppError('Target investor for stake reassignment not found', 404);
      }

      // Update the target investor's stake
      const newStake = targetInvestor.stakePercentage + investorToDelete.stakePercentage;
      await prisma.investor.update({
        where: { id: reassignToId },
        data: { stakePercentage: newStake },
      });

      // Record stake change for the target investor
      const summary = await portfolioService.getSummary(req.userId!);
      const newValue = summary.totalValueUsd * (newStake / 100);
      await prisma.investorStake.create({
        data: {
          investorId: reassignToId,
          stakePercentage: newStake,
          valueAtTime: newValue,
        },
      });
    }

    await prisma.investor.delete({
      where: { id: investorToDelete.id },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
