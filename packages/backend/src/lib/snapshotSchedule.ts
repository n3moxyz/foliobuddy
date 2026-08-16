/**
 * Per-user daily snapshot scheduling helpers.
 *
 * Every user stores a local hour (0-23) plus an IANA timezone. The scheduler
 * ticks once an hour (UTC) and snapshots each user whose local hour matches.
 * All calendar math goes through Intl so DST and non-integer offsets are
 * handled by the runtime instead of hand-rolled offset arithmetic.
 */

export const DEFAULT_SNAPSHOT_HOUR = 5;
export const DEFAULT_SNAPSHOT_TIMEZONE = 'Asia/Singapore';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Cache the supported list once; Intl.supportedValuesOf allocates a fresh array per call.
let supportedTimeZones: Set<string> | null = null;

/** True when `timeZone` is an IANA zone this runtime can format in. */
export function isValidTimeZone(timeZone: string): boolean {
  if (!supportedTimeZones) {
    supportedTimeZones = new Set(Intl.supportedValuesOf('timeZone'));
  }
  if (supportedTimeZones.has(timeZone)) return true;
  // Some aliases (e.g. "UTC", legacy links) are formattable but absent from
  // supportedValuesOf. Accept anything the formatter accepts.
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidSnapshotHour(hour: unknown): hour is number {
  return typeof hour === 'number' && Number.isInteger(hour) && hour >= 0 && hour <= 23;
}

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  weekday: number; // 0 = Sunday
}

const partsFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getPartsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = partsFormatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      weekday: 'short',
    });
    partsFormatterCache.set(timeZone, formatter);
  }
  return formatter;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Wall-clock parts of `instant` as seen in `timeZone`. */
export function getLocalParts(instant: Date, timeZone: string): LocalParts {
  const parts = getPartsFormatter(timeZone).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: Number(read('hour')),
    weekday: WEEKDAYS.indexOf(read('weekday')),
  };
}

/**
 * UTC instant of local midnight for the local calendar day containing `instant`.
 * Iterates once to absorb the zone's offset (DST-safe: uses the offset that
 * actually applies at that midnight, not at `instant`).
 */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const local = getLocalParts(instant, timeZone);
  // First guess: treat local Y-M-D as UTC, then correct by the observed offset.
  const guess = Date.UTC(local.year, local.month - 1, local.day);
  const guessLocal = getLocalParts(new Date(guess), timeZone);
  const guessAsUtc = Date.UTC(
    guessLocal.year,
    guessLocal.month - 1,
    guessLocal.day,
    guessLocal.hour
  );
  const offsetMs = guessAsUtc - guess;
  return new Date(guess - offsetMs);
}

/** UTC bounds [start, end) of the local calendar day containing `instant`. */
export function localDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const start = startOfLocalDay(instant, timeZone);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

/** UTC instant when the user's snapshot is scheduled on the local day containing `instant`. */
export function scheduledSnapshotAt(instant: Date, timeZone: string, hour: number): Date {
  return new Date(startOfLocalDay(instant, timeZone).getTime() + hour * HOUR_MS);
}

export interface SnapshotUserPreference {
  snapshotHour: number;
  snapshotTimezone: string;
}

/**
 * Resolve a stored preference defensively: a bad timezone or hour (e.g. a
 * manually edited row) falls back to the defaults instead of throwing inside
 * the scheduler loop and starving other users.
 */
export function resolvePreference(pref: Partial<SnapshotUserPreference> | null | undefined): {
  hour: number;
  timeZone: string;
} {
  const hour = isValidSnapshotHour(pref?.snapshotHour) ? pref.snapshotHour : DEFAULT_SNAPSHOT_HOUR;
  const timeZone =
    typeof pref?.snapshotTimezone === 'string' && isValidTimeZone(pref.snapshotTimezone)
      ? pref.snapshotTimezone
      : DEFAULT_SNAPSHOT_TIMEZONE;
  return { hour, timeZone };
}

/** True when the user's local wall-clock hour at `instant` equals their snapshot hour. */
export function isSnapshotHourNow(
  instant: Date,
  pref: Partial<SnapshotUserPreference> | null | undefined
): boolean {
  const { hour, timeZone } = resolvePreference(pref);
  return getLocalParts(instant, timeZone).hour === hour;
}
