import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidTimeZone, resolvePreference } from '../lib/snapshotSchedule.js';
import { socketService } from '../services/socketService.js';

const router = Router();

const MAX_PERP_EXPOSURE_USD = 1_000_000_000_000;
const DEFAULT_REDUCE_PERCENTAGES = [25, 50, 75, 100];
const groupOrderScope = z.enum([
  'crypto:storage',
  'cash:storage',
  'custody:storage',
  'equities:broker',
  'equities:equityType',
]);
const groupOrder = z
  .object({
    scope: groupOrderScope,
    order: z
      .array(z.string().min(1).max(2048))
      .min(1)
      .max(256)
      .refine((order) => new Set(order).size === order.length, 'Groups must be unique'),
  })
  .strict();
const groupOrderImport = z
  .object({
    orders: z
      .array(groupOrder)
      .min(1)
      .max(groupOrderScope.options.length)
      .refine(
        (orders) => new Set(orders.map(({ scope }) => scope)).size === orders.length,
        'Scopes must be unique'
      ),
  })
  .strict();
const reducePercentagesSchema = z
  .array(z.number().int().min(1).max(100))
  .length(4)
  .refine((values) => new Set(values).size === 4, 'Percentages must be different');

const PREFERENCE_SELECT = {
  snapshotHour: true,
  snapshotTimezone: true,
  perpExposureUsd: true,
  reducePercentages: true,
} as const;

type PreferenceRow = {
  snapshotHour: number;
  snapshotTimezone: string;
  perpExposureUsd: number | null;
  reducePercentages?: number[];
};

const updatePreferencesSchema = z
  .object({
    snapshotHour: z.number().int().min(0).max(23).optional(),
    snapshotTimezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone (e.g. Asia/Singapore)' })
      .optional(),
    perpExposureUsd: z.number().finite().min(0).max(MAX_PERP_EXPOSURE_USD).optional(),
    reducePercentages: reducePercentagesSchema.optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.snapshotHour !== undefined ||
      data.snapshotTimezone !== undefined ||
      data.perpExposureUsd !== undefined ||
      data.reducePercentages !== undefined,
    { message: 'Provide at least one preference' }
  );

/** Shape the stored row defensively so a hand-edited bad value never reaches the UI raw. */
function toPreferencesResponse(row: PreferenceRow | null) {
  const { hour, timeZone } = resolvePreference(row);
  const storedPerpExposure = row?.perpExposureUsd;
  const perpExposureUsd =
    typeof storedPerpExposure === 'number' &&
    Number.isFinite(storedPerpExposure) &&
    storedPerpExposure >= 0 &&
    storedPerpExposure <= MAX_PERP_EXPOSURE_USD
      ? storedPerpExposure
      : null;
  const parsedPercentages = reducePercentagesSchema.safeParse(row?.reducePercentages);
  return {
    snapshotHour: hour,
    snapshotTimezone: timeZone,
    perpExposureUsd,
    reducePercentages: parsedPercentages.success
      ? parsedPercentages.data
      : DEFAULT_REDUCE_PERCENTAGES,
  };
}

// GET /api/v1/users/me/preferences - the caller's own app preferences
router.get('/me/preferences', async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: PREFERENCE_SELECT,
    });
    if (!user) throw new AppError('User not found', 404);
    res.json(toPreferencesResponse(user));
  } catch (error) {
    next(error);
  }
});

// PATCH /api/v1/users/me/preferences - update one or more caller-owned preferences
router.patch('/me/preferences', async (req, res, next) => {
  try {
    const data = updatePreferencesSchema.parse(req.body);
    // Filter by the caller's own id only — preferences are never editable cross-user.
    const user = await prisma.user.update({
      where: { id: req.userId! },
      data,
      select: PREFERENCE_SELECT,
    });
    res.json(toPreferencesResponse(user));
  } catch (error) {
    next(error);
  }
});

router.get('/me/preferences/portfolio-group-orders', async (req, res, next) => {
  try {
    const rows = await prisma.portfolioGroupOrder.findMany({
      where: { userId: req.userId! },
      select: { scope: true, order: true },
    });
    res.json(Object.fromEntries(rows.map(({ scope, order }) => [scope, order])));
  } catch (error) {
    next(error);
  }
});

router.patch('/me/preferences/portfolio-group-orders', async (req, res, next) => {
  try {
    const { scope, order } = groupOrder.parse(req.body);
    const userId = req.userId!;
    const saved = await prisma.portfolioGroupOrder.upsert({
      where: { userId_scope: { userId, scope } },
      create: { userId, scope, order },
      update: { order },
      select: { order: true },
    });
    socketService.broadcastPortfolioGroupOrdersUpdate(userId);
    res.json(saved);
  } catch (error) {
    next(error);
  }
});

// The first device to import a scope wins. Later imports never replace a saved order.
router.post('/me/preferences/portfolio-group-orders', async (req, res, next) => {
  try {
    const { orders } = groupOrderImport.parse(req.body);
    const userId = req.userId!;
    const { count } = await prisma.portfolioGroupOrder.createMany({
      data: orders.map(({ scope, order }) => ({ userId, scope, order })),
      skipDuplicates: true,
    });
    if (count) socketService.broadcastPortfolioGroupOrdersUpdate(userId);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

export default router;
