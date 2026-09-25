import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';
import { ETHENA_USDE, STABLECOINX, findFirstIn } from '../helpers/catalog.js';

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

const mockExtractPdfText = vi.fn();

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/priceService.js', () => ({ priceService: mockPriceService }));
vi.mock('../../services/statementParsers/pdfText.js', () => ({
  extractPdfText: mockExtractPdfText,
}));
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

describe('same-ticker assets across classes', () => {
  function useCatalog(catalog: Array<Record<string, unknown>>) {
    mockPrisma.asset.findFirst.mockImplementation(findFirstIn(catalog));
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));
    mockPrisma.asset.update.mockImplementation(async ({ where, data }) => ({
      ...catalog.find((row) => row.id === where.id),
      ...data,
    }));
  }

  const addStablecoinX = () =>
    request(app).post('/api/assets/from-provider').send({
      provider: 'yahoo',
      providerAssetId: 'USDE',
      symbol: 'USDE',
      name: 'StablecoinX Inc.',
      category: 'EQUITY',
      nativeCurrency: 'USD',
      exchange: 'NasdaqCM',
      skipPriceFetch: true,
    });

  const addEthenaUsdeCash = () =>
    request(app).post('/api/assets/from-coingecko').send({
      coingeckoId: 'ethena-usde',
      symbol: 'USDe',
      name: 'Ethena USDe',
      category: 'STABLECOIN',
      skipPriceFetch: true,
    });

  it('creates the StablecoinX equity instead of returning the Ethena USDe stablecoin', async () => {
    useCatalog([ETHENA_USDE]);

    const res = await addStablecoinX();

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ id: 'created', category: 'EQUITY', priceProvider: 'yahoo' });
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        priceProvider: 'yahoo',
        providerAssetId: 'USDE',
        symbol: 'USDE',
        category: 'EQUITY',
      }),
    });
  });

  it('returns each USDE asset by identity once both exist, whatever the lookup order', async () => {
    for (const catalog of [
      [ETHENA_USDE, STABLECOINX],
      [STABLECOINX, ETHENA_USDE],
    ]) {
      useCatalog(catalog);

      expect((await addStablecoinX()).body.id).toBe(STABLECOINX.id);
      expect((await addEthenaUsdeCash()).body.id).toBe(ETHENA_USDE.id);
    }
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('creates the Ethena USDe stablecoin instead of returning the StablecoinX equity', async () => {
    useCatalog([STABLECOINX]);

    const res = await addEthenaUsdeCash();

    expect(res.status).toBe(201);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        coingeckoId: 'ethena-usde',
        symbol: 'USDE',
        category: 'STABLECOIN',
      }),
    });
  });

  it('finds a CoinGecko row by providerAssetId when its coingeckoId is empty', async () => {
    // Bulk import can write this shape; a different class, so only identity matches it.
    const idOnlyRow = { ...ETHENA_USDE, id: 'id-only', coingeckoId: null, category: 'CASH' };
    useCatalog([idOnlyRow]);

    const res = await request(app).post('/api/assets/from-coingecko').send({
      coingeckoId: 'ethena-usde',
      symbol: 'USDe',
      name: 'Ethena USDe',
      category: 'LIQUID_CRYPTO',
      skipPriceFetch: true,
    });

    expect(res.body.id).toBe('id-only');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('prefers the row holding the provider pair over a legacy coingeckoId-only duplicate', async () => {
    // Two rows for one coin: an old coingeckoId-only row (unpriceable) and the
    // row holding (coingecko, id). Picking the old one would backfill its
    // providerAssetId straight into the unique index.
    const legacy = {
      ...ETHENA_USDE,
      id: 'legacy',
      providerAssetId: null,
      symbol: 'USDE-OLD',
    };
    const pair = { ...ETHENA_USDE, id: 'pair', coingeckoId: null };
    useCatalog([legacy, pair]);

    const viaProvider = await request(app).post('/api/assets/from-provider').send({
      provider: 'coingecko',
      providerAssetId: 'ethena-usde',
      symbol: 'USDE',
      name: 'Ethena USDe',
      category: 'STABLECOIN',
      skipPriceFetch: true,
    });
    const viaCoinGecko = await request(app).post('/api/assets/from-coingecko').send({
      coingeckoId: 'ethena-usde',
      symbol: 'USDe',
      name: 'Ethena USDe',
      category: 'STABLECOIN',
      skipPriceFetch: true,
    });

    expect([viaProvider.status, viaProvider.body.id]).toEqual([200, 'pair']);
    expect(viaCoinGecko.body.id).toBe('pair');
    expect(mockPrisma.asset.update).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('still reuses a same-class legacy asset matched only by symbol', async () => {
    const legacyEquity = mockManualAsset({
      id: 'legacy-usde',
      priceProvider: 'manual',
      providerAssetId: null,
      symbol: 'USDE',
      category: 'EQUITY',
    });
    useCatalog([ETHENA_USDE, legacyEquity]);

    const res = await addStablecoinX();

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('legacy-usde');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });

  it('matches a CoinGecko provider request to an older row that only has coingeckoId', async () => {
    const legacyTether = {
      ...ETHENA_USDE,
      id: 'legacy-tether',
      coingeckoId: 'tether',
      providerAssetId: null,
      symbol: 'USDT',
      name: 'Tether',
    };
    useCatalog([legacyTether]);

    // A different category group, so only the coingeckoId identity can match it;
    // creating instead would violate the unique coingeckoId constraint.
    const res = await request(app).post('/api/assets/from-provider').send({
      provider: 'coingecko',
      providerAssetId: 'tether',
      symbol: 'USDT',
      name: 'Tether',
      category: 'LIQUID_CRYPTO',
      skipPriceFetch: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('legacy-tether');
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    // Same provider, so the existing metadata repair backfills its provider id.
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'legacy-tether' },
      data: { providerAssetId: 'tether' },
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

describe('POST /api/assets/parse-unit-trust-statement', () => {
  const PDF = Buffer.from('%PDF-1.7');

  function uploadPdf() {
    return request(app)
      .post('/api/assets/parse-unit-trust-statement')
      .set('Content-Type', 'application/pdf')
      .send(PDF);
  }

  // A UOB Kay Hian statement listing `count` different funds.
  function uobStatement(count: number) {
    const holdings = Array.from({ length: count }, (_, i) =>
      [
        `Fund ${i}`,
        `Growth Fund SG${String(i).padStart(9, '0')}0 SGD UNIT 1,000.000 1.2500`,
        '0.0000',
        '1.5000',
        '$ 1,500.00 $ 250.00',
      ].join('\n')
    );
    return [
      'UOB Kay Hian Private Limited',
      'For the period from 1 January 2026 to 28 February 2026',
      'Portfolio Holdings',
      ...holdings,
      'Total $',
    ].join('\n');
  }

  // An FSMOne statement holding the same fund twice, bought with Cash and SRS.
  const FSMONE_SAME_FUND_TWICE = [
    'FSMOne',
    'UNIT TRUST HOLDINGS AS AT 30 APRIL 2026',
    'Current Market',
    'Value (B)',
    'Amova Singapore Equity SGD (formerly Nikko AM)',
    'SGD 5.3036 Cash SGD 5.2663 18,988.66 SGD 100,000.00 SGD 708.26 0.71 SGD 100,708.26',
    'Amova Singapore Equity SGD (formerly Nikko AM)',
    'SGD 5.3036 SRS SGD 5.2663 100.00 SGD 526.63 SGD 3.73 0.71 SGD 530.36',
    'TOTAL UNIT TRUST HOLDINGS (SGD EQUIVALENT) SGD',
  ].join('\n');

  function mockLookups() {
    mockPrisma.fxRate.findUnique.mockResolvedValue({ rate: 1.35, timestamp: new Date() });
    const searchByIsin = vi.fn(async (isin: string) => ({ symbol: `${isin}.SI` }));
    mockPriceService.getProvider.mockReturnValue({ searchByIsin });
    return searchByIsin;
  }

  it('reads the PDF within the statement limits and parses its text', async () => {
    mockExtractPdfText.mockResolvedValue({ status: 'ok', text: 'x' });

    const res = await uploadPdf();

    expect(mockExtractPdfText).toHaveBeenCalledWith(new Uint8Array(PDF), {
      maxPages: 30,
      maxTextChars: 1_000_000,
      timeoutMs: 5_000,
    });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/^Could not recognize this statement format/);
  });

  it.each([
    [
      { status: 'busy' },
      503,
      'Another statement is being read right now. Try again in a few seconds.',
    ],
    [
      { status: 'too-many-pages', pages: 120 },
      422,
      'This PDF has 120 pages; a statement import reads at most 30. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.',
    ],
    [
      { status: 'too-much-text', chars: 1_000_001 },
      422,
      'This PDF has too much text to be a monthly statement. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.',
    ],
    [
      { status: 'too-costly' },
      422,
      'This PDF is too large or complex to read. Upload a single UOB Kay Hian or FSMOne monthly statement PDF.',
    ],
  ])('answers a %j read with %i', async (read, status, error) => {
    mockExtractPdfText.mockResolvedValue(read);

    const res = await uploadPdf();

    expect(res.status).toBe(status);
    expect(res.body.error).toBe(error);
  });

  it('reports a PDF the reader cannot open', async () => {
    mockExtractPdfText.mockRejectedValue(new Error('Invalid PDF structure.'));

    const res = await uploadPdf();

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('Failed to read PDF: Invalid PDF structure.');
  });

  it('imports a statement with 50 holdings', async () => {
    mockExtractPdfText.mockResolvedValue({ status: 'ok', text: uobStatement(50) });
    mockLookups();

    const res = await uploadPdf();

    expect(res.status).toBe(200);
    expect(res.body.holdings).toHaveLength(50);
  });

  it('rejects a statement with 51 holdings before looking any of them up', async () => {
    mockExtractPdfText.mockResolvedValue({ status: 'ok', text: uobStatement(51) });
    const searchByIsin = mockLookups();

    const res = await uploadPdf();

    expect(res.status).toBe(422);
    expect(res.body.error).toBe(
      'This statement lists 51 holdings; one import takes at most 50. Add these holdings manually instead.'
    );
    expect(mockPrisma.fxRate.findUnique).not.toHaveBeenCalled();
    expect(searchByIsin).not.toHaveBeenCalled();
  });

  it('searches Yahoo once for a fund held two ways', async () => {
    mockExtractPdfText.mockResolvedValue({ status: 'ok', text: FSMONE_SAME_FUND_TWICE });
    const searchByIsin = mockLookups();

    const res = await uploadPdf();

    expect(res.status).toBe(200);
    expect(res.body.holdings.map((h: { yahooSymbol: string }) => h.yahooSymbol)).toEqual([
      'SG9999004360.SI',
      'SG9999004360.SI',
    ]);
    expect(searchByIsin).toHaveBeenCalledTimes(1);
  });
});
