import { describe, expect, it } from 'vitest';
import { validateIbkrCapture, ibkrYahooSymbol, type IbkrCapture } from '../services/ibkrCapture.js';

import { fictionalIbkrCapture } from './helpers/ibkr.js';

describe('IBKR source completeness', () => {
  it('counts the aggregate once and retains debt, original currencies and FX', () => {
    const { cash } = validateIbkrCapture(fictionalIbkrCapture());
    expect(cash.netCashUsd).toBe(-200);
    expect(cash.balances).toHaveLength(2);
    expect(cash.balances.map((b) => b.currency)).not.toContain('BASE');
    expect(cash.balances[1].cashBalance).toBe(-45000);
  });
  it.each([
    'empty',
    'cash-omission',
    'stock-omission',
    'duplicate-contract',
    'duplicate-currency',
    'changing-shares',
    'changing-cash',
    'stale',
    'future',
    'long-window',
    'missing-usd-rate',
    'unsupported-exchange',
  ])('refuses %s without a partial plan', (kind) => {
    const input = fictionalIbkrCapture();
    switch (kind) {
      case 'empty':
        input.second.positions = [];
        break;
      case 'cash-omission':
        input.first.balances.pop();
        input.second.balances.pop();
        break;
      case 'stock-omission':
        input.first.summary.gross_position_value = 2000;
        input.second.summary.gross_position_value = 2000;
        break;
      case 'duplicate-contract':
        input.first.positions.push(input.first.positions[0]);
        input.second.positions.push(input.second.positions[0]);
        break;
      case 'duplicate-currency':
        input.second.balances.push(input.second.balances[1]);
        break;
      case 'changing-shares':
        input.second.positions[0].position = 21;
        break;
      case 'changing-cash':
        input.second.balances[1].cash_balance = 101;
        break;
      case 'stale':
        input.first.capturedAt = new Date(Date.now() - 16 * 60000).toISOString();
        break;
      case 'future':
        input.second.capturedAt = new Date(Date.now() + 60000).toISOString();
        break;
      case 'long-window':
        input.first.capturedAt = new Date(Date.now() - 4 * 60000).toISOString();
        break;
      case 'missing-usd-rate':
        for (const s of [input.first, input.second]) {
          s.summary.currency = 'SGD';
          s.balances[1].currency = 'SGD';
        }
        break;
      case 'unsupported-exchange':
        for (const s of [input.first, input.second])
          s.positions[0].contract_description = 'TEST @UNKNOWN';
        break;
    }
    expect(() => validateIbkrCapture(input)).toThrow();
  });
  it('maps exchange tickers only when their currencies agree', () => {
    const p = fictionalIbkrCapture().first.positions[0];
    expect(ibkrYahooSymbol({ ...p, contract_description: '000660 @KRX', currency: 'KRW' })).toBe(
      '000660.KS'
    );
    expect(() =>
      ibkrYahooSymbol({ ...p, contract_description: '000660 @KRX', currency: 'USD' })
    ).toThrow();
  });
  it('rejects a finite price whose total cost overflows', () => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second])
      sample.positions[0].average_price = Number.MAX_VALUE;
    expect(() => validateIbkrCapture(input)).toThrow(/numeric range/);
  });
});
