import { describe, expect, it } from 'vitest';
import {
  buildPositionDeltaPreview,
  calculateAverageCostInput,
  calculateNonNegativeAverageCostInput,
  calculateNonNegativeTotalCostInput,
  calculateTotalCostInput,
  toUsdCost,
} from '../positionFormMath';

describe('positionFormMath', () => {
  it('derives average and total cost display values', () => {
    expect(calculateAverageCostInput('total', '4', '100', '')).toBe('25.00');
    expect(calculateAverageCostInput('avg', '4', '100', '30')).toBe('30');
    expect(calculateTotalCostInput('avg', '4', '25', '')).toBe('100.00');
    expect(calculateTotalCostInput('total', '4', '25', '90')).toBe('90');
  });

  it('allows zero additional cost for delta add calculations', () => {
    expect(calculateNonNegativeAverageCostInput('total', '4', '0', '')).toBe('0.00');
    expect(calculateNonNegativeTotalCostInput('avg', '4', '0', '')).toBe('0.00');
  });

  it('converts SGD cost input to stored USD', () => {
    expect(toUsdCost(135, 'SGD', 1.35)).toBe(100);
    expect(toUsdCost(100, 'USD', 1.35)).toBe(100);
  });

  it('builds an add-position preview using display currency', () => {
    const preview = buildPositionDeltaPreview({
      currentQuantity: 10,
      currentAvgCostUsd: 5,
      deltaQuantity: '5',
      deltaTotalCostInput: '54',
      mode: 'add',
      costCurrency: 'SGD',
      fxSgdPerUsd: 1.35,
    });

    expect(preview).not.toBeNull();
    expect(preview?.currentQuantity).toBe(10);
    expect(preview?.currentAvgCost).toBeCloseTo(6.75);
    expect(preview?.currentTotalCost).toBeCloseTo(67.5);
    expect(preview?.nextQuantity).toBe(15);
    expect(preview?.nextAvgCost).toBeCloseTo(8.1);
    expect(preview?.nextTotalCost).toBeCloseTo(121.5);
  });

  it('returns null for invalid reduce previews', () => {
    expect(
      buildPositionDeltaPreview({
        currentQuantity: 1,
        currentAvgCostUsd: 5,
        deltaQuantity: '2',
        deltaTotalCostInput: '',
        mode: 'reduce',
        costCurrency: 'USD',
        fxSgdPerUsd: 1.35,
      })
    ).toBeNull();
  });
});
