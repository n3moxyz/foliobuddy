import { describe, it, expect } from 'vitest';
import { parseFsmOneStatement } from '../services/statementParsers/fsmOne.js';

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
    expect(h.isin).toBe('');
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
});
