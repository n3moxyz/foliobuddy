import { describe, expect, it, vi } from 'vitest';
import {
  NUMERIC_LINE_REGEX,
  parseUobKhStatement,
} from '../services/statementParsers/uobKayHian.js';

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

  it('skips a hostile digit line among holding values without stalling', () => {
    const hostile = statement('28 February 2026').replace(
      '\n0.0000\n',
      `\n${'1'.repeat(200_000)}x\n0.0000\n`
    );

    const started = performance.now();
    const parsed = parseUobKhStatement(hostile);

    expect(performance.now() - started).toBeLessThan(500);
    expect(parsed.holdings[0]).toMatchObject({ navNative: 1.5, currentValueNative: 1_500 });
  });

  it('rejects text from a different broker', () => {
    expect(() => parseUobKhStatement('Portfolio Holdings')).toThrow('Not a UOB Kay Hian statement');
  });
});

// The pattern NUMERIC_LINE_REGEX replaced; kept only to prove the rewrite is equivalent.
const LEGACY_NUMERIC_LINE = /^[-]?\d[\d,]*\.?\d*$/;

describe('NUMERIC_LINE_REGEX', () => {
  it.each(['1,234.56', '-12', '0.5', '1,000', '1.5000', '0.0000', '12.'])(
    'accepts statement value %j',
    (value) => expect(NUMERIC_LINE_REGEX.test(value)).toBe(true)
  );

  it.each(['', '-', '--1', '.5', '1.2.3', '$1.00', '1,000 SGD', '12a'])(
    'rejects non-value %j',
    (value) => expect(NUMERIC_LINE_REGEX.test(value)).toBe(false)
  );

  it('accepts exactly the strings the old pattern accepted', () => {
    // Every string up to 6 characters over digits, separators, sign, junk and space.
    const alphabet = ['1', ',', '.', '-', 'x', ' '];
    let layer = [''];
    const corpus = [''];
    for (let length = 1; length <= 6; length++) {
      layer = layer.flatMap((prefix) => alphabet.map((ch) => prefix + ch));
      corpus.push(...layer);
    }

    const mismatches = corpus.filter(
      (value) => NUMERIC_LINE_REGEX.test(value) !== LEGACY_NUMERIC_LINE.test(value)
    );

    expect(corpus).toHaveLength(55_987);
    expect(mismatches).toEqual([]);
  });

  it('rejects a 200k-digit line quickly (the old pattern backtracked quadratically)', () => {
    const hostile = `${'1'.repeat(200_000)}x`;

    const started = performance.now();
    expect(NUMERIC_LINE_REGEX.test(hostile)).toBe(false);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
