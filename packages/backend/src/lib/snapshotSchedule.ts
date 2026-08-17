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
const DAY_SCAN_STEP_MS = 15 * 60 * 1000;

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
      minute: 'numeric',
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
 * UTC instant when the local calendar day containing `instant` begins.
 *
 * Usually that is wall-clock 00:00, found by iterating until the requested
 * midnight is stable (some zones change offset between UTC midnight and local
 * midnight, so one correction can land at 23:00 on the previous local date).
 * But on a spring-forward day where the jump happens AT midnight (e.g.
 * America/Santiago: 23:59 -> 01:00), wall-clock 00:00 does not exist. In that
 * case the loop can never converge, so fall back to the first instant whose
 * local date is the target date — the true start of that (23-hour) day.
 */
export function startOfLocalDay(instant: Date, timeZone: string): Date {
  const local = getLocalParts(instant, timeZone);
  const targetAsUtc = Date.UTC(local.year, local.month - 1, local.day);
  let candidate = targetAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const candidateDate = new Date(candidate);
    const candidateLocal = getLocalParts(candidateDate, timeZone);
    const minute = Number(
      getPartsFormatter(timeZone)
        .formatToParts(candidateDate)
        .find((part) => part.type === 'minute')?.value ?? 0
    );
    const candidateAsUtc = Date.UTC(
      candidateLocal.year,
      candidateLocal.month - 1,
      candidateLocal.day,
      candidateLocal.hour,
      minute
    );
    const correction = targetAsUtc - candidateAsUtc;
    if (correction === 0) return candidateDate;
    candidate += correction;
  }

  // Wall-clock midnight does not exist today (transition at 00:00). Walk forward
  // from the last candidate (which sits on the previous local date) to the first
  // instant that reads as the target date.
  const isTargetDate = (d: Date) => {
    const p = getLocalParts(d, timeZone);
    return p.year === local.year && p.month === local.month && p.day === local.day;
  };
  let probe = candidate;
  for (let i = 0; i < 24 * 4; i += 1) {
    if (isTargetDate(new Date(probe))) {
      // Back off to the earliest 15-minute boundary that is still the target date.
      let earliest = probe;
      while (isTargetDate(new Date(earliest - DAY_SCAN_STEP_MS))) earliest -= DAY_SCAN_STEP_MS;
      return new Date(earliest);
    }
    probe += DAY_SCAN_STEP_MS;
  }
  return new Date(candidate);
}

/** UTC bounds [start, end) of the local calendar day containing `instant`. */
export function localDayBounds(instant: Date, timeZone: string): { start: Date; end: Date } {
  const start = startOfLocalDay(instant, timeZone);
  // Moving well into the following local day and resolving its midnight avoids
  // assuming a local day is always 24 elapsed hours (DST days are 23 or 25).
  const end = startOfLocalDay(new Date(start.getTime() + 36 * HOUR_MS), timeZone);
  return { start, end };
}

/** UTC instant when the user's snapshot is scheduled on the local day containing `instant`. */
export function scheduledSnapshotAt(instant: Date, timeZone: string, hour: number): Date {
  const { start, end } = localDayBounds(instant, timeZone);
  const localDate = getLocalParts(instant, timeZone);

  // Search the actual local day so a skipped hour runs at the first valid
  // instant after the jump and a repeated hour chooses its first occurrence.
  for (let time = start.getTime(); time < end.getTime(); time += DAY_SCAN_STEP_MS) {
    const candidate = new Date(time);
    const local = getLocalParts(candidate, timeZone);
    const sameDate =
      local.year === localDate.year &&
      local.month === localDate.month &&
      local.day === localDate.day;
    if (sameDate && local.hour >= hour) return candidate;
  }

  // Every valid local day has an instant at or after hour 0; this is defensive
  // for unusual historical timezone transitions outside the scheduler's scope.
  return start;
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

/** True during the hourly scheduler window that contains the user's local schedule. */
export function isSnapshotHourNow(
  instant: Date,
  pref: Partial<SnapshotUserPreference> | null | undefined
): boolean {
  const { hour, timeZone } = resolvePreference(pref);
  const scheduled = scheduledSnapshotAt(instant, timeZone, hour).getTime();
  const now = instant.getTime();
  return now >= scheduled && now < scheduled + HOUR_MS;
}
