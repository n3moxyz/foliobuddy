import { describe, it, expect } from 'vitest';
import {
  isCategoryBucket,
  PERPS_SLICE,
  resolveDominantBucket,
  splitCashAndPerps,
} from '../allocationMath';

describe('splitCashAndPerps', () => {
  it('moves perp exposure out of cash', () => {
    expect(splitCashAndPerps(100_000, 30_000)).toEqual({ cash: 70_000, perps: 30_000 });
  });

  it('leaves cash untouched when there is no perp exposure', () => {
    expect(splitCashAndPerps(100_000, 0)).toEqual({ cash: 100_000, perps: 0 });
  });

  it('clamps the perp slice to available cash when exposure is leveraged past it', () => {
    expect(splitCashAndPerps(100_000, 300_000)).toEqual({ cash: 0, perps: 100_000 });
  });

  it('returns zeros when there is no cash bucket', () => {
    expect(splitCashAndPerps(0, 50_000)).toEqual({ cash: 0, perps: 0 });
  });

  it('ignores negative perp exposure', () => {
    expect(splitCashAndPerps(100_000, -5_000)).toEqual({ cash: 100_000, perps: 0 });
  });

  it('treats non-finite inputs as zero', () => {
    expect(splitCashAndPerps(Number.NaN, 50_000)).toEqual({ cash: 0, perps: 0 });
    expect(splitCashAndPerps(100_000, Number.NaN)).toEqual({ cash: 100_000, perps: 0 });
    expect(splitCashAndPerps(100_000, Number.POSITIVE_INFINITY)).toEqual({
      cash: 100_000,
      perps: 0,
    });
  });
});

describe('isCategoryBucket', () => {
  it('accepts the three drillable buckets and rejects everything else', () => {
    expect(isCategoryBucket('Crypto')).toBe(true);
    expect(isCategoryBucket('Equities')).toBe(true);
    expect(isCategoryBucket('Cash')).toBe(true);
    expect(isCategoryBucket(PERPS_SLICE)).toBe(false);
    expect(isCategoryBucket('Other')).toBe(false);
  });
});

describe('resolveDominantBucket', () => {
  it('picks the largest non-Cash bucket (input is sorted by value desc)', () => {
    expect(resolveDominantBucket(['Equities', 'Crypto', 'Cash'])).toBe('Equities');
    expect(resolveDominantBucket(['Cash', 'Crypto', 'Equities'])).toBe('Crypto');
  });

  it('never resolves to Perps, even when Perps dominates', () => {
    expect(resolveDominantBucket([PERPS_SLICE, 'Crypto', 'Equities'])).toBe('Crypto');
    expect(resolveDominantBucket(['Cash', PERPS_SLICE, 'Equities'])).toBe('Equities');
  });

  it('falls back to Equities when no drillable bucket exists', () => {
    expect(resolveDominantBucket(['Cash', PERPS_SLICE])).toBe('Equities');
    expect(resolveDominantBucket([])).toBe('Equities');
  });
});
