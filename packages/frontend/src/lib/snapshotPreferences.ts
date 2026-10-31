/** Pure helpers for the Settings "Daily snapshot" section. */

import { formatTime } from './utils';

export const DEFAULT_SNAPSHOT_HOUR = 5;
export const DEFAULT_SNAPSHOT_TIMEZONE = 'Asia/Singapore';

/** A whole hour on the style guide's 12-hour clock: 5 → "5:00am", 0 → "12:00am". */
export function formatHourLabel(hour: number): string {
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00${hour < 12 ? 'am' : 'pm'}`;
}

/** 0..23 as select options with 12-hour labels. */
export const SNAPSHOT_HOUR_OPTIONS: ReadonlyArray<{ value: number; label: string }> = Array.from(
  { length: 24 },
  (_, hour) => ({ value: hour, label: formatHourLabel(hour) })
);

export interface TimeZoneGroup {
  region: string;
  zones: string[];
}

/**
 * IANA zones grouped by leading region (Asia, Europe, America, …) so a 400+ item
 * list stays scannable. `UTC` is pinned first. Falls back to a small curated
 * list if the runtime lacks Intl.supportedValuesOf (very old browsers).
 */
export function getTimeZoneGroups(): TimeZoneGroup[] {
  let zones: string[];
  try {
    // ES2023 API; the frontend tsconfig lib predates it, so read it structurally.
    const supported = (Intl as { supportedValuesOf?: (key: 'timeZone') => string[] })
      .supportedValuesOf;
    if (!supported) throw new Error('unsupported');
    zones = supported('timeZone');
  } catch {
    zones = [
      'Asia/Singapore',
      'Asia/Tokyo',
      'Asia/Hong_Kong',
      'Europe/London',
      'America/New_York',
      'America/Los_Angeles',
      'Australia/Sydney',
    ];
  }

  const groups = new Map<string, string[]>();
  for (const zone of zones) {
    if (zone === 'UTC') continue;
    const slash = zone.indexOf('/');
    const region = slash === -1 ? 'Other' : zone.slice(0, slash);
    const bucket = groups.get(region) ?? [];
    bucket.push(zone);
    groups.set(region, bucket);
  }

  const ordered = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([region, list]) => ({ region, zones: list.sort() }));

  return [{ region: 'UTC', zones: ['UTC'] }, ...ordered];
}

/** True when the runtime can format in this zone (mirrors the backend check). */
export function isKnownTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/** The browser's own timezone, or the app default when unavailable. */
export function detectBrowserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isKnownTimeZone(zone) ? zone : DEFAULT_SNAPSHOT_TIMEZONE;
  } catch {
    return DEFAULT_SNAPSHOT_TIMEZONE;
  }
}

/** "Asia/Singapore" → "Singapore"; "America/New_York" → "New York". */
export function formatTimeZoneLabel(zone: string): string {
  const city = zone.slice(zone.lastIndexOf('/') + 1);
  return city.replace(/_/g, ' ');
}

/** A person's daily snapshot time: "5:00am Singapore time", or "5:00am UTC". */
export function describeSnapshotTime(hour: number, zone: string): string {
  return zone === 'UTC'
    ? `${formatHourLabel(hour)} UTC`
    : `${formatHourLabel(hour)} ${formatTimeZoneLabel(zone)} time`;
}

/** Short UTC offset ("UTC+8", "UTC−4") for a zone at `at`, or '' if unavailable. */
export function formatUtcOffset(zone: string, at: Date = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(at)
      .find((p) => p.type === 'timeZoneName')?.value;
    if (!part) return '';
    // "GMT+8" / "GMT-4" / "GMT" → "UTC+8" / "UTC−4" / "UTC"
    return part.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return '';
  }
}

/**
 * Describe the next scheduled snapshot in the *viewer's* local time, e.g.
 * "Next snapshot: today at 5:00am Singapore time · 9:00pm your time".
 * Returns null when the zone can't be formatted.
 */
export function describeNextSnapshot(
  hour: number,
  zone: string,
  now: Date = new Date()
): { local: string; viewer: string; isToday: boolean } | null {
  if (!isKnownTimeZone(zone)) return null;

  // Find the wall-clock hour in `zone` right now to decide today vs tomorrow.
  const zoneHourNow = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' })
      .formatToParts(now)
      .find((p) => p.type === 'hour')?.value ?? NaN
  );
  if (Number.isNaN(zoneHourNow)) return null;
  const isToday = hour > zoneHourNow;

  // Build the instant of that snapshot by walking from `now` in whole hours until the
  // zone's wall-clock hour matches — avoids hand-rolled offset math and stays DST-safe.
  let candidate = new Date(now.getTime());
  candidate.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    const h = Number(
      new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', hourCycle: 'h23' })
        .formatToParts(candidate)
        .find((p) => p.type === 'hour')?.value ?? NaN
    );
    if (h === hour && candidate.getTime() > now.getTime()) break;
    candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  }

  return { local: formatHourLabel(hour), viewer: formatTime(candidate), isToday };
}
