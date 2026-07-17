import { describe, expect, it } from 'vitest';
import {
  applyPositionDelta,
  calculatePositionValue,
  isExternalProviderCategoryCompatible,
} from '../lib/domain.js';

describe('domain helpers', () => {
  it('calculates position value and unrealized PnL from current price', () => {
    expect(
      calculatePositionValue({
        quantity: 2,
        avgCostUsd: 40,
        currentPriceUsd: 60,
      })
    ).toEqual({
      marketValueUsd: 120,
      unrealizedPnL: 40,
      unrealizedPnLPct: 50,
    });
  });

  it('keeps zero-priced assets as zero-valued rather than unknown', () => {
    expect(
      calculatePositionValue({
        quantity: 2,
        avgCostUsd: 40,
        currentPriceUsd: 0,
      })
    ).toEqual({
      marketValueUsd: 0,
      unrealizedPnL: -80,
      unrealizedPnLPct: -100,
    });
  });

  it('adds quantity with weighted average cost', () => {
    expect(
      applyPositionDelta({
        currentQuantity: 10,
        currentAvgCostUsd: 5,
        deltaQuantity: 5,
        deltaTotalCostUsd: 40,
        mode: 'add',
      })
    ).toMatchObject({
      currentTotalCostUsd: 50,
      deltaCostUsd: 40,
      nextQuantity: 15,
      nextTotalCostUsd: 90,
      nextAvgCostUsd: 6,
    });
  });

  it('reduces quantity at the current average cost', () => {
    expect(
      applyPositionDelta({
        currentQuantity: 10,
        currentAvgCostUsd: 5,
        deltaQuantity: 4,
        mode: 'reduce',
      })
    ).toMatchObject({
      currentTotalCostUsd: 50,
      deltaCostUsd: 20,
      nextQuantity: 6,
      nextTotalCostUsd: 30,
      nextAvgCostUsd: 5,
    });
  });

  it('rejects reductions below zero quantity', () => {
    expect(() =>
      applyPositionDelta({
        currentQuantity: 1,
        currentAvgCostUsd: 5,
        deltaQuantity: 2,
        mode: 'reduce',
      })
    ).toThrow('reduce below zero quantity');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite position inputs (%s)',
    (invalid) => {
      expect(() =>
        applyPositionDelta({
          currentQuantity: 1,
          currentAvgCostUsd: 5,
          deltaQuantity: invalid,
          deltaTotalCostUsd: 1,
          mode: 'add',
        })
      ).toThrow('Delta quantity must be positive');
    }
  );

  it('rejects finite inputs whose multiplication overflows', () => {
    expect(() =>
      applyPositionDelta({
        currentQuantity: 1e308,
        currentAvgCostUsd: 1e308,
        deltaQuantity: 1,
        deltaTotalCostUsd: 1,
        mode: 'add',
      })
    ).toThrow('supported numeric range');
  });

  it('captures external provider/category compatibility', () => {
    expect(isExternalProviderCategoryCompatible('yahoo', 'EQUITY')).toBe(true);
    expect(isExternalProviderCategoryCompatible('yahoo', 'UNIT_TRUST')).toBe(true);
    expect(isExternalProviderCategoryCompatible('yahoo', 'LIQUID_CRYPTO')).toBe(false);
    expect(isExternalProviderCategoryCompatible('manual', 'UNIT_TRUST')).toBe(true);
    expect(isExternalProviderCategoryCompatible('manual', 'CASH')).toBe(false);
  });
});
