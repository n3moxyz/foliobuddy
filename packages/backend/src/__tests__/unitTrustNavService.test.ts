import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  findAsset: vi.fn(),
  findAssets: vi.fn(),
  updateAsset: vi.fn(),
  failAsset: vi.fn(),
  history: vi.fn(),
  findPositions: vi.fn(),
  updatePosition: vi.fn(),
  fx: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock('../lib/prisma.js', () => {
  const tx = {
    asset: {
      findUniqueOrThrow: mocks.findAsset,
      findMany: mocks.findAssets,
      update: mocks.updateAsset,
      updateMany: mocks.failAsset,
    },
    priceHistory: { upsert: mocks.history },
    position: { findMany: mocks.findPositions, update: mocks.updatePosition },
    fxRate: { findUnique: mocks.fx },
  };
  return {
    prisma: {
      ...tx,
      $transaction: (work: (client: typeof tx) => unknown, options: unknown) => {
        mocks.transaction(options);
        return work(tx);
      },
    },
  };
});
vi.mock('../lib/logger.js', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
const {
  saveAutomaticNav,
  saveManualNav,
  recordNavFailure,
  configureKnownUnitTrusts,
  revalueNativeNavs,
  navTransaction,
} = await import('../services/unitTrustNavService.js');
const now = new Date('2026-09-10T12:00:00Z');
const day = new Date('2026-09-09T00:00:00Z');
const asset = {
  id: 'amova',
  category: 'UNIT_TRUST',
  priceProvider: 'fund-manager',
  providerAssetId: 'SG9999004360',
  isin: 'SG9999004360',
  nativeCurrency: 'SGD',
  priceAsOf: day,
  priceSource: 'fund-manager',
  currentPriceNative: 6.0462,
  currentPriceUsd: 6.0462 / 1.25,
  priceCheckedAt: null,
};
const quote = {
  asOf: day,
  priceUsd: 999,
  nativePrice: 6.0462,
  nativeCurrency: 'SGD',
  isin: 'SG9999004360',
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mocks.findAsset.mockResolvedValue(asset);
  mocks.findAssets.mockResolvedValue([asset]);
  mocks.updateAsset.mockImplementation(({ data }) => ({ ...asset, ...data }));
  mocks.fx.mockResolvedValue({ rate: 1.25, timestamp: now });
  mocks.findPositions.mockResolvedValue([
    { id: 'fsm', quantity: 12.345, avgCostUsd: 3 },
    { id: 'uob', quantity: 23.456, avgCostUsd: 3 },
  ]);
});
afterEach(() => vi.useRealTimers());

