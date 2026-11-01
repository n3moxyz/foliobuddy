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

  it('is 0 for a loaded but empty portfolio', () => {
    expect(calculateExposurePct({ positions: [], totalValueUsd: 0, perpExposureUsd: 0 })).toBe(0);
  });
});
