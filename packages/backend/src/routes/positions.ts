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
  StorageType,
  categoryGroup,
  CATEGORIES_IN_GROUP,
  CategoryGroup,
} from '../lib/constants.js';
import { applyPositionDelta, calculatePositionValue } from '../lib/domain.js';

const router = Router();

const createPositionSchema = z.object({
  assetId: z.string().min(1),
  quantity: z.number().positive(),
  avgCostUsd: z.number().min(0).default(0),
  storageType: z.enum(STORAGE_TYPES).default(StorageType.WALLET),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
  custodyOf: z.string().nullable().optional(),
  fundingCashPositionId: z.string().min(1).nullable().optional(),
});

const positionDeltaSchema = z.object({
  mode: z.enum(['add', 'reduce']),
  quantity: z.number().positive(),
  totalCostUsd: z.number().min(0).optional(),
});

const updatePositionSchema = createPositionSchema.partial().extend({
  positionDelta: positionDeltaSchema.optional(),
});

const FLOAT_TOLERANCE = 1e-6;

interface FundingCashPosition {
  id: string;
  assetId: string;
  quantity: number;
  avgCostUsd: number;
  asset: {
    category: string;
    currentPriceUsd: number | null;
  };
}

interface FundingCashDelta {
  quantityToReduce: number;
  result: ReturnType<typeof applyPositionDelta>;
}

function numbersClose(a: number, b: number) {
  return Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
}

function buildFundingCashDelta(
  fundingCashPosition: FundingCashPosition,
  purchaseCostUsd: number
): FundingCashDelta {
  if (categoryGroup(fundingCashPosition.asset.category) !== CategoryGroup.STABLES) {
    throw new AppError('Funding position must be a cash position', 400);
  }

  const fundingPriceUsd =
    fundingCashPosition.asset.currentPriceUsd ?? fundingCashPosition.avgCostUsd;

  if (!(purchaseCostUsd > 0)) {
    throw new AppError('Funding cash source requires a positive position cost', 400);
  }

  if (!(fundingPriceUsd > 0)) {
    throw new AppError('Funding cash position needs a usable USD price', 400);
  }

  try {
    const quantityToReduce = purchaseCostUsd / fundingPriceUsd;
    const result = applyPositionDelta({
      currentQuantity: fundingCashPosition.quantity,
      currentAvgCostUsd: fundingCashPosition.avgCostUsd,
      deltaQuantity: quantityToReduce,
      mode: 'reduce',
    });
    return { quantityToReduce, result };
  } catch (error) {
    throw new AppError(
      error instanceof Error ? error.message : 'Funding cash position cannot cover cost',
      400
    );
  }
}

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
    // Optional provider wiring — honored only when creating a new Asset row.
    // Lets a copy/paste round-trip of equities and unit trusts preserve the
    // price feed (Yahoo / manual NAV) for tickers not yet in the DB.
    priceProvider: z.enum(['coingecko', 'yahoo', 'manual']).nullable().optional(),
    providerAssetId: z.string().nullable().optional(),
    nativeCurrency: z.string().nullable().optional(),
    exchange: z.string().nullable().optional(),
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
          // Default priceProvider by category when not supplied: equities → yahoo,
          // unit trusts → manual (NAV-driven), everything else → coingecko.
          const defaultProvider =
            pos.asset.category === 'EQUITY'
              ? 'yahoo'
              : pos.asset.category === 'UNIT_TRUST'
                ? 'manual'
                : 'coingecko';
          asset = await prisma.asset.create({
            data: {
              coingeckoId: pos.asset.coingeckoId || null,
              symbol: pos.asset.symbol.toUpperCase(),
              name: pos.asset.name,
              category: pos.asset.category,
              currentPriceUsd: null,
              priceProvider: pos.asset.priceProvider || defaultProvider,
              providerAssetId: pos.asset.providerAssetId || null,
              nativeCurrency: pos.asset.nativeCurrency || 'USD',
              exchange: pos.asset.exchange || null,
            },
          });
          assetMap.set(asset.symbol.toUpperCase(), asset);
          if (asset.coingeckoId) {
            coingeckoMap.set(asset.coingeckoId, asset);
          }
        }

        const valueFields = calculatePositionValue({
          quantity: pos.quantity,
          avgCostUsd: pos.avgCostUsd,
          currentPriceUsd: asset.currentPriceUsd,
        });

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
            ...valueFields,
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

