import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidTimeZone, resolvePreference } from '../lib/snapshotSchedule.js';

const router = Router();

const MAX_PERP_EXPOSURE_USD = 1_000_000_000_000;

const PREFERENCE_SELECT = {
  snapshotHour: true,
  snapshotTimezone: true,
  perpExposureUsd: true,
} as const;

type PreferenceRow = {
  snapshotHour: number;
  snapshotTimezone: string;
  perpExposureUsd: number | null;
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
  })
  .strict()
  .refine(
    (data) =>
      data.snapshotHour !== undefined ||
      data.snapshotTimezone !== undefined ||
      data.perpExposureUsd !== undefined,
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
  return { snapshotHour: hour, snapshotTimezone: timeZone, perpExposureUsd };
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

export default router;
