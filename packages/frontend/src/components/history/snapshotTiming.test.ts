import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SNAPSHOT_SCHEDULE,
  isBeforeDailySnapshotTime,
  isSameLocalDay,
  resolveSnapshotSchedule,
} from './snapshotTiming';

const NEW_YORK = 'America/New_York';
const NEW_YORK_8AM = { hour: 8, timeZone: NEW_YORK };

describe('snapshotTiming', () => {
  it('treats 4:59am SGT as pending and 5am SGT as due on the default schedule', () => {
    const before = new Date('2026-07-20T20:59:00.000Z');
    const due = new Date('2026-07-20T21:00:00.000Z');
    expect(isBeforeDailySnapshotTime(before, DEFAULT_SNAPSHOT_SCHEDULE)).toBe(true);
    expect(isBeforeDailySnapshotTime(due, DEFAULT_SNAPSHOT_SCHEDULE)).toBe(false);
  });

  it('compares snapshot dates by their Singapore calendar day on the default schedule', () => {
    const zone = DEFAULT_SNAPSHOT_SCHEDULE.timeZone;
    expect(
      isSameLocalDay(
        new Date('2026-07-20T16:30:00.000Z'),
        new Date('2026-07-21T15:59:00.000Z'),
        zone
      )
    ).toBe(true);
    expect(
      isSameLocalDay(
        new Date('2026-07-20T15:59:00.000Z'),
        new Date('2026-07-20T16:00:00.000Z'),
        zone
      )
    ).toBe(false);
  });

  it('uses the chosen hour in the chosen timezone, summer and winter', () => {
    // 8am in New York is 12:00Z in summer (EDT) and 13:00Z in winter (EST).
    expect(isBeforeDailySnapshotTime(new Date('2026-07-15T11:59:00.000Z'), NEW_YORK_8AM)).toBe(
      true
    );
    expect(isBeforeDailySnapshotTime(new Date('2026-07-15T12:00:00.000Z'), NEW_YORK_8AM)).toBe(
      false
    );
    expect(isBeforeDailySnapshotTime(new Date('2026-01-15T12:59:00.000Z'), NEW_YORK_8AM)).toBe(
      true
    );
    expect(isBeforeDailySnapshotTime(new Date('2026-01-15T13:00:00.000Z'), NEW_YORK_8AM)).toBe(
      false
    );
  });

  it('judges "today" by the calendar day in the chosen timezone', () => {
    // 03:59Z is 23:59 on 14 July in New York but 11:59 on 15 July in Singapore.
    const lateOnJuly14InNewYork = new Date('2026-07-15T03:59:00.000Z');
    const midnightJuly15InNewYork = new Date('2026-07-15T04:00:00.000Z');
    expect(isSameLocalDay(lateOnJuly14InNewYork, midnightJuly15InNewYork, NEW_YORK)).toBe(false);
    expect(
      isSameLocalDay(midnightJuly15InNewYork, new Date('2026-07-16T03:59:00.000Z'), NEW_YORK)
    ).toBe(true);
  });

  it('handles timezones with half-hour offsets', () => {
    // 9am in Kolkata (UTC+5:30) is 03:30Z.
    const kolkata9am = { hour: 9, timeZone: 'Asia/Kolkata' };
    expect(isBeforeDailySnapshotTime(new Date('2026-07-15T03:29:00.000Z'), kolkata9am)).toBe(true);
    expect(isBeforeDailySnapshotTime(new Date('2026-07-15T03:30:00.000Z'), kolkata9am)).toBe(false);
  });

  it('matches the backend scheduler when DST skips or repeats the chosen hour', () => {
    // 8 March 2026: New York jumps from 01:59 EST to 03:00 EDT, so 2am runs at 07:00Z.
    const newYork2am = { hour: 2, timeZone: NEW_YORK };
    expect(isBeforeDailySnapshotTime(new Date('2026-03-08T06:59:00.000Z'), newYork2am)).toBe(true);
    expect(isBeforeDailySnapshotTime(new Date('2026-03-08T07:00:00.000Z'), newYork2am)).toBe(false);

    // 1 November 2026: 1am happens twice. The first one (05:00Z, EDT) is the snapshot
    // time, so the second one (06:30Z is 1:30am EST) is not pending again.
    const newYork1am = { hour: 1, timeZone: NEW_YORK };
    expect(isBeforeDailySnapshotTime(new Date('2026-11-01T04:59:00.000Z'), newYork1am)).toBe(true);
    expect(isBeforeDailySnapshotTime(new Date('2026-11-01T05:00:00.000Z'), newYork1am)).toBe(false);
    expect(isBeforeDailySnapshotTime(new Date('2026-11-01T06:30:00.000Z'), newYork1am)).toBe(false);
  });

  it('falls back to 5am Singapore while preferences are missing or unusable', () => {
    expect(resolveSnapshotSchedule(undefined)).toEqual({ hour: 5, timeZone: 'Asia/Singapore' });
    expect(resolveSnapshotSchedule({ snapshotHour: 8, snapshotTimezone: NEW_YORK })).toEqual(
      NEW_YORK_8AM
    );
    expect(resolveSnapshotSchedule({ snapshotHour: 24, snapshotTimezone: NEW_YORK })).toEqual({
      hour: 5,
      timeZone: NEW_YORK,
    });
    expect(resolveSnapshotSchedule({ snapshotHour: 8, snapshotTimezone: 'Mars/Olympus' })).toEqual({
      hour: 8,
      timeZone: 'Asia/Singapore',
    });
  });
});
