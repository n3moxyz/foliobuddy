import { describe, it, expect } from 'vitest';
import {
  findHoldingsHeaderEnd,
  findStatementPeriodDate,
  parseFsmOneStatement,
} from '../services/statementParsers/fsmOne.js';

// Mirrors the text that pdf-parse yields from a real FSMOne consolidated
// monthly statement (one Amova Singapore Equity SGD holding).
const SAMPLE = `
TAN MENG CHYE EDWARD
Account No: P0590046
Display Currency: Singapore Dollar, S$
Issued Date: 06 May 2026
Consolidated Statement Period:
01 Apr 2026 to 30 Apr 2026
iFAST Financial Pte Ltd Co. Reg No. 200000231R

UNIT TRUST HOLDINGS AS AT 30 APRIL 2026
INVESTMENT HOLDINGS
INFORMATION (IN PRODUCT CURRENCY)
###
SGD EQUIVALENT #
Product
Name
Price Payment
Method
Weighted
Average Cost
Quantity Investment
Amount (A)
Profit / Loss
(C) = (B) - (A)
Profit / Loss
%
Current Market
Value (B)
Amova
Singapore
Equity SGD
(formerly
Nikko AM)
SGD
5.3036
Cash SGD
5.2663
18,988.66 SGD
100,000.00
SGD
708.26
0.71 SGD
100,708.26
TOTAL UNIT TRUST HOLDINGS (SGD EQUIVALENT) SGD
100,708.26
`;

describe('parseFsmOneStatement', () => {
  it('rejects non-FSMOne text', () => {
    expect(() => parseFsmOneStatement('UOB Kay Hian Monthly Statement')).toThrow(
      /Not an FSMOne statement/
    );
  });

  it('extracts the period end date', () => {
    const result = parseFsmOneStatement(SAMPLE);
    expect(result.periodEnd).toBe('2026-04-30T00:00:00.000Z');
    expect(result.broker).toBe('FSMOne');
  });

  it('extracts the Amova Singapore Equity holding', () => {
    const result = parseFsmOneStatement(SAMPLE);
    expect(result.holdings).toHaveLength(1);

    const h = result.holdings[0];
    expect(h.name).toBe('Amova Singapore Equity SGD (formerly Nikko AM)');
    expect(h.symbol).toBe('AMOVASIN');
    expect(h.isin).toBe('SG9999004360');
    expect(h.nativeCurrency).toBe('SGD');
    expect(h.units).toBeCloseTo(18988.66, 2);
    expect(h.avgCostNative).toBeCloseTo(5.2663, 4);
    expect(h.navNative).toBeCloseTo(5.3036, 4);
    // totalCost derived from avgCost * units (~100,000 SGD)
    expect(h.totalCostNative).toBeCloseTo(99999.99, 0);
    // currentValue derived from nav * units (~100,708 SGD)
    expect(h.currentValueNative).toBeCloseTo(100708.27, 0);
    // P&L SGD-equivalent matches because the fund is SGD-denominated
    expect(h.gainLossNative).toBeCloseTo(708.26, 2);
  });

  it('does not map a different Amova share class by a similar name', () => {
    const result = parseFsmOneStatement(SAMPLE.replace('Equity SGD', 'Equity SGD Class A'));
    expect(result.holdings[0].isin).toBe('');
  });

  it('falls back to the statement period when the holdings header has no date', () => {
    const result = parseFsmOneStatement(
      SAMPLE.replace('UNIT TRUST HOLDINGS AS AT 30 APRIL 2026', 'UNIT TRUST HOLDINGS AS AT')
    );
    expect(result.periodEnd).toBe('2026-04-30T00:00:00.000Z');
    expect(result.holdings).toHaveLength(1);
  });

  it('searches 30k repeated statement period labels without stalling', () => {
    // The old regex rescanned the document from every label: quadratic, ~1.2 s.
    const hostile = `FSMOne\n${'Statement Period:'.repeat(30_000)}`;

    const started = performance.now();
    expect(() => parseFsmOneStatement(hostile)).toThrow('holdings table header not found');
    expect(performance.now() - started).toBeLessThan(200);
  });

  it('searches 2k repeated holdings header fragments without stalling', () => {
    // The old regex nested two lazy scans: cubic, ~3.5 s.
    const hostile = `FSMOne\n${'UNIT TRUST HOLDINGS AS AT Current Market '.repeat(2_000)}`;

    const started = performance.now();
    expect(() => parseFsmOneStatement(hostile)).toThrow('holdings table header not found');
    expect(performance.now() - started).toBeLessThan(200);
  });
});

// The patterns the searches below replaced; kept only to prove the rewrites are equivalent.
const LEGACY_STATEMENT_PERIOD = /Statement Period:[\s\S]*?to\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i;
const LEGACY_HOLDINGS_HEADER =
  /UNIT TRUST HOLDINGS AS AT[\s\S]*?Current\s+Market[\s\S]*?Value\s*\(B\)/i;

// Every sequence of up to 5 pieces.
function sequencesOf(pieces: string[]): string[] {
  let layer = [''];
  const corpus = [''];
  for (let length = 1; length <= 5; length++) {
    layer = layer.flatMap((sequence) => pieces.map((piece) => sequence + piece));
    corpus.push(...layer);
  }
  return corpus;
}

describe('findStatementPeriodDate', () => {
  it('captures the same date as the old regex', () => {
    // Both label casings, a date, a date spread over lines, a "to" with no
    // date, filler (so "to" can also end a word), a line break and a space.
    const corpus = sequencesOf([
      'Statement Period:',
      'STATEMENT period:',
      'to 1 May 2026',
      'TO\n12  June\n2026',
      'to x',
      'x',
      '\n',
      ' ',
    ]);

    const mismatches = corpus.filter(
      (text) => findStatementPeriodDate(text) !== (LEGACY_STATEMENT_PERIOD.exec(text)?.[1] ?? null)
    );

    expect(corpus).toHaveLength(37_449);
    expect(mismatches).toEqual([]);
  });
});

describe('findHoldingsHeaderEnd', () => {
  it('ends where the old header regex ended', () => {
    // Each header part in both casings, whitespace variants, and the first
    // word of the later parts alone, in every order and repetition.
    const corpus = sequencesOf([
      'UNIT TRUST HOLDINGS AS AT',
      'unit trust holdings as at',
      'Current Market',
      'CURRENT\n  market',
      'Value (B)',
      'value\n(b)',
      'Current',
      'Value',
    ]);

    const mismatches = corpus.filter((text) => {
      const legacy = LEGACY_HOLDINGS_HEADER.exec(text);
      return findHoldingsHeaderEnd(text) !== (legacy ? legacy.index + legacy[0].length : -1);
    });

    expect(corpus).toHaveLength(37_449);
    expect(mismatches).toEqual([]);
  });
});
