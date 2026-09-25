import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mockPrisma = {
  asset: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  fxRate: { findUnique: vi.fn() },
  position: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  $transaction: vi.fn(async (work) => work(mockPrisma)),
  priceHistory: {
    create: vi.fn(),
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
};

const mockPriceService = {
  getProvider: vi.fn(),
  getDirectPrice: vi.fn(),
  updatePositionValues: vi.fn(),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/priceService.js', () => ({ priceService: mockPriceService }));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { default: assetsRouter } = await import('../../routes/assets.js');
const { MAX_ASSET_NAME_LENGTH, MAX_ASSET_SYMBOL_LENGTH } = await import('../../lib/constants.js');
const app = createTestApp(assetsRouter, '/api/assets');

it('rejects import-time changes to currency or provider identity after a native NAV is established', async () => {
  mockPrisma.asset.findFirst.mockResolvedValue(
    mockManualAsset({ nativeCurrency: 'SGD', currentPriceNative: 1.2345 })
  );
  const response = await request(app).post('/api/assets/from-provider').send({
    provider: 'manual',
    providerAssetId: 'ut-test',
    symbol: 'UTTEST',
    name: 'Unit Trust Test',
    category: 'UNIT_TRUST',
    nativeCurrency: 'EUR',
  });
  expect(response.status).toBe(409);
  expect(mockPrisma.asset.update).not.toHaveBeenCalled();
});

it('rejects future manual NAV dates with a useful validation response', async () => {
  mockPrisma.asset.findUnique.mockResolvedValue(mockManualAsset());
  mockPrisma.position.findFirst.mockResolvedValue({ id: 'position-1' });
  const response = await request(app)
    .patch('/api/assets/asset-1/nav')
    .send({ navPrice: 1.2, asOfDate: '2099-01-01T00:00:00Z' });
  expect(response.status).toBe(400);
  expect(response.body.error).toContain('NAV date');
  expect(mockPrisma.priceHistory.upsert).not.toHaveBeenCalled();
});

function mockManualAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'asset-1',
    coingeckoId: null,
    priceProvider: 'manual',
    providerAssetId: 'ut-test',
    nativeCurrency: 'USD',
    exchange: null,
    factsheetUrl: null,
    isin: null,
    symbol: 'UTTEST',
    name: 'Unit Trust Test',
    category: 'UNIT_TRUST',
    currentPriceUsd: 1,
    priceUpdatedAt: new Date('2026-04-01T00:00:00.000Z'),
    createdAt: new Date('2026-04-01T00:00:00.000Z'),
    updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ADMIN_USER_IDS;
  mockPriceService.updatePositionValues.mockResolvedValue(undefined);
  mockPrisma.asset.findUniqueOrThrow.mockImplementation((args) =>
    mockPrisma.asset.findUnique(args)
  );
  mockPrisma.position.findMany.mockResolvedValue([
    { id: 'position-1', quantity: 10, avgCostUsd: 1 },
  ]);
});

describe('POST /api/assets', () => {
  it('creates a manually-priced fiat cash asset with an initial USD price', async () => {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({
      id: 'asset-cash',
      coingeckoId: data.coingeckoId ?? null,
      priceProvider: data.priceProvider ?? 'coingecko',
      providerAssetId: data.providerAssetId ?? null,
      nativeCurrency: data.nativeCurrency ?? 'USD',
      exchange: data.exchange ?? null,
      factsheetUrl: null,
      isin: null,
      symbol: data.symbol,
      name: data.name,
      category: data.category,
      currentPriceUsd: data.currentPriceUsd,
      priceUpdatedAt: data.priceUpdatedAt,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    }));

    const res = await request(app).post('/api/assets').send({
      symbol: 'SGD',
      name: 'Cash SGD',
      category: 'CASH',
      priceProvider: 'manual',
      nativeCurrency: 'SGD',
      currentPriceUsd: 0.742,
    });

    expect(res.status).toBe(201);
    expect(mockPriceService.getDirectPrice).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: 'SGD',
        name: 'Cash SGD',
        category: 'CASH',
        priceProvider: 'manual',
        nativeCurrency: 'SGD',
        currentPriceUsd: 0.742,
        priceUpdatedAt: expect.any(Date),
      }),
    });
  });
});

