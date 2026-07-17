import { describe, expect, it } from 'vitest';
import { calculateTradePnL } from '../lib/tradePnL.js';

describe('calculateTradePnL', () => {
  it.each([
    ['LONG', 100, 120, 10, 200, 20],
    ['LONG', 100, 80, 10, -200, -20],
    ['SHORT', 120, 100, 10, 200, 100 / 6],
    ['SHORT', 100, 120, 10, -200, -20],
    ['LONG', 100, 100, 10, 0, 0],
    ['SHORT', 100, 100, 10, 0, 0],
  ] as const)(
    '%s entry %d exit %d quantity %d yields PnL %d and return %d',
    (direction, entry, exit, quantity, pnl, pnlPct) => {
      const result = calculateTradePnL(direction, entry, exit, quantity);
      expect(result.pnl).toBe(pnl);
      expect(result.pnlPct).toBeCloseTo(pnlPct, 12);
    }
  );

  it('retains precision for fractional crypto quantities and prices', () => {
    expect(calculateTradePnL('LONG', 0.00001, 0.00002, 1_000_000)).toEqual({
      pnl: 10,
      pnlPct: 100,
    });
    expect(calculateTradePnL('LONG', 100, 110, 2.5)).toEqual({ pnl: 25, pnlPct: 10 });
  });

  it('does not divide by a zero-sized position', () => {
    expect(calculateTradePnL('LONG', 0, 100, 10)).toEqual({ pnl: 1000, pnlPct: 0 });
  });
});
