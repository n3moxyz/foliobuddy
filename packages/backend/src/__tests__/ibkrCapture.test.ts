import { describe, expect, it } from 'vitest';
import { validateIbkrCapture, ibkrYahooSymbol } from '../services/ibkrCapture.js';

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
  it('preserves the latest broker total and native balances despite asynchronous FX quotes', () => {
    const input = fictionalIbkrCapture();
    input.first.balances[0].cash_balance = -198.8;
    input.second.balances[0].cash_balance = -198.4;
    // The separately read summary can also move beyond the two ledger readings.
    input.first.summary.total_cash_value = -198.5;
    input.second.summary.total_cash_value = -197.8;
    const original = structuredClone(input);
    const { cash } = validateIbkrCapture(input);
    expect(cash.baseCash).toBe(-198.4);
    expect(cash.netCashUsd).toBe(-198.4);
    expect(cash.capturedAt).toBe(input.second.capturedAt);
    expect(cash.balances).toEqual([
      { currency: 'USD', cashBalance: 100, fxRateToUsd: 1 },
      { currency: 'JPY', cashBalance: -45000, fxRateToUsd: 1 / 150 },
    ]);
    expect(input).toEqual(original);
  });
  it('accepts summary movement across the observed BASE range plus the FX allowance', () => {
    const input = fictionalIbkrCapture();
    input.second.balances[2].exchange_rate = 1 / 149;
    for (const sample of [input.first, input.second]) {
      const nativeSum = sample.balances
        .slice(1)
        .reduce((sum, b) => sum + b.cash_balance * b.exchange_rate, 0);
      sample.balances[0].cash_balance = nativeSum + 0.075;
    }
    for (const sample of [input.first, input.second])
      sample.summary.total_cash_value = input.second.balances[0].cash_balance;
    expect(validateIbkrCapture(input).cash.netCashUsd).toBe(input.second.balances[0].cash_balance);
    input.first.summary.total_cash_value =
      Math.min(input.first.balances[0].cash_balance, input.second.balances[0].cash_balance) - 4;
    expect(() => validateIbkrCapture(input)).toThrow(/cash summary/);
  });
  it('refuses large unexplained differences instead of treating all differences as FX', () => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second]) {
      sample.balances[0].cash_balance += 4;
      sample.summary.total_cash_value = sample.balances[0].cash_balance;
    }
    expect(() => validateIbkrCapture(input)).toThrow(/does not tally with BASE/);
  });
  it.each([1, -1])(
    'uses gross foreign cash exposure when offsetting balances net to zero (%s)',
    (sign) => {
      const input = fictionalIbkrCapture();
      for (const sample of [input.first, input.second]) {
        sample.balances[1].cash_balance = 0;
        sample.balances.push({
          currency: 'SGD',
          cash_balance: 400,
          exchange_rate: 0.75,
          stock_market_value: 0,
        });
        sample.balances[0].cash_balance = 5 * sign;
        sample.summary.total_cash_value = 5 * sign;
      }
      expect(validateIbkrCapture(input).cash.netCashUsd).toBe(5 * sign);
    }
  );
  it.each([100, 1e10])('does not give base-currency cash an FX allowance (%s)', (amount) => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second]) {
      sample.balances = sample.balances.slice(0, 2);
      sample.balances[1].cash_balance = amount;
      sample.balances[0].cash_balance = amount + 0.11;
      sample.summary.total_cash_value = amount + 0.11;
    }
    expect(() => validateIbkrCapture(input)).toThrow(/does not tally with BASE/);
  });
  it.each(['USD', 'BASE'])('rejects an invalid %s base conversion rate', (currency) => {
    const input = fictionalIbkrCapture();
    input.first.balances.find((b) => b.currency === currency)!.exchange_rate = 1.01;
    expect(() => validateIbkrCapture(input)).toThrow(/base currency exchange rate/);
  });
  it('keeps broker BASE authoritative when the account base is not USD', () => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second]) {
      sample.summary.currency = 'SGD';
      sample.summary.gross_position_value = 1350;
      sample.summary.total_cash_value = -268.2;
      sample.balances[0].cash_balance = -268.5;
      sample.balances[0].stock_market_value = 1350;
      sample.balances[1].exchange_rate = 1.35;
      sample.balances[2].exchange_rate = 1.35 / 150;
    }
    const { cash } = validateIbkrCapture(input);
    expect(cash.baseCurrency).toBe('SGD');
    expect(cash.baseCash).toBe(-268.5);
    expect(cash.netCashUsd).toBe(-268.5 / 1.35);
    expect(cash.balances[1].cashBalance).toBe(-45000);
    expect(cash.balances[1].fxRateToUsd).toBe(1.35 / 150 / 1.35);
  });
  it('rejects overflow in the aggregate FX allowance even when each conversion is finite', () => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second]) {
      sample.balances[2].cash_balance = -1e308;
      sample.balances[2].exchange_rate = 1;
      sample.balances.push({
        currency: 'SGD',
        cash_balance: 1e308,
        exchange_rate: 1,
        stock_market_value: 0,
      });
    }
    expect(() => validateIbkrCapture(input)).toThrow(/numeric range/);
  });
});