describe('asset name and symbol caps', () => {
  const tooLongName = 'N'.repeat(MAX_ASSET_NAME_LENGTH + 1);

  function echoCreatedAsset() {
    mockPrisma.asset.findFirst.mockResolvedValue(null);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'asset-new', ...data }));
  }

  it.each([
    ['/api/assets', { symbol: 'LONG', category: 'EQUITY', priceProvider: 'manual' }],
    [
      '/api/assets/from-provider',
      { provider: 'yahoo', providerAssetId: 'LONG', symbol: 'LONG', category: 'EQUITY' },
    ],
    ['/api/assets/unit-trust', { symbol: 'LONGUT' }],
    ['/api/assets/from-coingecko', { coingeckoId: 'long-coin', symbol: 'LONG' }],
  ])('rejects over-long and blank names on %s before touching the catalog', async (path, body) => {
    const tooLong = await request(app)
      .post(path)
      .send({ ...body, name: tooLongName });
    const blank = await request(app)
      .post(path)
      .send({ ...body, name: '   ' });

    expect(tooLong.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(mockPrisma.asset.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('trims names and accepts exactly the cap', async () => {
    echoCreatedAsset();
    const name = 'N'.repeat(MAX_ASSET_NAME_LENGTH);

    const res = await request(app)
      .post('/api/assets')
      .send({
        symbol: 'CAP',
        name: `  ${name}  `,
        category: 'EQUITY',
        priceProvider: 'manual',
        currentPriceUsd: 1,
      });

    expect(res.status).toBe(201);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name }),
    });
  });

  it('validates from-coingecko input, which previously had no schema', async () => {
    const valid = { coingeckoId: 'long-coin', symbol: 'LONG', name: 'Long Coin' };
    const missingName = await request(app)
      .post('/api/assets/from-coingecko')
      .send({ ...valid, name: undefined });
    const badCategory = await request(app)
      .post('/api/assets/from-coingecko')
      .send({ ...valid, category: 'NOT_A_CATEGORY' });
    const tooLongSymbol = await request(app)
      .post('/api/assets/from-coingecko')
      .send({ ...valid, symbol: 'S'.repeat(MAX_ASSET_SYMBOL_LENGTH + 1) });
    const nonStringSymbol = await request(app)
      .post('/api/assets/from-coingecko')
      .send({ ...valid, symbol: { toUpperCase: 'x' } });

    expect([missingName, badCategory, tooLongSymbol, nonStringSymbol].map((r) => r.status)).toEqual(
      [400, 400, 400, 400]
    );
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('accepts CoinGecko tickers longer than the manual-entry limit and defaults the category', async () => {
    echoCreatedAsset();
    const symbol = 'harrypotterobamasonic10inu';

    const res = await request(app).post('/api/assets/from-coingecko').send({
      coingeckoId: 'hpos10i',
      symbol,
      name: '  HarryPotterObamaSonic10Inu  ',
      skipPriceFetch: true,
    });

    expect(res.status).toBe(201);
    expect(mockPriceService.getDirectPrice).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        symbol: symbol.toUpperCase(),
        name: 'HarryPotterObamaSonic10Inu',
        category: 'LIQUID_CRYPTO',
      }),
    });
  });
});

describe('POST /api/assets/from-provider', () => {
  it('updates stale native currency metadata on an existing Yahoo asset', async () => {
    const existing = mockManualAsset({
      id: 'asset-oslo',
      priceProvider: 'yahoo',
      providerAssetId: 'ENH.OL',
      symbol: 'ENH.OL',
      name: 'FED Energy Holdings ASA',
      category: 'EQUITY',
      nativeCurrency: 'USD',
      exchange: null,
    });
    const updated = {
      ...existing,
      nativeCurrency: 'NOK',
      exchange: 'Oslo Stock Exchange',
    };

    mockPrisma.asset.findFirst.mockResolvedValue(existing);
    mockPrisma.asset.update.mockResolvedValue(updated);

    const res = await request(app).post('/api/assets/from-provider').send({
      provider: 'yahoo',
      providerAssetId: 'ENH.OL',
      symbol: 'ENH.OL',
      name: 'FED Energy Holdings ASA',
      category: 'EQUITY',
      nativeCurrency: 'NOK',
      exchange: 'Oslo Stock Exchange',
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-oslo' },
      data: {
        nativeCurrency: 'NOK',
        exchange: 'Oslo Stock Exchange',
      },
    });
    expect(mockPriceService.getProvider).not.toHaveBeenCalled();
    expect(res.body.nativeCurrency).toBe('NOK');
  });
});

