import { expect, it } from 'vitest';
import { matchesNativeReadback } from '../services/nativeReconciliationService.js';

it('accepts machine rounding in new native fields while keeping existing USD history exact', () => {
  type Before = Parameters<typeof matchesNativeReadback>[0];
  const history = {
    id: 'h',
    userId: 'u',
    positionId: 'p',
    assetId: 'a',
    mode: 'add',
    quantity: 20,
    costBasisUsd: 100.00000000000001,
    previousQuantity: 10,
    previousAvgCostUsd: 1.5,
    previousTotalCostUsd: 15,
    nextQuantity: 30,
    nextAvgCostUsd: 3.8333333333333335,
    nextTotalCostUsd: 115,
    proceedsUsd: null,
    operationId: null,
    createdAt: '2026-06-23T02:00:00.000Z',
    costCurrency: null,
    costBasisNative: null,
    previousAvgCostNative: null,
    nextAvgCostNative: null,
    proceedsNative: null,
    fxRateToUsd: null,
    executionPriceNative: null,
    feesNative: null,
    brokerOrderId: null,
  };
  const before: Before = {
    id: 'p',
    userId: 'u',
    assetId: 'a',
    quantity: 30,
    avgCostUsd: 3.8333333333333335,
    avgCostNative: null,
    costCurrency: null,
    custodyOf: null,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    notes: null,
    createdAt: '2026-06-23T01:00:00.000Z',
    history: [history],
    asset: {
      id: 'a',
      symbol: 'TEST.KS',
      category: 'EQUITY',
      nativeCurrency: 'KRW',
      priceProvider: 'yahoo',
      providerAssetId: 'TEST.KS',
    },
  };
  const patch = {
    costCurrency: 'KRW',
    costBasisNative: 10000000,
    previousAvgCostNative: 300000,
    nextAvgCostNative: 334533.93333333335,
    proceedsNative: null,
    fxRateToUsd: null,
    executionPriceNative: 500000,
    feesNative: 10,
    brokerOrderId: 'order',
  };
  const plan = {
    positionPatch: { costCurrency: 'KRW', avgCostNative: 334533.93333333335 },
    historyPatches: [{ id: 'h', patch }],
    initialHistory: null,
  };
  const actual: Before = {
    ...before,
    ...plan.positionPatch,
    history: [{ ...history, ...patch, nextAvgCostNative: 334533.9333333333 }],
  };
  expect(matchesNativeReadback(actual, before, plan)).toBe(true);
  const altered = structuredClone(actual);
  altered.history[0].costBasisUsd = 100;
  expect(matchesNativeReadback(altered, before, plan)).toBe(false);
  altered.history[0].costBasisUsd = history.costBasisUsd;
  altered.history[0].nextAvgCostNative = 334533.94;
  expect(matchesNativeReadback(altered, before, plan)).toBe(false);
  altered.history[0].nextAvgCostNative = actual.history[0].nextAvgCostNative;
  altered.history[0].quantity = 21;
  expect(matchesNativeReadback(altered, before, plan)).toBe(false);
});
