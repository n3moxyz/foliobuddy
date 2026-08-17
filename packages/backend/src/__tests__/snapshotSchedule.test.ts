import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_HOUR,
  DEFAULT_SNAPSHOT_TIMEZONE,
  getLocalParts,
  isSnapshotHourNow,
  isValidSnapshotHour,
  isValidTimeZone,
  localDayBounds,
  resolvePreference,
  scheduledSnapshotAt,
  startOfLocalDay,
} from '../lib/snapshotSchedule.js';

const SGT = 'Asia/Singapore';
const NY = 'America/New_York';

describe('snapshotSchedule', () => {
  describe('isValidTimeZone', () => {
    it('accepts IANA zones and formattable aliases', () => {
      expect(isValidTimeZone(SGT)).toBe(true);
      expect(isValidTimeZone(NY)).toBe(true);
      expect(isValidTimeZone('UTC')).toBe(true);
      expect(isValidTimeZone('Europe/London')).toBe(true);
    });

    it('rejects garbage', () => {
      expect(isValidTimeZone('Mars/Olympus')).toBe(false);
      expect(isValidTimeZone('')).toBe(false);
      expect(isValidTimeZone('SGT')).toBe(false);
    });
  });

  describe('isValidSnapshotHour', () => {
    it('accepts integers 0-23 only', () => {
      expect(isValidSnapshotHour(0)).toBe(true);
      expect(isValidSnapshotHour(23)).toBe(true);
      expect(isValidSnapshotHour(24)).toBe(false);
      expect(isValidSnapshotHour(-1)).toBe(false);
      expect(isValidSnapshotHour(5.5)).toBe(false);
      expect(isValidSnapshotHour('5')).toBe(false);
      expect(isValidSnapshotHour(NaN)).toBe(false);
    });
  });

  describe('resolvePreference', () => {
    it('passes through valid preferences', () => {
      expect(resolvePreference({ snapshotHour: 1, snapshotTimezone: NY })).toEqual({
        hour: 1,
        timeZone: NY,
      });
    });

    it('falls back to defaults for invalid or missing values instead of throwing', () => {
      expect(resolvePreference({ snapshotHour: 99, snapshotTimezone: 'Mars/Olympus' })).toEqual({
        hour: DEFAULT_SNAPSHOT_HOUR,
        timeZone: DEFAULT_SNAPSHOT_TIMEZONE,
      });
      expect(resolvePreference(null)).toEqual({
        hour: DEFAULT_SNAPSHOT_HOUR,
        timeZone: DEFAULT_SNAPSHOT_TIMEZONE,
      });
    });
  });

  describe('getLocalParts', () => {
    it('reads wall-clock parts in the given zone', () => {
      // 21:00Z on Jul 31 = 05:00 Aug 1 in Singapore (Saturday)
      expect(getLocalParts(new Date('2026-07-31T21:00:00Z'), SGT)).toEqual({
        year: 2026,
        month: 8,
        day: 1,
        hour: 5,
        weekday: 6,
      });
    });

    it('uses a 23-hour clock (midnight is 0, not 24)', () => {
      expect(getLocalParts(new Date('2026-07-31T16:00:00Z'), SGT).hour).toBe(0);
    });
  });

  describe('startOfLocalDay / localDayBounds', () => {
    it('finds Singapore local midnight for an instant in that day', () => {
      const start = startOfLocalDay(new Date('2026-07-31T21:01:00Z'), SGT);
      expect(start.toISOString()).toBe('2026-07-31T16:00:00.000Z');
      const bounds = localDayBounds(new Date('2026-07-31T21:01:00Z'), SGT);
      expect(bounds.end.toISOString()).toBe('2026-08-01T16:00:00.000Z');
    });

    it('is DST-safe: uses the offset in force at that midnight, not at the instant', () => {
      // 8 Mar 2026 is the US spring-forward day. Midnight is still EST (UTC-5).
      const start = startOfLocalDay(new Date('2026-03-08T12:00:00Z'), NY);
      expect(start.toISOString()).toBe('2026-03-08T05:00:00.000Z');
      // Winter (EST, UTC-5): local midnight = 05:00Z
      expect(startOfLocalDay(new Date('2026-01-15T12:00:00Z'), NY).toISOString()).toBe(
        '2026-01-15T05:00:00.000Z'
      );
      // Summer (EDT, UTC-4): local midnight = 04:00Z
      expect(startOfLocalDay(new Date('2026-07-15T12:00:00Z'), NY).toISOString()).toBe(
        '2026-07-15T04:00:00.000Z'
      );
    });

    it('uses the next local midnight for 23-hour and 25-hour DST days', () => {
      expect(localDayBounds(new Date('2026-03-08T12:00:00Z'), NY)).toEqual({
        start: new Date('2026-03-08T05:00:00.000Z'),
        end: new Date('2026-03-09T04:00:00.000Z'),
      });
      expect(localDayBounds(new Date('2026-11-01T12:00:00Z'), NY)).toEqual({
        start: new Date('2026-11-01T04:00:00.000Z'),
        end: new Date('2026-11-02T05:00:00.000Z'),
      });
    });
  });

  describe('scheduledSnapshotAt', () => {
    it('places the snapshot at the local hour on the local day', () => {
      expect(scheduledSnapshotAt(new Date('2026-07-31T21:01:00Z'), SGT, 5).toISOString()).toBe(
        '2026-07-31T21:00:00.000Z'
      );
      expect(scheduledSnapshotAt(new Date('2026-07-31T21:01:00Z'), SGT, 1).toISOString()).toBe(
        '2026-07-31T17:00:00.000Z'
      );
    });

    it('runs a skipped DST hour at the first valid instant and uses the first repeated hour', () => {
      expect(scheduledSnapshotAt(new Date('2026-03-08T12:00:00Z'), NY, 2).toISOString()).toBe(
        '2026-03-08T07:00:00.000Z'
      );
      expect(scheduledSnapshotAt(new Date('2026-11-01T12:00:00Z'), NY, 1).toISOString()).toBe(
        '2026-11-01T05:00:00.000Z'
      );
      expect(scheduledSnapshotAt(new Date('2026-11-01T12:00:00Z'), NY, 23).toISOString()).toBe(
        '2026-11-02T04:00:00.000Z'
      );
    });
  });

  describe('isSnapshotHourNow', () => {
    const sgt5 = { snapshotHour: 5, snapshotTimezone: SGT };
    const sgt1 = { snapshotHour: 1, snapshotTimezone: SGT };
    const ny8 = { snapshotHour: 8, snapshotTimezone: NY };

    it('matches the default 5am Singapore schedule at 21:00Z the previous day', () => {
      expect(isSnapshotHourNow(new Date('2026-07-31T21:00:00Z'), sgt5)).toBe(true);
      expect(isSnapshotHourNow(new Date('2026-07-31T20:00:00Z'), sgt5)).toBe(false);
      expect(isSnapshotHourNow(new Date('2026-07-31T22:00:00Z'), sgt5)).toBe(false);
    });

    it('lets another user pick 1am Singapore (17:00Z)', () => {
      expect(isSnapshotHourNow(new Date('2026-07-31T17:00:00Z'), sgt1)).toBe(true);
      expect(isSnapshotHourNow(new Date('2026-07-31T21:00:00Z'), sgt1)).toBe(false);
    });

    it('follows DST for zones that observe it', () => {
      // 8am New York = 12:00Z in EDT (summer) but 13:00Z in EST (winter)
      expect(isSnapshotHourNow(new Date('2026-07-15T12:00:00Z'), ny8)).toBe(true);
      expect(isSnapshotHourNow(new Date('2026-01-15T13:00:00Z'), ny8)).toBe(true);
      expect(isSnapshotHourNow(new Date('2026-01-15T12:00:00Z'), ny8)).toBe(false);
    });

    it('fires when spring-forward skips the selected hour', () => {
      const ny2 = { snapshotHour: 2, snapshotTimezone: NY };
      expect(isSnapshotHourNow(new Date('2026-03-08T07:00:00Z'), ny2)).toBe(true);
      expect(isSnapshotHourNow(new Date('2026-03-08T08:00:00Z'), ny2)).toBe(false);
    });

    it('treats a corrupted preference as the default rather than never firing', () => {
      expect(
        isSnapshotHourNow(new Date('2026-07-31T21:00:00Z'), {
          snapshotHour: 5,
          snapshotTimezone: 'Mars/Olympus',
        })
      ).toBe(true);
    });
  });
});