describe('GET /api/assets/:id', () => {
  it('filters included positions to the authenticated user', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(mockManualAsset({ positions: [] }));

    const res = await request(app).get('/api/assets/asset-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      include: {
        positions: {
          where: { userId: 'test-user-id' },
        },
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 30,
        },
      },
    });
  });
});

describe('PUT /api/assets/:id', () => {
  it('requires admin access for global catalog edits', async () => {
    const res = await request(app).put('/api/assets/asset-1').send({ name: 'Renamed' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
  });

  describe('as an admin', () => {
    const pricedFund = () =>
      mockManualAsset({
        priceProvider: 'fund-manager',
        providerAssetId: 'SG9999004360',
        isin: 'SG9999004360',
        nativeCurrency: 'SGD',
        currentPriceNative: 6.0462,
        currentPriceUsd: 4.32,
        priceSource: 'fund-manager',
      });

    beforeEach(() => {
      process.env.ADMIN_USER_IDS = 'test-user-id';
      mockPrisma.asset.update.mockImplementation(async ({ data }) => ({
        ...pricedFund(),
        ...data,
      }));
    });

    it.each([
      ['nativeCurrency', { nativeCurrency: 'USD' }],
      ['priceProvider', { priceProvider: 'manual' }],
      ['providerAssetId', { providerAssetId: 'SG9999004361' }],
      ['category', { category: 'EQUITY' }],
    ])('rejects a %s change behind a stored native NAV without writing', async (_field, body) => {
      mockPrisma.asset.findUnique.mockResolvedValue(pricedFund());

      const res = await request(app)
        .put('/api/assets/asset-1')
        .send({ name: 'Amova renamed', ...body });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('cannot change');
      expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    });

    it('allows cosmetic metadata and unchanged identity on a priced fund', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(pricedFund());

      const res = await request(app).put('/api/assets/asset-1').send({
        name: 'Amova Singapore Equity Fund - SGD Class',
        symbol: 'amovasin',
        officialDomain: 'https://sg.amova-am.com/general/funds',
        nativeCurrency: 'SGD',
        providerAssetId: 'SG9999004360',
        category: 'UNIT_TRUST',
      });

      expect(res.status).toBe(200);
      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          name: 'Amova Singapore Equity Fund - SGD Class',
          symbol: 'AMOVASIN',
          officialDomain: 'amova-am.com',
          nativeCurrency: 'SGD',
        }),
      });
      const written = mockPrisma.asset.update.mock.calls[0][0].data;
      expect(written).not.toHaveProperty('currentPriceNative');
      expect(written).not.toHaveProperty('currentPriceUsd');
      expect(res.body.currentPriceNative).toBe(6.0462);
    });

    it('still lets identity change on an asset with no stored native NAV', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(
        mockManualAsset({ nativeCurrency: 'SGD', currentPriceNative: null })
      );

      const res = await request(app).put('/api/assets/asset-1').send({ nativeCurrency: 'USD' });

      expect(res.status).toBe(200);
      expect(mockPrisma.asset.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: expect.objectContaining({ nativeCurrency: 'USD' }),
      });
    });

    it('returns 404 for an unknown asset without writing', async () => {
      mockPrisma.asset.findUnique.mockResolvedValue(null);

      const res = await request(app).put('/api/assets/missing').send({ name: 'x' });

      expect(res.status).toBe(404);
      expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    });
  });
});

describe('DELETE /api/assets/:id', () => {
  it('requires admin access before checking or deleting global catalog rows', async () => {
    const res = await request(app).delete('/api/assets/asset-1');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Admin access required');
    expect(mockPrisma.position.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.asset.delete).not.toHaveBeenCalled();
  });
});

