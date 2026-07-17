import { describe, expect, it } from 'vitest';
import {
  applyPositionDelta,
  categoryGroup,
  isExternalProviderCategoryCompatible,
} from '@foliobuddy/shared';

describe('shared domain runtime', () => {
  it('keeps category grouping and provider compatibility aligned for frontend consumers', () => {
    expect(categoryGroup('CASH')).toBe('stables');
    expect(categoryGroup('UNIT_TRUST')).toBe('unit_trusts');
    expect(isExternalProviderCategoryCompatible('yahoo', 'EQUITY')).toBe(true);
    expect(isExternalProviderCategoryCompatible('manual', 'CASH')).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite deltas (%s)',
    (deltaQuantity) => {
      expect(() =>
        applyPositionDelta({
          currentQuantity: 1,
          currentAvgCostUsd: 5,
          deltaQuantity,
          deltaTotalCostUsd: 1,
          mode: 'add',
        })
      ).toThrow('Delta quantity must be positive');
    }
  );

  it('rejects arithmetic overflow rather than returning an infinite cost basis', () => {
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
});
