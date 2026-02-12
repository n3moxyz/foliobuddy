import { describe, it, expect } from 'vitest';
import { calculateTradePnL } from '../lib/tradePnL.js';

describe('calculateTradePnL', () => {
  describe('LONG trades', () => {
    it('calculates profit for LONG trade (exit > entry)', () => {
      const result = calculateTradePnL('LONG', 100, 120, 10);
      expect(result.pnl).toBe(200); // (120 - 100) * 10
      expect(result.pnlPct).toBe(20); // (200 / 1000) * 100
    });

    it('calculates loss for LONG trade (exit < entry)', () => {
      const result = calculateTradePnL('LONG', 100, 80, 10);
      expect(result.pnl).toBe(-200); // (80 - 100) * 10
      expect(result.pnlPct).toBe(-20); // (-200 / 1000) * 100
    });

    it('calculates break-even for LONG trade (exit === entry)', () => {
      const result = calculateTradePnL('LONG', 100, 100, 10);
      expect(result.pnl).toBe(0);
      expect(result.pnlPct).toBe(0);
    });
  });

  describe('SHORT trades', () => {
    it('calculates profit for SHORT trade (entry > exit)', () => {
      const result = calculateTradePnL('SHORT', 120, 100, 10);
      expect(result.pnl).toBe(200); // (120 - 100) * 10
      expect(result.pnlPct).toBeCloseTo(16.67, 1); // (200 / 1200) * 100
    });

    it('calculates loss for SHORT trade (entry < exit)', () => {
      const result = calculateTradePnL('SHORT', 100, 120, 10);
      expect(result.pnl).toBe(-200); // (100 - 120) * 10
      expect(result.pnlPct).toBe(-20); // (-200 / 1000) * 100
    });

    it('calculates break-even for SHORT trade (exit === entry)', () => {
      const result = calculateTradePnL('SHORT', 100, 100, 10);
      expect(result.pnl).toBe(0);
      expect(result.pnlPct).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('handles large quantities', () => {
      const result = calculateTradePnL('LONG', 50, 55, 100000);
      expect(result.pnl).toBe(500000); // (55 - 50) * 100000
      expect(result.pnlPct).toBe(10); // (500000 / 5000000) * 100
    });

    it('handles small fractional crypto prices', () => {
      const result = calculateTradePnL('LONG', 0.00001, 0.00002, 1000000);
      expect(result.pnl).toBeCloseTo(10, 5); // (0.00002 - 0.00001) * 1000000
      expect(result.pnlPct).toBe(100); // 100% gain
    });

    it('handles zero entry price edge case', () => {
      const result = calculateTradePnL('LONG', 0, 100, 10);
      expect(result.pnl).toBe(1000); // (100 - 0) * 10
      expect(result.pnlPct).toBe(0); // positionSize = 0, so pnlPct = 0
    });

    it('handles fractional quantities', () => {
      const result = calculateTradePnL('LONG', 100, 110, 2.5);
      expect(result.pnl).toBe(25); // (110 - 100) * 2.5
      expect(result.pnlPct).toBe(10); // (25 / 250) * 100
    });
  });
});