describe('POST /api/assets/:id/refresh-price', () => {
  it('rejects refresh when the user does not hold the asset', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(
      mockManualAsset({ priceProvider: 'yahoo', providerAssetId: 'AAPL' })
    );
    mockPrisma.position.findFirst.mockResolvedValue(null);

    const res = await request(app).post('/api/assets/asset-1/refresh-price');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You do not hold this asset');
    expect(mockPrisma.position.findFirst).toHaveBeenCalledWith({
      where: { userId: 'test-user-id', assetId: 'asset-1' },
      select: { id: true },
    });
    expect(mockPriceService.getProvider).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/assets/:id/nav', () => {
  it('rejects NAV updates when the authenticated user does not hold the asset', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(mockManualAsset());
    mockPrisma.position.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/assets/asset-1/nav')
      .send({ navPrice: 1.25, asOfDate: '2026-04-20T00:00:00.000Z' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('You do not hold this asset');
    expect(mockPrisma.priceHistory.upsert).not.toHaveBeenCalled();
    expect(mockPriceService.updatePositionValues).not.toHaveBeenCalled();
  });

  it('upserts a NAV entry, updates the asset from latest history, and recalculates positions', async () => {
    const timestamp = new Date('2026-04-20T00:00:00.000Z');
    const latestNav = {
      id: 'price-1',
      assetId: 'asset-1',
      priceUsd: 1.25,
      nativePrice: 1.25,
      nativeCurrency: 'USD',
      fxRateToUsd: null,
      source: 'manual',
      updatedBy: 'test-user-id',
      timestamp,
    };
    const updatedAsset = mockManualAsset({
      currentPriceUsd: latestNav.priceUsd,
      priceUpdatedAt: latestNav.timestamp,
    });

    mockPrisma.asset.findUnique.mockResolvedValue(mockManualAsset());
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'position-1' });
    mockPrisma.priceHistory.upsert.mockResolvedValue(latestNav);
    mockPrisma.priceHistory.findFirst.mockResolvedValue(latestNav);
    mockPrisma.asset.update.mockResolvedValue(updatedAsset);

    const res = await request(app)
      .patch('/api/assets/asset-1/nav')
      .send({ navPrice: 1.25, asOfDate: timestamp.toISOString() });

    expect(res.status).toBe(200);
    expect(mockPrisma.priceHistory.upsert).toHaveBeenCalledWith({
      where: { assetId_timestamp_source: { assetId: 'asset-1', timestamp, source: 'manual' } },
      update: expect.objectContaining({
        priceUsd: 1.25,
        nativePrice: 1.25,
        nativeCurrency: 'USD',
        updatedBy: 'test-user-id',
      }),
      create: expect.objectContaining({
        assetId: 'asset-1',
        priceUsd: 1.25,
        nativePrice: 1.25,
        timestamp,
      }),
    });
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: expect.objectContaining({
        currentPriceUsd: 1.25,
        priceUpdatedAt: timestamp,
        priceAsOf: timestamp,
        currentPriceNative: 1.25,
      }),
    });
    expect(mockPrisma.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: { marketValueUsd: 12.5, unrealizedPnL: 2.5, unrealizedPnLPct: 25 },
    });
  });

  it('does not regress the current asset price when backfilling an older NAV', async () => {
    const olderTimestamp = new Date('2026-04-10T00:00:00.000Z');
    const latestTimestamp = new Date('2026-04-20T00:00:00.000Z');
    const latestNav = {
      id: 'price-newer',
      assetId: 'asset-1',
      priceUsd: 1.4,
      nativePrice: 1.4,
      nativeCurrency: 'USD',
      fxRateToUsd: null,
      source: 'manual',
      updatedBy: 'test-user-id',
      timestamp: latestTimestamp,
    };

    mockPrisma.asset.findUnique.mockResolvedValue(
      mockManualAsset({
        currentPriceUsd: 1.4,
        priceUpdatedAt: latestTimestamp,
        priceAsOf: latestTimestamp,
      })
    );
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'position-1' });
    mockPrisma.priceHistory.upsert.mockResolvedValue({
      ...latestNav,
      id: 'price-older',
      priceUsd: 1.1,
      nativePrice: 1.1,
      timestamp: olderTimestamp,
    });
    mockPrisma.priceHistory.findFirst.mockResolvedValue(latestNav);
    mockPrisma.asset.update.mockResolvedValue(
      mockManualAsset({ currentPriceUsd: 1.4, priceUpdatedAt: latestTimestamp })
    );

    const res = await request(app)
      .patch('/api/assets/asset-1/nav')
      .send({ navPrice: 1.1, asOfDate: olderTimestamp.toISOString() });

    expect(res.status).toBe(200);
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    expect(res.body.currentPriceUsd).toBe(1.4);
  });
});
