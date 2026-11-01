import { describe, expect, it } from 'vitest';
import type { Position } from '@/lib/types';
import { calculateExposurePct } from '@/lib/exposure';

const position = (category: string, marketValueUsd: number, custodyOf: string | null = null) =>
  ({ asset: { category }, marketValueUsd, custodyOf }) as unknown as Position;

const positions = [
  position('LIQUID_CRYPTO', 60_000),
  position('EQUITY', 4_000),
  position('CASH', 10_000),
  position('STABLECOIN', 6_000),
  // Held for someone else: never part of exposure.
  position('LIQUID_CRYPTO', 50_000, 'Alex'),
];

describe('calculateExposurePct', () => {
  it('counts owned market-risk positions plus perps, out of the total', () => {
    expect(
      calculateExposurePct({ positions, totalValueUsd: 80_000, perpExposureUsd: 0 })
    ).toBeCloseTo(80);
    expect(
      calculateExposurePct({ positions, totalValueUsd: 80_000, perpExposureUsd: 16_000 })
    ).toBeCloseTo(100);
  });

  it('is unknown until positions, the total and the perp setting have all loaded', () => {
    expect(
      calculateExposurePct({ positions: undefined, totalValueUsd: 80_000, perpExposureUsd: 0 })
    ).toBeUndefined();
    expect(
      calculateExposurePct({ positions, totalValueUsd: undefined, perpExposureUsd: 0 })
    ).toBeUndefined();
    expect(
      calculateExposurePct({ positions, totalValueUsd: 80_000, perpExposureUsd: undefined })
    ).toBeUndefined();
  });

  it('is 0 for a loaded portfolio with nothing exposed', () => {
    expect(calculateExposurePct({ positions: [], totalValueUsd: 0, perpExposureUsd: 0 })).toBe(0);
    expect(
      calculateExposurePct({
        positions: [position('CASH', 10_000)],
        totalValueUsd: 10_000,
        perpExposureUsd: 0,
      })
    ).toBe(0);
    // Value held for someone else never counts, so it can't turn a zero total into "-".
    expect(
      calculateExposurePct({
        positions: [position('LIQUID_CRYPTO', 50_000, 'Alex')],
        totalValueUsd: 0,
        perpExposureUsd: 0,
      })
    ).toBe(0);
  });

  it('is unknown when something is exposed but the total is zero', () => {
    // Perps with nothing owned: there is no share to show, and 0.0% would call the account safe.
    expect(
      calculateExposurePct({ positions: [], totalValueUsd: 0, perpExposureUsd: 8_000 })
    ).toBeUndefined();
    // Owned market risk against a zero total, e.g. a summary that hasn't caught up with a new
    // position yet.
    expect(
      calculateExposurePct({
        positions: [position('LIQUID_CRYPTO', 40_000)],
        totalValueUsd: 0,
        perpExposureUsd: 0,
      })
    ).toBeUndefined();
  });
});
