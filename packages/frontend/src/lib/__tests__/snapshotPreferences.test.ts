import { describe, expect, it } from 'vitest';
import {
  describeNextSnapshot,
  formatTimeZoneLabel,
  formatUtcOffset,
  getTimeZoneGroups,
  isKnownTimeZone,
  SNAPSHOT_HOUR_OPTIONS,
} from '../snapshotPreferences';

describe('snapshotPreferences', () => {
  it('offers all 24 hours with 12h labels', () => {
    expect(SNAPSHOT_HOUR_OPTIONS).toHaveLength(24);
    expect(SNAPSHOT_HOUR_OPTIONS[0]).toEqual({ value: 0, label: '12:00 AM' });
    expect(SNAPSHOT_HOUR_OPTIONS[5]).toEqual({ value: 5, label: '5:00 AM' });
    expect(SNAPSHOT_HOUR_OPTIONS[12]).toEqual({ value: 12, label: '12:00 PM' });
    expect(SNAPSHOT_HOUR_OPTIONS[23]).toEqual({ value: 23, label: '11:00 PM' });
  });

  it('groups timezones by region with UTC pinned first', () => {
    const groups = getTimeZoneGroups();
    expect(groups[0]).toEqual({ region: 'UTC', zones: ['UTC'] });
    const asia = groups.find((g) => g.region === 'Asia');
    expect(asia?.zones).toContain('Asia/Singapore');
    expect(asia?.zones).toContain('Asia/Tokyo');
    // sorted within a group
    expect(asia?.zones).toEqual([...(asia?.zones ?? [])].sort());
  });

  it('formats zone labels and offsets for humans', () => {
    expect(formatTimeZoneLabel('Asia/Singapore')).toBe('Singapore');
    expect(formatTimeZoneLabel('America/New_York')).toBe('New York');
    expect(formatTimeZoneLabel('UTC')).toBe('UTC');
    expect(formatUtcOffset('Asia/Singapore', new Date('2026-07-15T00:00:00Z'))).toBe('UTC+8');
    // Uses a real minus sign, not a hyphen
    expect(formatUtcOffset('America/New_York', new Date('2026-07-15T00:00:00Z'))).toBe('UTC−4');
    expect(formatUtcOffset('Nope/Nope')).toBe('');
  });

  it('validates timezones the way the backend does', () => {
    expect(isKnownTimeZone('Asia/Singapore')).toBe(true);
    expect(isKnownTimeZone('UTC')).toBe(true);
    expect(isKnownTimeZone('Mars/Olympus')).toBe(false);
  });

  describe('describeNextSnapshot', () => {
    it('says "today" when the snapshot hour is still ahead in that zone', () => {
      // 20:00Z = 04:00 SGT → 05:00 SGT is still today
      const next = describeNextSnapshot(5, 'Asia/Singapore', new Date('2026-07-15T20:00:00Z'));
      expect(next?.isToday).toBe(true);
      expect(next?.local).toBe('05:00');
    });

    it('says "tomorrow" once the hour has passed in that zone', () => {
      // 22:00Z = 06:00 SGT → 05:00 SGT already happened today
      const next = describeNextSnapshot(5, 'Asia/Singapore', new Date('2026-07-15T22:00:00Z'));
      expect(next?.isToday).toBe(false);
      expect(next?.local).toBe('05:00');
    });

    it('returns null for an unknown zone instead of throwing', () => {
      expect(describeNextSnapshot(5, 'Mars/Olympus')).toBeNull();
    });
  });
});
