import { describe, expect, it } from 'vitest';
import { isBeforeDailySnapshotTime, isSameSingaporeDay } from './snapshotTiming';

describe('snapshotTiming', () => {
  it('treats 4:59am SGT as pending and 5am SGT as due', () => {
    expect(isBeforeDailySnapshotTime(new Date('2026-07-20T20:59:00.000Z'))).toBe(true);
    expect(isBeforeDailySnapshotTime(new Date('2026-07-20T21:00:00.000Z'))).toBe(false);
  });

  it('compares snapshot dates by their Singapore calendar day', () => {
    expect(
      isSameSingaporeDay(new Date('2026-07-20T16:30:00.000Z'), new Date('2026-07-21T15:59:00.000Z'))
    ).toBe(true);
    expect(
      isSameSingaporeDay(new Date('2026-07-20T15:59:00.000Z'), new Date('2026-07-20T16:00:00.000Z'))
    ).toBe(false);
  });
});