describe('unit-trust NAV persistence', () => {
  it('values both broker rows from the exact native quote using current FX, in one serializable transaction', async () => {
    const result = await saveAutomaticNav('amova', quote, 'fund-manager', now);
    expect(result.currentPriceUsd).toBe(6.0462 / 1.25);
    expect(result.priceAsOf).toEqual(day);
    expect(result.priceCheckedAt).toEqual(now);
    expect(mocks.transaction).toHaveBeenCalledWith({ isolationLevel: 'Serializable' });
    expect(mocks.updatePosition).toHaveBeenCalledTimes(2);
    mocks.updatePosition.mock.calls.forEach(([arg], index) =>
      expect(arg.data.marketValueUsd).toBeCloseTo(([12.345, 23.456][index] * 6.0462) / 1.25, 10)
    );
  });
  it('revalues an unchanged same-date native NAV when FX changes, using the same history key', async () => {
    await saveAutomaticNav('amova', quote, 'fund-manager', now);
    const key = mocks.history.mock.calls[0][0].where;
    mocks.fx.mockResolvedValue({ rate: 1.4, timestamp: now });
    const updated = await saveAutomaticNav(
      'amova',
      quote,
      'fund-manager',
      new Date(now.getTime() + 1000)
    );
    expect(updated.currentPriceNative).toBe(6.0462);
    expect(updated.currentPriceUsd).toBe(6.0462 / 1.4);
    expect(updated.priceAsOf).toEqual(day);
    expect(mocks.history.mock.calls[1][0].where).toEqual(key);
  });
  it.each([
    { ...quote, asOf: new Date('2026-09-08Z') },
    { ...quote, asOf: new Date('2026-09-11Z') },
    { ...quote, asOf: null },
    { ...quote, nativePrice: -1 },
    { ...quote, nativePrice: Infinity },
    { ...quote, nativePrice: NaN },
    { ...quote, nativeCurrency: 'USD' },
    { ...quote, isin: 'wrong' },
  ])(
    'rejects invalid, older, future, or wrong-class quotes %# before mutating last-good data',
    async (invalid) => {
      await expect(saveAutomaticNav('amova', invalid, 'fund-manager', now)).rejects.toThrow();
      expect(mocks.updateAsset).not.toHaveBeenCalled();
      expect(mocks.history).not.toHaveBeenCalled();
    }
  );
  it('does not use a missing/stale FX fallback to certify a NAV', async () => {
    for (const fx of [
      null,
      { rate: 0, timestamp: now },
      { rate: 1.3, timestamp: new Date('2026-09-01Z') },
    ]) {
      mocks.fx.mockResolvedValue(fx);
      await expect(saveAutomaticNav('amova', quote, 'fund-manager', now)).rejects.toThrow();
    }
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
  it('retains automatic ownership/price while writing statement observations under their own source key', async () => {
    expect(await saveManualNav('amova', 4, day.toISOString(), 'user')).toEqual(asset);
    expect(mocks.history.mock.calls[0][0].where.assetId_timestamp_source.source).toBe('manual');
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
  it('allows a dated initial manual fallback while an automatic source is unavailable', async () => {
    mocks.findAsset.mockResolvedValue({ ...asset, priceSource: null, priceAsOf: null });
    const result = await saveManualNav('amova', 4, day.toISOString(), 'user');
    expect(result.priceProvider).toBe('fund-manager');
    expect(result.priceSource).toBe('manual');
    expect(result.currentPriceNative).toBe(4);
  });
  it('records failures without rewriting the source date or valuation', async () => {
    await recordNavFailure('amova', now, 'failed');
    expect(mocks.failAsset.mock.calls[0][0].data).toEqual({
      priceCheckedAt: now,
      priceCheckStatus: 'error',
    });
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
  it('is idempotent and quarantines duplicate identities without disabling the configured feed', async () => {
    expect(await configureKnownUnitTrusts(true)).toEqual([]);
    mocks.findAssets.mockResolvedValue([
      asset,
      { ...asset, id: 'duplicate', priceProvider: 'manual' },
    ]);
    expect(await configureKnownUnitTrusts(true)).toEqual([
      { assetId: 'duplicate', isin: asset.isin, action: 'conflict: reconcile identity' },
    ]);
    expect(mocks.updateAsset).not.toHaveBeenCalled();
  });
  it('accepts a same-day correction over a legacy intraday timestamp', async () => {
    mocks.findAsset.mockResolvedValue({ ...asset, priceAsOf: new Date('2026-09-09T12:00:00Z') });
    expect((await saveAutomaticNav('amova', quote, 'fund-manager', now)).priceAsOf).toEqual(day);
    mocks.findAsset.mockResolvedValue({
      ...asset,
      priceProvider: 'manual',
      priceSource: 'manual',
      priceAsOf: new Date('2026-09-09T12:00:00Z'),
    });
    expect((await saveManualNav('amova', 6.1, day.toISOString(), 'user')).currentPriceNative).toBe(
      6.1
    );
  });
  it('reports invalid user-supplied dates as a validation error before writing', async () => {
    await expect(saveManualNav('amova', 6.1, '2099-01-01T00:00:00Z', 'user')).rejects.toMatchObject(
      { statusCode: 400 }
    );
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it('keeps valid FX revaluation running when an invalid legacy currency is present', async () => {
    mocks.findAssets.mockResolvedValue([{ ...asset, id: 'invalid', nativeCurrency: 'EUR' }, asset]);
    mocks.fx.mockResolvedValue({ rate: 1.4, timestamp: now });
    expect(await navTransaction((tx) => revalueNativeNavs(tx))).toEqual(['amova']);
    expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
    expect(mocks.updatePosition).toHaveBeenCalledTimes(2);
  });
  it('quarantines an overflowing position before any writes while healthy NAVs are revalued', async () => {
    mocks.findAssets.mockResolvedValue([
      { ...asset, id: 'overflow', currentPriceNative: 1.5 },
      asset,
    ]);
    mocks.fx.mockResolvedValue({ rate: 1.24, timestamp: now });
    mocks.findPositions.mockImplementation(({ where }) =>
      where.assetId === 'overflow'
        ? [{ id: 'too-large', quantity: 1.49e308, avgCostUsd: 1.2 }]
        : [{ id: 'healthy', quantity: 100, avgCostUsd: 3 }]
    );
    expect(await navTransaction((tx) => revalueNativeNavs(tx))).toEqual(['amova']);
    expect(mocks.updateAsset).toHaveBeenCalledTimes(1);
    expect(mocks.updateAsset.mock.calls[0][0].where.id).toBe('amova');
    expect(mocks.updatePosition).toHaveBeenCalledTimes(1);
    expect(mocks.updatePosition.mock.calls[0][0].where.id).toBe('healthy');
  });
});
