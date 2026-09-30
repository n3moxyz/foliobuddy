import { describe, expect, it } from 'vitest';
import {
  planNativeReconciliation,
  reconciliationInputSchema,
} from '../services/nativeCostReconciliation.js';

const orders = [
  {
    orderId: 'a',
    timestamp: '2026-06-23T02:00:00Z',
    side: 'BUY' as const,
    quantity: 10,
    price: 100,
    portfolioFees: 1,
    statementFees: 1.09,
  },
  {
    orderId: 'b',
    timestamp: '2026-06-25T02:00:00Z',
    side: 'BUY' as const,
    quantity: 10,
    price: 200,
    portfolioFees: 2,
    statementFees: 2.18,
  },
  {
    orderId: 'c',
    timestamp: '2026-09-08T02:00:00Z',
    side: 'SELL' as const,
    quantity: 5,
    price: 170,
    portfolioFees: 1,
    statementFees: 2,
  },
];
const history = [
  {
    id: 'add',
    mode: 'add',
    quantity: 10,
    previousQuantity: 10,
    previousAvgCostUsd: 1,
    previousTotalCostUsd: 10,
    nextQuantity: 20,
    nextAvgCostUsd: 1.5,
    nextTotalCostUsd: 30,
    createdAt: new Date('2026-06-25T04:00:00Z'),
  },
  {
    id: 'reduce',
    mode: 'reduce',
    quantity: 5,
    previousQuantity: 20,
    previousAvgCostUsd: 1.5,
    previousTotalCostUsd: 30,
    nextQuantity: 15,
    nextAvgCostUsd: 1.5,
    nextTotalCostUsd: 22.5,
    createdAt: new Date('2026-09-08T04:00:00Z'),
  },
];
const position = {
  id: 'position',
  assetId: 'asset',
  quantity: 15,
  avgCostUsd: 1.5,
  createdAt: new Date('2026-06-23T02:30:00Z'),
};
const input = {
  symbol: 'TEST.KS',
  quantity: 15,
  recordedAvgCostUsd: 1.5,
  currency: 'KRW' as const,
  avgCostNative: 150.15,
  orders,
};

describe('native reconciliation preflight', () => {
  it('reproduces weighted average, retains USD ledger, and reconstructs a missing original buy', () => {
    const original = structuredClone(history);
    const plan = planNativeReconciliation(position, history, input);
    expect(plan.positionPatch).toEqual({ avgCostNative: 150.15, costCurrency: 'KRW' });
    expect(plan.initialHistory).toMatchObject({
      quantity: 10,
      nextAvgCostUsd: 1,
      executionPriceNative: 100,
      fxRateToUsd: null,
    });
    expect(plan.historyPatches[1].patch).toMatchObject({
      previousAvgCostNative: 150.15,
      nextAvgCostNative: 150.15,
      proceedsNative: 848,
      feesNative: 2,
      costBasisNative: 750.75,
      fxRateToUsd: null,
    });
    expect(history).toEqual(original);
    expect(plan.historyPatches.every((p) => !('costBasisUsd' in p.patch))).toBe(true);
  });
  it('refuses changed positions, incomplete orders, incorrect dates and reset histories', () => {
    expect(() => planNativeReconciliation({ ...position, quantity: 14 }, history, input)).toThrow(
      'quantity changed'
    );
    expect(() =>
      planNativeReconciliation(position, history, { ...input, avgCostNative: 149 })
    ).toThrow('do not reproduce');
    expect(() =>
      planNativeReconciliation(
        position,
        [{ ...history[0], createdAt: new Date('2026-07-01') }, history[1]],
        input
      )
    ).toThrow('activity date differs');
    expect(() =>
      planNativeReconciliation(position, [{ ...history[0], mode: 'reset' }, history[1]], input)
    ).toThrow('Reset history');
    expect(() =>
      planNativeReconciliation(position, history, {
        ...input,
        orders: [orders[0], orders[0], orders[2]],
      })
    ).toThrow('Duplicate');
  });
  it('validates input numbers and broker IDs before any database work', () => {
    expect(() =>
      reconciliationInputSchema.parse({
        capturedAt: '2026-09-30T00:00:00Z',
        positions: [{ ...input, avgCostNative: Infinity }],
      })
    ).toThrow();
  });
});
