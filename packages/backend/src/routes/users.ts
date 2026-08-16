import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isValidTimeZone, resolvePreference } from '../lib/snapshotSchedule.js';

const router = Router();

const PREFERENCE_SELECT = { snapshotHour: true, snapshotTimezone: true } as const;

const updatePreferencesSchema = z
  .object({
    snapshotHour: z.number().int().min(0).max(23).optional(),
    snapshotTimezone: z
      .string()
      .min(1)
      .max(64)
      .refine(isValidTimeZone, { message: 'Must be a valid IANA timezone (e.g. Asia/Singapore)' })
      .optional(),
  })
  .strict()
  .refine((data) => data.snapshotHour !== undefined || data.snapshotTimezone !== undefined, {
    message: 'Provide snapshotHour and/or snapshotTimezone',
  });

/** Shape the stored row defensively so a hand-edited bad value never reaches the UI raw. */
function toPreferencesResponse(row: { snapshotHour: number; snapshotTimezone: string } | null) {
  const { hour, timeZone } = resolvePreference(row);
  return { snapshotHour: hour, snapshotTimezone: timeZone };
}

// GET /api/v1/users/me/preferences - the caller's own snapshot preferences
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

// PATCH /api/v1/users/me/preferences - update snapshot hour and/or timezone
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