router.get('/:id/history', async (req, res, next) => {
  try {
    const position = await prisma.position.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId!,
      },
      select: { id: true },
    });

    if (!position) {
      throw new AppError('Position not found', 404);
    }

    const history = await prisma.positionHistory.findMany({
      where: {
        positionId: req.params.id,
        userId: req.userId!,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(history);
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
    const fundingCashPositionId = data.fundingCashPositionId?.trim() || null;

    // Verify asset exists
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
    });

    if (!asset) {
      throw new AppError('Asset not found', 404);
    }

    const group = categoryGroup(asset.category);
    const categoryPositions = await prisma.position.findMany({
      where: {
        userId: req.userId!,
        custodyOf: null,
        asset: { category: { in: CATEGORIES_IN_GROUP[group] } },
      },
    });

    if (categoryPositions.length >= MAX_POSITIONS_PER_CATEGORY) {
      const groupLabel: Record<CategoryGroup, string> = {
        crypto: 'crypto',
        stables: 'cash',
        equities: 'equities',
        unit_trusts: 'unit-trust',
      };
      throw new AppError(
        `Maximum ${MAX_POSITIONS_PER_CATEGORY} ${groupLabel[group]} positions allowed`,
        400
      );
    }

    const valueFields = calculatePositionValue({
      quantity: data.quantity,
      avgCostUsd: data.avgCostUsd,
      currentPriceUsd: asset.currentPriceUsd,
    });

    const storageLocation = data.storageLocation?.trim() || null;
    const custodyOf = data.custodyOf?.trim() || null;
    const purchaseCostUsd = data.quantity * data.avgCostUsd;

    const fundingCashPosition = fundingCashPositionId
      ? await prisma.position.findFirst({
          where: {
            id: fundingCashPositionId,
            userId: req.userId!,
            custodyOf: null,
          },
          include: { asset: true },
        })
      : null;

    if (fundingCashPositionId && !fundingCashPosition) {
      throw new AppError('Funding cash position not found', 404);
    }

    const fundingDelta = fundingCashPosition
      ? buildFundingCashDelta(fundingCashPosition, purchaseCostUsd)
      : null;

    const position = await prisma.$transaction(async (tx) => {
      const createdPosition = await tx.position.create({
        data: {
          userId: req.userId!,
          assetId: data.assetId,
          quantity: data.quantity,
          avgCostUsd: data.avgCostUsd,
          storageType: data.storageType,
          storageLocation,
          notes: data.notes,
          custodyOf,
          ...valueFields,
        },
        include: {
          asset: true,
        },
      });

      if (fundingCashPosition && fundingDelta) {
        const nextValueFields = calculatePositionValue({
          quantity: fundingDelta.result.nextQuantity,
          avgCostUsd: fundingDelta.result.nextAvgCostUsd,
          currentPriceUsd: fundingCashPosition.asset.currentPriceUsd,
        });

        await tx.position.update({
          where: { id: fundingCashPosition.id },
          data: {
            quantity: fundingDelta.result.nextQuantity,
            avgCostUsd: fundingDelta.result.nextAvgCostUsd,
            ...nextValueFields,
          },
        });

        await tx.positionHistory.create({
          data: {
            userId: req.userId!,
            positionId: fundingCashPosition.id,
            assetId: fundingCashPosition.assetId,
            mode: 'reduce',
            quantity: fundingDelta.quantityToReduce,
            costBasisUsd: fundingDelta.result.deltaCostUsd,
            previousQuantity: fundingCashPosition.quantity,
            previousAvgCostUsd: fundingCashPosition.avgCostUsd,
            previousTotalCostUsd: fundingDelta.result.currentTotalCostUsd,
            nextQuantity: fundingDelta.result.nextQuantity,
            nextAvgCostUsd: fundingDelta.result.nextAvgCostUsd,
            nextTotalCostUsd: fundingDelta.result.nextTotalCostUsd,
          },
        });
      }

      return createdPosition;
    });

    res.status(201).json(position);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const data = updatePositionSchema.parse(req.body);
    const {
      positionDelta,
      fundingCashPositionId: rawFundingCashPositionId,
      ...positionData
    } = data;
    const fundingCashPositionId = rawFundingCashPositionId?.trim() || null;

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

    if (fundingCashPositionId && (!positionDelta || positionDelta.mode !== 'add')) {
      throw new AppError('Funding cash source is only supported when adding to a position', 400);
    }

    if (fundingCashPositionId === existing.id) {
      throw new AppError('A position cannot fund itself', 400);
    }

    let valueAsset = existing.asset;
    if (positionData.assetId && positionData.assetId !== existing.assetId) {
      const nextAsset = await prisma.asset.findUnique({
        where: { id: positionData.assetId },
      });
      if (!nextAsset) {
        throw new AppError('Asset not found', 404);
      }
      valueAsset = nextAsset;
    }

    const quantity = positionData.quantity ?? existing.quantity;
    const avgCostUsd = positionData.avgCostUsd ?? existing.avgCostUsd;
    const valueFields = calculatePositionValue({
      quantity,
      avgCostUsd,
      currentPriceUsd: valueAsset.currentPriceUsd,
    });

    if (positionDelta) {
      if (positionData.quantity === undefined || positionData.avgCostUsd === undefined) {
        throw new AppError('Position delta updates must include quantity and average cost', 400);
      }
      if (positionDelta.mode === 'add' && positionDelta.totalCostUsd === undefined) {
        throw new AppError('Position add history requires a total cost', 400);
      }

      const previousTotalCostUsd = existing.quantity * existing.avgCostUsd;
      const deltaCostBasisUsd =
        positionDelta.mode === 'add'
          ? positionDelta.totalCostUsd!
          : positionDelta.quantity * existing.avgCostUsd;
      const multiplier = positionDelta.mode === 'add' ? 1 : -1;
      const expectedNextQuantity = existing.quantity + positionDelta.quantity * multiplier;
      const expectedNextTotalCostUsd = Math.max(
        0,
        previousTotalCostUsd + deltaCostBasisUsd * multiplier
      );
      const nextTotalCostUsd = quantity * avgCostUsd;

      if (
        expectedNextQuantity < -FLOAT_TOLERANCE ||
        !numbersClose(quantity, Math.max(0, expectedNextQuantity)) ||
        !numbersClose(nextTotalCostUsd, expectedNextTotalCostUsd)
      ) {
        throw new AppError('Position delta does not match the submitted totals', 400);
      }
    }

    const fundingCashPosition = fundingCashPositionId
      ? await prisma.position.findFirst({
          where: {
            id: fundingCashPositionId,
            userId: req.userId!,
            custodyOf: null,
          },
          include: { asset: true },
        })
      : null;

    if (fundingCashPositionId && !fundingCashPosition) {
      throw new AppError('Funding cash position not found', 404);
    }

    const fundingDelta =
      fundingCashPosition && positionDelta?.mode === 'add'
        ? buildFundingCashDelta(fundingCashPosition, positionDelta.totalCostUsd!)
        : null;

    const updateData = {
      ...positionData,
      storageLocation:
        positionData.storageLocation !== undefined
          ? positionData.storageLocation?.trim() || null
          : undefined,
      custodyOf:
        positionData.custodyOf !== undefined ? positionData.custodyOf?.trim() || null : undefined,
    };

    const position = await prisma.$transaction(async (tx) => {
      const updatedPosition = await tx.position.update({
        where: { id: req.params.id },
        data: {
          ...updateData,
          ...valueFields,
        },
        include: {
          asset: true,
        },
      });

      if (positionDelta) {
        const previousTotalCostUsd = existing.quantity * existing.avgCostUsd;
        const nextTotalCostUsd = updatedPosition.quantity * updatedPosition.avgCostUsd;
        const costBasisUsd =
          positionDelta.mode === 'add'
            ? positionDelta.totalCostUsd!
            : positionDelta.quantity * existing.avgCostUsd;

        await tx.positionHistory.create({
          data: {
            userId: req.userId!,
            positionId: existing.id,
            assetId: updatedPosition.assetId,
            mode: positionDelta.mode,
            quantity: positionDelta.quantity,
            costBasisUsd,
            previousQuantity: existing.quantity,
            previousAvgCostUsd: existing.avgCostUsd,
            previousTotalCostUsd,
            nextQuantity: updatedPosition.quantity,
            nextAvgCostUsd: updatedPosition.avgCostUsd,
            nextTotalCostUsd,
          },
        });
      }

      if (fundingCashPosition && fundingDelta) {
        const nextValueFields = calculatePositionValue({
          quantity: fundingDelta.result.nextQuantity,
          avgCostUsd: fundingDelta.result.nextAvgCostUsd,
          currentPriceUsd: fundingCashPosition.asset.currentPriceUsd,
        });

        await tx.position.update({
          where: { id: fundingCashPosition.id },
          data: {
            quantity: fundingDelta.result.nextQuantity,
            avgCostUsd: fundingDelta.result.nextAvgCostUsd,
            ...nextValueFields,
          },
        });

        await tx.positionHistory.create({
          data: {
            userId: req.userId!,
            positionId: fundingCashPosition.id,
            assetId: fundingCashPosition.assetId,
            mode: 'reduce',
            quantity: fundingDelta.quantityToReduce,
            costBasisUsd: fundingDelta.result.deltaCostUsd,
            previousQuantity: fundingCashPosition.quantity,
            previousAvgCostUsd: fundingCashPosition.avgCostUsd,
            previousTotalCostUsd: fundingDelta.result.currentTotalCostUsd,
            nextQuantity: fundingDelta.result.nextQuantity,
            nextAvgCostUsd: fundingDelta.result.nextAvgCostUsd,
            nextTotalCostUsd: fundingDelta.result.nextTotalCostUsd,
          },
        });
      }

      return updatedPosition;
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
