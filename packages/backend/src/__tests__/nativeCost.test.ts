import { describe, expect, it, vi, beforeEach } from 'vitest';
const mocks = vi.hoisted(() => ({ rates: vi.fn() }));
vi.mock('../lib/prisma.js', () => ({ prisma: { fxRate: { findMany: mocks.rates } } }));
const { projectNativeCosts } = await import('../services/nativeCostService.js');
const { nativeCostChange } = await import('../lib/nativeCost.js');

describe('native weighted cost', () => {
  const position = {
    quantity: 10,
    avgCostUsd: 20,
    avgCostNative: 30000,
    costCurrency: 'KRW',
    asset: { currentPriceUsd: 25 },
  };
  beforeEach(() =>
    mocks.rates.mockResolvedValue([{ toCcy: 'KRW', rate: 1500, timestamp: new Date() }])
  );
  it('changes current USD cost and P&L with FX while preserving the native and recorded USD ledger', async () => {
    const before = (await projectNativeCosts([position]))[0];
    mocks.rates.mockResolvedValue([{ toCcy: 'KRW', rate: 1200, timestamp: new Date() }]);
    const after = (await projectNativeCosts([position]))[0];
    expect(before.unrealizedPnL).toBe(50);
    expect(after).toMatchObject({
      avgCostUsd: 25,
      recordedAvgCostUsd: 20,
      avgCostNative: 30000,
      unrealizedPnL: 0,
    });
    expect(position.avgCostUsd).toBe(20);
  });
  it('rejects missing or stale FX and never substitutes an approximate rate', async () => {
    mocks.rates.mockResolvedValue([]);
    await expect(projectNativeCosts([position])).rejects.toThrow('recent USD/KRW');
    mocks.rates.mockResolvedValue([
      { toCcy: 'KRW', rate: 1500, timestamp: new Date(Date.now() - 49 * 3600000) },
    ]);
    await expect(projectNativeCosts([position])).rejects.toThrow('recent USD/KRW');
  });
  it('retains the exact native average on a sale, independent of proceeds', () => {
    const result = nativeCostChange(
      position,
      {},
      { mode: 'reduce', quantity: 3, proceedsUsd: 100, nativeAmount: 150000, fxRateToUsd: 1 / 1500 }
    );
    expect(result.position.avgCostNative).toBe(30000);
    expect(result.history).toMatchObject({ costBasisNative: 90000, proceedsNative: 150000 });
  });
  it('weights a purchase in native currency and validates its captured conversion', () => {
    const result = nativeCostChange(
      position,
      {},
      { mode: 'add', quantity: 5, totalCostUsd: 50, nativeAmount: 75000, fxRateToUsd: 1 / 1500 }
    );
    expect(result.position.avgCostNative).toBe(25000);
    expect(() =>
      nativeCostChange(
        position,
        {},
        { mode: 'add', quantity: 5, totalCostUsd: 99, nativeAmount: 75000, fxRateToUsd: 1 / 1500 }
      )
    ).toThrow('do not match');
    expect(() =>
      nativeCostChange(position, {}, { mode: 'add', quantity: 5, totalCostUsd: 50 })
    ).toThrow('native purchase amount');
  });
  it('does not manufacture a native baseline from a legacy USD average', () => {
    expect(() =>
      nativeCostChange(
        { quantity: 10 },
        {},
        { mode: 'add', quantity: 5, totalCostUsd: 50, nativeAmount: 75000, fxRateToUsd: 1 / 1500 }
      )
    ).toThrow('Reconcile');
  });
});
