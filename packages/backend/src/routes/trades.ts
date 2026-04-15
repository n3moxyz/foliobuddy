import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { parsePagination, paginatedResponse } from '../lib/pagination.js';
import { calculateTradePnL } from '../lib/tradePnL.js';
import {
  TRADE_DIRECTIONS,
  TRADE_STATUSES,
  ASSET_CATEGORIES,
  TradeDirection,
  TradeStatus,
} from '../lib/constants.js';

const router = Router();

const createTradeSchema = z.object({
  assetId: z.string().min(1),
  direction: z.enum(TRADE_DIRECTIONS).default(TradeDirection.LONG),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional(),
  quantity: z.number().positive(),
  entryDate: z.string().transform((s) => new Date(s)),
  exitDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateTradeSchema = z.object({
  direction: z.enum(TRADE_DIRECTIONS).optional(),
  entryPrice: z.number().positive().optional(),
  exitPrice: z.number().positive().optional(),
  quantity: z.number().positive().optional(),
  entryDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  exitDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const closeTradeSchema = z.object({
  exitPrice: z.number().positive(),
  exitDate: z
    .string()
    .transform((s) => new Date(s))
    .optional(),
  notes: z.string().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const { status, assetId, direction, from, to } = req.query;

    const where: Prisma.TradeWhereInput = {
      userId: req.userId!,
      ...(status ? { status: status as string } : {}),
      ...(assetId ? { assetId: assetId as string } : {}),
      ...(direction ? { direction: direction as string } : {}),
      ...(from || to
        ? {
            entryDate: {
              ...(from ? { gte: new Date(from as string) } : {}),
              ...(to ? { lte: new Date(to as string) } : {}),
            },
          }
        : {}),
    };

    const pagination = parsePagination(req);

    if (pagination) {
      const [trades, total] = await Promise.all([
        prisma.trade.findMany({
          where,
          include: { asset: true },
          orderBy: { entryDate: 'desc' },
          skip: pagination.skip,
          take: pagination.limit,
        }),
        prisma.trade.count({ where }),
      ]);
      res.json(paginatedResponse(trades, total, pagination));
    } else {
      const trades = await prisma.trade.findMany({
        where,
        include: {
          asset: true,
        },
        orderBy: {
          entryDate: 'desc',
        },
      });
      res.json(trades);
    }
  } catch (error) {
    next(error);
  }
});

router.get('/analytics', async (req, res, next) => {
  try {
    const { from, to } = req.query;

    const where: Prisma.TradeWhereInput = {
      userId: req.userId!,
      status: 'CLOSED',
      ...(from || to
        ? {
            exitDate: {
              ...(from ? { gte: new Date(from as string) } : {}),
              ...(to ? { lte: new Date(to as string) } : {}),
            },
          }
        : {}),
    };

    const trades = await prisma.trade.findMany({
      where,
      include: { asset: true },
    });

    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => (t.realizedPnL ?? 0) > 0);
    const losingTrades = trades.filter((t) => (t.realizedPnL ?? 0) < 0);

    const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

    const totalPnL = trades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);
    const avgPnL = totalTrades > 0 ? totalPnL / totalTrades : 0;

    const totalWins = winningTrades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);
    const totalLosses = Math.abs(losingTrades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0));

    const profitFactor = totalLosses > 0 ? totalWins / totalLosses : totalWins > 0 ? Infinity : 0;

    const avgWin = winningTrades.length > 0 ? totalWins / winningTrades.length : 0;
    const avgLoss = losingTrades.length > 0 ? totalLosses / losingTrades.length : 0;

    const longTrades = trades.filter((t) => t.direction === 'LONG');
    const shortTrades = trades.filter((t) => t.direction === 'SHORT');

    const longWinRate =
      longTrades.length > 0
        ? (longTrades.filter((t) => (t.realizedPnL ?? 0) > 0).length / longTrades.length) * 100
        : 0;

    const shortWinRate =
      shortTrades.length > 0
        ? (shortTrades.filter((t) => (t.realizedPnL ?? 0) > 0).length / shortTrades.length) * 100
        : 0;

    const longPnL = longTrades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);
    const shortPnL = shortTrades.reduce((sum, t) => sum + (t.realizedPnL ?? 0), 0);

    const sortedByPnL = [...trades].sort((a, b) => (b.realizedPnL ?? 0) - (a.realizedPnL ?? 0));
    const bestTrade = sortedByPnL[0] ?? null;
    const worstTrade = sortedByPnL[sortedByPnL.length - 1] ?? null;

    const monthlyMap = new Map<string, { pnl: number; count: number; wins: number }>();

    for (const trade of trades) {
      if (!trade.exitDate) continue;
      const monthKey = `${trade.exitDate.getFullYear()}-${String(trade.exitDate.getMonth() + 1).padStart(2, '0')}`;
      const existing = monthlyMap.get(monthKey) ?? { pnl: 0, count: 0, wins: 0 };
      monthlyMap.set(monthKey, {
        pnl: existing.pnl + (trade.realizedPnL ?? 0),
        count: existing.count + 1,
        wins: existing.wins + ((trade.realizedPnL ?? 0) > 0 ? 1 : 0),
      });
    }

    const monthlyBreakdown = Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        pnl: data.pnl,
        count: data.count,
        winRate: (data.wins / data.count) * 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));

    res.json({
      totalTrades,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate,
      totalPnL,
      avgPnL,
      profitFactor,
      avgWin,
      avgLoss,
      breakdown: {
        long: {
          count: longTrades.length,
          winRate: longWinRate,
          pnl: longPnL,
        },
        short: {
          count: shortTrades.length,
          winRate: shortWinRate,
          pnl: shortPnL,
        },
      },
      bestTrade: bestTrade
        ? {
            id: bestTrade.id,
            asset: bestTrade.asset.symbol,
            pnl: bestTrade.realizedPnL,
            pnlPct: bestTrade.realizedPnLPct,
            date: bestTrade.exitDate,
          }
        : null,
      worstTrade: worstTrade
        ? {
            id: worstTrade.id,
            asset: worstTrade.asset.symbol,
            pnl: worstTrade.realizedPnL,
            pnlPct: worstTrade.realizedPnLPct,
            date: worstTrade.exitDate,
          }
        : null,
      monthlyBreakdown,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const trade = await prisma.trade.findUnique({
      where: { id: req.params.id },
      include: {
        asset: true,
      },
    });

    if (!trade || trade.userId !== req.userId) {
      throw new AppError('Trade not found', 404);
    }

    res.json(trade);
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const data = createTradeSchema.parse(req.body);

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    const positionSizeUsd = data.entryPrice * data.quantity;
    let status: TradeStatus = TradeStatus.OPEN;
    let realizedPnL: number | null = null;
    let realizedPnLPct: number | null = null;

    if (data.exitPrice) {
      status = TradeStatus.CLOSED;
      const pnlResult = calculateTradePnL(
        data.direction,
        data.entryPrice,
        data.exitPrice,
        data.quantity
      );
      realizedPnL = pnlResult.pnl;
      realizedPnLPct = pnlResult.pnlPct;
    }

    const trade = await prisma.trade.create({
      data: {
        userId: req.userId!,
        assetId: data.assetId,
        direction: data.direction,
        entryPrice: data.entryPrice,
        exitPrice: data.exitPrice,
        quantity: data.quantity,
        positionSizeUsd,
        entryDate: data.entryDate,
        exitDate: data.exitDate,
        status,
        realizedPnL,
        realizedPnLPct,
        notes: data.notes,
        tags: data.tags ? JSON.stringify(data.tags) : null,
      },
      include: {
        asset: true,
      },
    });

    res.status(201).json(trade);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = updateTradeSchema.parse(req.body);

    const existing = await prisma.trade.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      throw new AppError('Trade not found', 404);
    }

    const direction = data.direction ?? existing.direction;
    const entryPrice = data.entryPrice ?? existing.entryPrice;
    const exitPrice = data.exitPrice ?? existing.exitPrice;
    const quantity = data.quantity ?? existing.quantity;

    let realizedPnL = existing.realizedPnL;
    let realizedPnLPct = existing.realizedPnLPct;
    let status = existing.status;

    if (exitPrice && (data.entryPrice || data.exitPrice || data.quantity || data.direction)) {
      status = TradeStatus.CLOSED;
      const pnlResult = calculateTradePnL(
        direction as TradeDirection,
        entryPrice,
        exitPrice,
        quantity
      );
      realizedPnL = pnlResult.pnl;
      realizedPnLPct = pnlResult.pnlPct;
    }

    const positionSizeUsd = entryPrice * quantity;

    const trade = await prisma.trade.update({
      where: { id: req.params.id },
      data: {
        ...data,
        positionSizeUsd,
        status,
        realizedPnL,
        realizedPnLPct,
        tags: data.tags ? JSON.stringify(data.tags) : undefined,
      },
      include: {
        asset: true,
      },
    });

    res.json(trade);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/close', async (req, res, next) => {
  try {
    const data = closeTradeSchema.parse(req.body);

    const existing = await prisma.trade.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (!existing) {
      throw new AppError('Trade not found', 404);
    }

    if (existing.status === TradeStatus.CLOSED) {
      throw new AppError('Trade is already closed', 400);
    }

    const pnlResult = calculateTradePnL(
      existing.direction as TradeDirection,
      existing.entryPrice,
      data.exitPrice,
      existing.quantity
    );

    const trade = await prisma.trade.update({
      where: { id: req.params.id },
      data: {
        exitPrice: data.exitPrice,
        exitDate: data.exitDate ?? new Date(),
        status: TradeStatus.CLOSED,
        realizedPnL: pnlResult.pnl,
        realizedPnLPct: pnlResult.pnlPct,
        notes: data.notes ?? existing.notes,
      },
      include: {
        asset: true,
      },
    });

    res.json(trade);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const result = await prisma.trade.deleteMany({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
    });

    if (result.count === 0) {
      throw new AppError('Trade not found', 404);
    }

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

const bulkImportTradeSchema = z.object({
  asset: z.object({
    coingeckoId: z.string().nullable(),
    symbol: z.string().min(1),
    name: z.string().min(1),
    category: z.enum(ASSET_CATEGORIES),
  }),
  direction: z.enum(TRADE_DIRECTIONS),
  entryPrice: z.number().positive(),
  exitPrice: z.number().positive().optional().nullable(),
  quantity: z.number().positive(),
  entryDate: z.string(),
  exitDate: z.string().optional().nullable(),
  status: z.enum(TRADE_STATUSES).optional(),
  notes: z.string().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
});

router.post('/bulk-import', async (req, res, next) => {
  try {
    const trades = z.array(bulkImportTradeSchema).parse(req.body);
    const results: { success: boolean; symbol: string; error?: string }[] = [];

    for (const tradeData of trades) {
      try {
        let asset = await prisma.asset.findFirst({
          where: tradeData.asset.coingeckoId
            ? { coingeckoId: tradeData.asset.coingeckoId }
            : { symbol: tradeData.asset.symbol.toUpperCase() },
        });

        if (!asset) {
          asset = await prisma.asset.create({
            data: {
              coingeckoId: tradeData.asset.coingeckoId,
              symbol: tradeData.asset.symbol.toUpperCase(),
              name: tradeData.asset.name,
              category: tradeData.asset.category,
              currentPriceUsd: 0,
            },
          });
        }

        const entryDate = new Date(tradeData.entryDate);
        const exitDate = tradeData.exitDate ? new Date(tradeData.exitDate) : null;
        const positionSizeUsd = tradeData.entryPrice * tradeData.quantity;

        let status: 'OPEN' | 'CLOSED' =
          tradeData.status || (tradeData.exitPrice ? 'CLOSED' : 'OPEN');
        let realizedPnL: number | null = null;
        let realizedPnLPct: number | null = null;

        if (tradeData.exitPrice && status === TradeStatus.CLOSED) {
          const pnlResult = calculateTradePnL(
            tradeData.direction,
            tradeData.entryPrice,
            tradeData.exitPrice,
            tradeData.quantity
          );
          realizedPnL = pnlResult.pnl;
          realizedPnLPct = pnlResult.pnlPct;
        }

        await prisma.trade.create({
          data: {
            userId: req.userId!,
            assetId: asset.id,
            direction: tradeData.direction,
            entryPrice: tradeData.entryPrice,
            exitPrice: tradeData.exitPrice ?? null,
            quantity: tradeData.quantity,
            positionSizeUsd,
            entryDate,
            exitDate,
            status,
            realizedPnL,
            realizedPnLPct,
            notes: tradeData.notes ?? null,
            tags: tradeData.tags ? JSON.stringify(tradeData.tags) : null,
          },
        });

        results.push({ success: true, symbol: tradeData.asset.symbol });
      } catch (err) {
        results.push({
          success: false,
          symbol: tradeData.asset.symbol,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    res.json({ results });
  } catch (error) {
    next(error);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    const userId = req.userId!;

    const result = await prisma.trade.deleteMany({
      where: { userId },
    });

    res.json({ count: result.count });
  } catch (error) {
    next(error);
  }
});

export default router;
