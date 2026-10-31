import type { UserPreferences } from '@/lib/types';
import {
  DEFAULT_SNAPSHOT_HOUR,
  DEFAULT_SNAPSHOT_TIMEZONE,
  isKnownTimeZone,
} from '@/lib/snapshotPreferences';

/** The local hour (0-23) and IANA timezone of a person's automatic daily snapshot. */
export interface SnapshotSchedule {
  hour: number;
  timeZone: string;
}

export const DEFAULT_SNAPSHOT_SCHEDULE: SnapshotSchedule = {
  hour: DEFAULT_SNAPSHOT_HOUR,
  timeZone: DEFAULT_SNAPSHOT_TIMEZONE,
};

// The backend scheduler checks each local day in 15-minute steps.
const SCAN_STEP_MS = 15 * 60 * 1000;
// A local day lasts at most 25 hours, so this many steps always reaches its edge.
const MAX_DAY_STEPS = (26 * 60 * 60 * 1000) / SCAN_STEP_MS;

interface LocalTime {
  year: number;
  month: number;
  day: number;
  hour: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function getLocalTime(instant: number, timeZone: string): LocalTime {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
    });
    formatterCache.set(timeZone, formatter);
  }
  const parts = formatter.formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: read('year'), month: read('month'), day: read('day'), hour: read('hour') };
}

function isSameDate(left: LocalTime, right: LocalTime): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/**
 * The person's saved schedule, or 5am Singapore while preferences load or fail.
 * As in the backend's resolvePreference, an invalid hour or a timezone this
 * browser cannot format falls back on its own.
 */
export function resolveSnapshotSchedule(
  preferences: Pick<UserPreferences, 'snapshotHour' | 'snapshotTimezone'> | undefined
): SnapshotSchedule {
  const hour = preferences?.snapshotHour;
  const timeZone = preferences?.snapshotTimezone;
  return {
    hour:
      typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23
        ? hour
        : DEFAULT_SNAPSHOT_HOUR,
    timeZone:
      typeof timeZone === 'string' && isKnownTimeZone(timeZone)
        ? timeZone
        : DEFAULT_SNAPSHOT_TIMEZONE,
  };
}

/** True when both instants fall on the same calendar day in `timeZone`. */
export function isSameLocalDay(left: Date, right: Date, timeZone: string): boolean {
  return isSameDate(
    getLocalTime(left.getTime(), timeZone),
    getLocalTime(right.getTime(), timeZone)
  );
}

/**
 * Today's snapshot instant, found the way the backend's `scheduledSnapshotAt`
 * (packages/backend/src/lib/snapshotSchedule.ts) finds it: the first 15-minute
 * step of the local day whose hour is at least the chosen hour. So a DST jump
 * that skips the hour moves the snapshot to the first valid instant after the
 * jump, and a repeated hour uses its first occurrence. A day that never reaches
 * the hour uses its start, as the backend does.
 */
function scheduledSnapshotTime(now: Date, { hour, timeZone }: SnapshotSchedule): number {
  const today = getLocalTime(now.getTime(), timeZone);
  const isToday = (instant: number) => isSameDate(getLocalTime(instant, timeZone), today);

  // Step back to the first 15-minute step of today. Zone offsets are whole quarter
  // hours, so these steps line up with the ones the backend takes from local midnight.
  let dayStart = Math.floor(now.getTime() / SCAN_STEP_MS) * SCAN_STEP_MS;
  for (let step = 0; step < MAX_DAY_STEPS && isToday(dayStart - SCAN_STEP_MS); step += 1) {
    dayStart -= SCAN_STEP_MS;
  }

  for (let step = 0; step < MAX_DAY_STEPS; step += 1) {
    const instant = dayStart + step * SCAN_STEP_MS;
    const local = getLocalTime(instant, timeZone);
    if (!isSameDate(local, today)) break;
    if (local.hour >= hour) return instant;
  }
  return dayStart;
}

/** True while today's automatic snapshot is still ahead in the person's timezone. */
export function isBeforeDailySnapshotTime(now: Date, schedule: SnapshotSchedule): boolean {
  return now.getTime() < scheduledSnapshotTime(now, schedule);
}
