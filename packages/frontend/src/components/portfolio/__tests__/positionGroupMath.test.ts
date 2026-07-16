import { describe, expect, it } from 'vitest';
import { calculatePositionGroupPnL } from '@/components/portfolio/positionGroupMath';
import type { Position } from '@/lib/types';

function position(quantity: number, avgCostUsd: number, unrealizedPnL: number | null): Position {
  return { quantity, avgCostUsd, unrealizedPnL } as Position;
}

describe('calculatePositionGroupPnL', () => {
  it('calculates a cost-basis-weighted group return', () => {
    const result = calculatePositionGroupPnL([position(10, 100, 200), position(100, 10, -100)]);

    expect(result).toEqual({ pnlUsd: 100, pnlPct: 5 });
  });

  it('ignores positions without a known P&L', () => {
    const result = calculatePositionGroupPnL([position(10, 100, 100), position(50, 20, null)]);

    expect(result).toEqual({ pnlUsd: 100, pnlPct: 10 });
  });

  it('returns null values when no position has a known P&L', () => {
    expect(calculatePositionGroupPnL([position(10, 100, null)])).toEqual({
      pnlUsd: null,
      pnlPct: null,
    });
  });
});
