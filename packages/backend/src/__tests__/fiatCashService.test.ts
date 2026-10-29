import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rates: vi.fn(),
  assets: vi.fn(),
  positions: vi.fn(),
  updateAsset: vi.fn(),
  updatePosition: vi.fn(),
}));
vi.mock('../lib/prisma.js', () => ({
  prisma: {
    fxRate: { findMany: mocks.rates },
    asset: { findMany: mocks.assets, update: mocks.updateAsset },
    position: { findMany: mocks.positions, update: mocks.updatePosition },
  },
}));
const { prisma } = await import('../lib/prisma.js');
const { currentFiatCashAsset, projectFiatCashAssets, projectFiatCashPositions, revalueFiatCash } =
  await import('../services/fiatCashService.js');
const cash = {
  id: 'sgd',
  category: 'CASH',
  priceProvider: 'manual',
  symbol: 'SGD',
  nativeCurrency: 'SGD',
  currentPriceUsd: 1 / 1.35,
};
const position = {
  id: 'cash-pile',
  quantity: 25000,
  avgCostUsd: 1 / 1.35,
  marketValueUsd: 25000 / 1.35,
  asset: cash,
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.rates.mockResolvedValue([
    { toCcy: 'SGD', rate: 1.25, timestamp: new Date() },
    { toCcy: 'GBP', rate: 0.8, timestamp: new Date() },
  ]);
  mocks.assets.mockResolvedValue([cash]);
  mocks.positions.mockResolvedValue([position]);
});

describe('fiat cash uses current FX', () => {
  it('revalues existing SGD cash while preserving its units, recorded cost and source object', async () => {
    const [result] = await projectFiatCashPositions([position]);
    expect(result.asset.currentPriceUsd).toBe(0.8);
    expect(result.marketValueUsd).toBe(20000);
    expect(result.quantity).toBe(25000);
    expect(result.avgCostUsd).toBe(1 / 1.35);
    expect(position.asset.currentPriceUsd).toBe(1 / 1.35);
    expect(position.marketValueUsd).toBe(25000 / 1.35);
  });
  it('values GBP from its real rate, and pins USD to one without a rate lookup', async () => {
    expect((await currentFiatCashAsset({ ...cash, symbol: 'GBP' })).currentPriceUsd).toBe(1.25);
    mocks.rates.mockClear();
    expect(
      (await currentFiatCashAsset({ ...cash, symbol: 'USD', currentPriceUsd: 42 })).currentPriceUsd
    ).toBe(1);
    expect(mocks.rates).not.toHaveBeenCalled();
  });
  it('keeps stablecoins, other manual assets and managed IBKR aggregates unchanged', async () => {
    const rows = [
      { ...position, asset: { ...cash, category: 'STABLECOIN' } },
      { ...position, asset: { ...cash, category: 'EQUITY' } },
      { ...position, ibkrCash: { version: 1, netCashUsd: 123 } },
    ];
    expect(await projectFiatCashPositions(rows)).toBe(rows);
    expect(mocks.rates).not.toHaveBeenCalled();
  });
  it.each(
    [
      [],
      [{ toCcy: 'SGD', rate: 0, timestamp: new Date() }],
      [{ toCcy: 'SGD', rate: Infinity, timestamp: new Date() }],
      [{ toCcy: 'SGD', rate: 1.25, timestamp: new Date(Date.now() - 49 * 3600000) }],
      [{ toCcy: 'SGD', rate: 1.25, timestamp: new Date(Date.now() + 10 * 60000) }],
    ].map((rates) => [rates])
  )('refuses missing, invalid, stale and future rates before a cash write', async (rates) => {
    mocks.rates.mockResolvedValue(rates);
    await expect(currentFiatCashAsset(cash)).rejects.toThrow('recent USD/SGD');
    await expect(projectFiatCashPositions([position])).rejects.toThrow('recent USD/SGD');
  });
  it('marks an unavailable catalog quote unpriced without blocking unrelated assets', async () => {
    mocks.rates.mockResolvedValue([]);
    const equity = { ...cash, id: 'equity', category: 'EQUITY' };
    const [missing, untouched] = await projectFiatCashAssets([cash, equity]);
    expect(missing.currentPriceUsd).toBeNull();
    expect(untouched).toBe(equity);
  });
  it('uses the supplied transaction connection instead of acquiring another pool connection', async () => {
    const findMany = vi
      .fn()
      .mockResolvedValue([{ toCcy: 'SGD', rate: 1.5, timestamp: new Date() }]);
    const db = { fxRate: { findMany } } as unknown as NonNullable<
      Parameters<typeof projectFiatCashPositions>[1]
    >;
    const [result] = await projectFiatCashPositions([position], db);
    expect(result.asset.currentPriceUsd).toBe(1 / 1.5);
    expect(findMany).toHaveBeenCalledOnce();
    expect(mocks.rates).not.toHaveBeenCalled();
  });
  it('updates stored current values through the provided transaction without changing quantity or basis', async () => {
    await revalueFiatCash(prisma as Parameters<typeof revalueFiatCash>[0]);
    expect(mocks.updateAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentPriceUsd: 0.8, nativeCurrency: 'SGD' }),
      })
    );
    expect(mocks.updatePosition.mock.calls[0][0].data.marketValueUsd).toBe(20000);
    expect(mocks.updatePosition.mock.calls[0][0].data.unrealizedPnL).toBeCloseTo(
      20000 - 25000 / 1.35,
      8
    );
    expect(mocks.updatePosition.mock.calls[0][0].data.unrealizedPnLPct).toBeCloseTo(8, 10);
    expect(mocks.updatePosition.mock.calls[0][0].data).not.toHaveProperty('quantity');
    expect(mocks.updatePosition.mock.calls[0][0].data).not.toHaveProperty('avgCostUsd');
  });
});
