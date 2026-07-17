import { describe, expect, it, vi } from 'vitest';
import { parseUobKhStatement } from '../services/statementParsers/uobKayHian.js';

vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function statement(date: string, quantity = '1,000.000') {
  return `
UOB Kay Hian Private Limited
For the period from 1 January 2026 to ${date}
Portfolio Holdings
Amova Singapore
Growth Fund SG9999005961 SGD UNIT ${quantity} 1.2500
0.0000
1.5000
$ 1,500.00 $ 250.00
Amova duplicate
Growth Fund SG9999005961 SGD UNIT ${quantity} 1.2500
0.0000
1.5000
$ 1,500.00 $ 250.00
Total $
`;
}

describe('parseUobKhStatement', () => {
  it('extracts a holding once and preserves statement-native amounts', () => {
    const parsed = parseUobKhStatement(statement('28 February 2026'));

    expect(parsed.broker).toBe('UOB Kay Hian');
    expect(parsed.periodEnd).toBe('2026-02-28T00:00:00.000Z');
    expect(parsed.holdings).toHaveLength(1);
    expect(parsed.holdings[0]).toMatchObject({
      isin: 'SG9999005961',
      nativeCurrency: 'SGD',
      units: 1_000,
      avgCostNative: 1.25,
      navNative: 1.5,
      currentValueNative: 1_500,
      gainLossNative: 250,
      totalCostNative: 1_250,
    });
  });

  it('does not roll an impossible calendar date into the following month', () => {
    expect(parseUobKhStatement(statement('31 February 2026')).periodEnd).toBeNull();
  });

  it.each(['0', '-10', 'Infinity'])('rejects corrupted holding quantity %s', (quantity) =>
    expect(parseUobKhStatement(statement('28 February 2026', quantity)).holdings).toEqual([])
  );

  it('rejects text from a different broker', () => {
    expect(() => parseUobKhStatement('Portfolio Holdings')).toThrow('Not a UOB Kay Hian statement');
  });
});
