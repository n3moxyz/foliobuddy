import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockAsset, mockPosition } from '../helpers/fixtures.js';
import { createTestApp } from '../helpers/createTestApp.js';
import { Prisma } from '@prisma/client';
import { ETHENA_USDE, STABLECOINX } from '../helpers/catalog.js';

// Mock Prisma
const mockPrisma = {
  $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  asset: { findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), upsert: vi.fn() },
  position: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  },
  positionHistory: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
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
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: 'test-clerk-id' }),
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/auth.js', () => ({
  ensureUser: (_req: any, _res: any, next: any) => next(),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/portfolioService.js', () => ({
  portfolioService: {
    getSummary: vi.fn(),
    getAllocationByCategory: vi.fn(),
    getAllocationByStorage: vi.fn(),
    getTopPerformers: vi.fn(),
    getWorstPerformers: vi.fn(),
  },
}));

// Import route after mocks are set up
const { default: positionsRouter } = await import('../../routes/positions.js');
const app = createTestApp(positionsRouter, '/api/positions');

describe('bulk import text caps', () => {
  it('rejects over-long asset names and symbols before touching the catalog', async () => {
    const { MAX_ASSET_NAME_LENGTH, MAX_ASSET_SYMBOL_LENGTH } =
      await import('../../lib/constants.js');
    for (const asset of [
      { symbol: 'LONG', name: 'N'.repeat(MAX_ASSET_NAME_LENGTH + 1) },
      { symbol: 'S'.repeat(MAX_ASSET_SYMBOL_LENGTH + 1), name: 'Long symbol' },
      { symbol: 'BLANK', name: '   ' },
    ]) {
      const res = await request(app)
        .post('/api/positions/bulk')
        .send({ positions: [{ asset: { ...asset, category: 'EQUITY' }, quantity: 1 }] });
      expect(res.status).toBe(400);
    }

    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
  });

  it('accepts names and symbols at the caps, storing the trimmed name', async () => {
    const { MAX_ASSET_NAME_LENGTH, MAX_ASSET_SYMBOL_LENGTH } =
      await import('../../lib/constants.js');
    const name = 'N'.repeat(MAX_ASSET_NAME_LENGTH);
    const symbol = 'S'.repeat(MAX_ASSET_SYMBOL_LENGTH);
    mockPrisma.asset.findMany.mockResolvedValue([]);
    mockPrisma.asset.create.mockImplementation(async ({ data }) =>
      mockAsset({ id: 'asset-capped', ...data })
    );

    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [{ asset: { symbol, name: ` ${name} `, category: 'EQUITY' }, quantity: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ symbol, name }),
    });
  });
});

describe('bulk import with same-ticker assets across classes', () => {
  const stablecoinXImport = {
    symbol: 'USDE',
    name: 'StablecoinX Inc.',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: 'USDE',
  };
  // A pasted Cash row without coingeckoId, so only the symbol can match it.
  const ethenaImport = { symbol: 'USDe', name: 'Ethena USDe', category: 'STABLECOIN' };

  function importPositions(...assets: Array<Record<string, unknown>>) {
    return request(app)
      .post('/api/positions/bulk')
      .send({ positions: assets.map((asset) => ({ asset, quantity: 10, avgCostUsd: 1 })) });
  }

  it('creates the StablecoinX equity instead of binding it to the Ethena USDe stablecoin', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([ETHENA_USDE]);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));

    const res = await importPositions(stablecoinXImport);

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ symbol: 'USDE', category: 'EQUITY', priceProvider: 'yahoo' }),
    });
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'created' }),
    });
  });

  it('binds each import to its own class whatever order the catalog returns', async () => {
    for (const catalog of [
      [ETHENA_USDE, STABLECOINX],
      [STABLECOINX, ETHENA_USDE],
    ]) {
      vi.clearAllMocks();
      mockPrisma.asset.findMany.mockResolvedValue(catalog);

      const res = await importPositions(stablecoinXImport, ethenaImport);

      expect(res.body.successCount).toBe(2);
      expect(mockPrisma.asset.create).not.toHaveBeenCalled();
      const assetIds = mockPrisma.position.create.mock.calls.map(([args]) => args.data.assetId);
      expect(assetIds).toEqual([STABLECOINX.id, ETHENA_USDE.id]);
    }
  });
});

describe('bulk import rows without a category', () => {
  const nvidiaEquity = {
    ...STABLECOINX,
    id: 'nvda-row',
    providerAssetId: 'NVDA',
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
  };

  function importWithoutCategory(symbol: string) {
    return request(app)
      .post('/api/positions/bulk')
      .send({ positions: [{ asset: { symbol, name: symbol }, quantity: 10, avgCostUsd: 1 }] });
  }

  it('reuses the one existing asset with that ticker, whatever its class', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([nvidiaEquity, ETHENA_USDE]);

    const res = await importWithoutCategory('nvda');

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'nvda-row' }),
    });
  });

  it('asks for a category instead of guessing when the ticker exists in two classes', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([ETHENA_USDE, STABLECOINX]);

    const res = await importWithoutCategory('USDE');

    expect(res.body.successCount).toBe(0);
    expect(res.body.results[0].error).toBe(
      'USDE matches more than one asset type (STABLECOIN, EQUITY); add "category" to this row'
    );
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
  });

  it('never moves a row onto an asset with a different price feed', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([ETHENA_USDE]);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));

    // A Yahoo-priced USDE row must not become the CoinGecko-priced stablecoin.
    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          {
            asset: {
              symbol: 'USDE',
              name: 'StablecoinX',
              priceProvider: 'yahoo',
              providerAssetId: 'USDE',
            },
            quantity: 10,
            avgCostUsd: 15,
          },
        ],
      });

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priceProvider: 'yahoo', providerAssetId: 'USDE' }),
    });
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'created' }),
    });
  });

  it('never binds a CoinGecko row to a Yahoo equity with the same ticker', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([STABLECOINX]);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));

    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          {
            asset: { symbol: 'USDe', name: 'Ethena USDe', coingeckoId: 'ethena-usde' },
            quantity: 1,
          },
        ],
      });

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'created' }),
    });
  });

  it('still creates a new ticker as crypto, as before', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([ETHENA_USDE]);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));

    const res = await importWithoutCategory('NEWCOIN');

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ symbol: 'NEWCOIN', category: 'LIQUID_CRYPTO' }),
    });
  });

  // An old frontend loaded during a deploy can copy an old snapshot's unresolvable
  // asset.category as an explicit null rather than omitting the key; the row must
  // be treated exactly like "not provided", not rejected outright.
  it('treats an explicit null category like a missing one and asks for a category on a two-class ticker', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([ETHENA_USDE, STABLECOINX]);

    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          { asset: { symbol: 'USDE', name: 'USDE', category: null }, quantity: 10, avgCostUsd: 1 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.successCount).toBe(0);
    expect(res.body.results[0].error).toBe(
      'USDE matches more than one asset type (STABLECOIN, EQUITY); add "category" to this row'
    );
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
  });

  it('treats an explicit null category like a missing one and reuses a single-class ticker', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([nvidiaEquity, ETHENA_USDE]);

    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          { asset: { symbol: 'nvda', name: 'nvda', category: null }, quantity: 10, avgCostUsd: 1 },
        ],
      });

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'nvda-row' }),
    });
  });
});

describe('bulk import catalog identity and row errors', () => {
  function importAsset(asset: Record<string, unknown>) {
    return request(app)
      .post('/api/positions/bulk')
      .send({ positions: [{ asset, quantity: 1, avgCostUsd: 1 }] });
  }

  function useCatalog(catalog: Array<Record<string, unknown>>) {
    mockPrisma.asset.findMany.mockResolvedValue(catalog);
    mockPrisma.asset.create.mockImplementation(async ({ data }) => ({ id: 'created', ...data }));
  }

  const importedAssetId = () => mockPrisma.position.create.mock.calls[0][0].data.assetId;

  it('binds a row to the asset holding its provider pair, even under an old ticker', async () => {
    useCatalog([{ ...STABLECOINX, id: 'meta-row', providerAssetId: 'META', symbol: 'FB' }]);

    const res = await importAsset({
      symbol: 'META',
      name: 'Meta Platforms',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'META',
    });

    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(importedAssetId()).toBe('meta-row');
  });

  it('binds a CoinGecko row to the asset holding that coin id in its provider pair', async () => {
    // A different class and no coingeckoId column: only the provider pair matches.
    useCatalog([{ ...ETHENA_USDE, id: 'pair-only', coingeckoId: null, category: 'CASH' }]);

    await importAsset({
      symbol: 'USDe',
      name: 'Ethena USDe',
      category: 'LIQUID_CRYPTO',
      coingeckoId: 'ethena-usde',
    });

    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(importedAssetId()).toBe('pair-only');
  });

  it.each([
    [
      { symbol: 'nvda', name: 'NVIDIA Corporation', category: 'EQUITY' },
      { priceProvider: 'yahoo', providerAssetId: 'NVDA' },
    ],
    [
      { symbol: 'SOL', name: 'Solana', category: 'LIQUID_CRYPTO', coingeckoId: 'solana' },
      { priceProvider: 'coingecko', providerAssetId: 'solana' },
    ],
  ])('creates %o with a provider id the refresh job can read', async (asset, feed) => {
    useCatalog([]);

    await importAsset(asset);

    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining(feed),
    });
  });

  it('leaves a non-USD equity with a bare ticker unpriced rather than on the US listing', async () => {
    useCatalog([]);

    await importAsset({ symbol: 'D05', name: 'DBS', category: 'EQUITY', nativeCurrency: 'SGD' });

    expect(mockPrisma.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ priceProvider: 'yahoo', providerAssetId: null }),
    });
  });

  it('reports a database failure on a row without leaking the raw Prisma message', async () => {
    useCatalog([]);
    mockPrisma.asset.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`priceProvider`,`providerAssetId`)',
        { code: 'P2002', clientVersion: 'test' }
      )
    );

    const res = await importAsset({ symbol: 'NVDA', name: 'NVIDIA', category: 'EQUITY' });

    expect(res.status).toBe(201);
    expect(res.body.results).toEqual([
      { success: false, symbol: 'NVDA', error: 'A record with this value already exists' },
    ]);
  });

  it('reports an unexpected failure on a row with fixed text', async () => {
    useCatalog([]);
    mockPrisma.position.create.mockRejectedValueOnce(
      new Error('connect ECONNREFUSED 10.0.0.5:5432')
    );

    const res = await importAsset({ symbol: 'NVDA', name: 'NVIDIA', category: 'EQUITY' });

    expect(res.body.results[0].error).toBe('Unexpected error');
  });
});

describe('bulk unit-trust identity', () => {
  it('reuses the established manager asset even when an import supplies a new symbol and manual provider', async () => {
    const established = mockAsset({
      id: 'amova',
      category: 'UNIT_TRUST',
      symbol: 'AMOVASIN',
      nativeCurrency: 'SGD',
      isin: 'SG9999004360',
      priceProvider: 'fund-manager',
      providerAssetId: 'SG9999004360',
    });
    mockPrisma.asset.findMany.mockResolvedValue([established]);
    mockPrisma.asset.findUnique.mockResolvedValue({ ...established, currentPriceUsd: 4.8 });
    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          {
            asset: {
              symbol: 'ALIAS',
              name: 'Statement name',
              category: 'UNIT_TRUST',
              nativeCurrency: 'SGD',
              priceProvider: 'manual',
              providerAssetId: 'another-id',
              isin: 'SG9999004360',
            },
            quantity: 10,
            avgCostUsd: 3,
          },
        ],
      });
    expect(res.body.successCount).toBe(1);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
    expect(mockPrisma.asset.upsert).not.toHaveBeenCalled();
    expect(mockPrisma.position.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ assetId: 'amova', marketValueUsd: 48 }),
    });
  });
  it('rejects a known ISIN with a different currency before catalog creation', async () => {
    mockPrisma.asset.findMany.mockResolvedValue([]);
    const res = await request(app)
      .post('/api/positions/bulk')
      .send({
        positions: [
          {
            asset: {
              symbol: 'WRONG',
              name: 'Wrong class',
              category: 'UNIT_TRUST',
              nativeCurrency: 'USD',
              priceProvider: 'manual',
              isin: 'SG9999004360',
            },
            quantity: 10,
          },
        ],
      });
    expect(res.body.successCount).toBe(0);
    expect(mockPrisma.asset.create).not.toHaveBeenCalled();
  });
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/positions', () => {
  it('uses the NAV read inside the transaction if FX changes after the initial catalog lookup', async () => {
    const oldAsset = mockAsset({ id: 'amova', category: 'UNIT_TRUST', currentPriceUsd: 4.8 });
    mockPrisma.asset.findUnique
      .mockResolvedValueOnce(oldAsset)
      .mockResolvedValueOnce({ ...oldAsset, currentPriceUsd: 4.3 });
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition());
    const response = await request(app)
      .post('/api/positions')
      .send({ assetId: 'amova', quantity: 100, avgCostUsd: 3 });
    expect(response.status).toBe(201);
    expect(mockPrisma.position.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ marketValueUsd: 430, unrealizedPnL: 130 }),
      })
    );
    expect(mockPrisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
  it('creates a position with computed market value fields', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    const created = mockPosition({
      quantity: 2,
      avgCostUsd: 40000,
      marketValueUsd: 120000,
      unrealizedPnL: 40000,
      unrealizedPnLPct: 50,
    });
    mockPrisma.position.create.mockResolvedValue(created);

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 2, avgCostUsd: 40000 });

    expect(res.status).toBe(201);
    // Verify prisma.position.create was called with computed fields
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.marketValueUsd).toBe(120000); // 2 * 60000
    expect(createCall.data.unrealizedPnL).toBe(40000); // 120000 - 80000
    expect(createCall.data.unrealizedPnLPct).toBe(50); // (40000 / 80000) * 100
  });

  it('sets marketValueUsd to null when asset has no price', async () => {
    const asset = mockAsset({ currentPriceUsd: null });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition({ marketValueUsd: null }));

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 100 });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.marketValueUsd).toBeNull();
    expect(createCall.data.unrealizedPnL).toBeNull();
  });

  it('returns 400 for missing assetId', async () => {
    const res = await request(app).post('/api/positions').send({ quantity: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });

  it('returns 404 when asset not found', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'nonexistent', quantity: 1 });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Asset not found');
  });

  it('reduces the selected cash position and records history when funding a new position', async () => {
    const targetAsset = mockAsset({ id: 'asset-sol', currentPriceUsd: 150 });
    const cashAsset = mockAsset({
      id: 'asset-usdc',
      symbol: 'USDC',
      name: 'USD Coin',
      category: 'STABLECOIN',
      currentPriceUsd: 1,
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 1000,
      avgCostUsd: 1,
      asset: cashAsset,
    });
    const created = mockPosition({
      id: 'position-new',
      assetId: 'asset-sol',
      quantity: 2,
      avgCostUsd: 100,
      asset: targetAsset,
    });

    mockPrisma.asset.findUnique.mockResolvedValue(targetAsset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.findFirst.mockResolvedValue(cashPosition);
    mockPrisma.position.create.mockResolvedValue(created);
    mockPrisma.position.update.mockResolvedValue(mockPosition());
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app).post('/api/positions').send({
      assetId: 'asset-sol',
      quantity: 2,
      avgCostUsd: 100,
      fundingCashPositionId: 'cash-position-1',
    });

    expect(res.status).toBe(201);
    expect(mockPrisma.position.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'cash-position-1',
        userId: 'test-user-id',
        custodyOf: null,
      },
      include: { asset: true },
    });
    expect(mockPrisma.position.update).toHaveBeenCalledWith({
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({
        quantity: 800,
        avgCostUsd: 1,
        marketValueUsd: 800,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
      }),
    });
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'cash-position-1',
        assetId: 'asset-usdc',
        mode: 'reduce',
        quantity: 200,
        costBasisUsd: 200,
        previousQuantity: 1000,
        previousAvgCostUsd: 1,
        previousTotalCostUsd: 1000,
        nextQuantity: 800,
        nextAvgCostUsd: 1,
        nextTotalCostUsd: 800,
      }),
    });
  });

  it('rejects funding from a non-cash position', async () => {
    const targetAsset = mockAsset({ id: 'asset-sol' });
    const cryptoPosition = mockPosition({
      id: 'crypto-position-1',
      asset: mockAsset({ id: 'asset-btc', category: 'LIQUID_CRYPTO' }),
    });

    mockPrisma.asset.findUnique.mockResolvedValue(targetAsset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.findFirst.mockResolvedValue(cryptoPosition);

    const res = await request(app).post('/api/positions').send({
      assetId: 'asset-sol',
      quantity: 2,
      avgCostUsd: 100,
      fundingCashPositionId: 'crypto-position-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Funding position must be a cash position');
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
  });

  it('rejects funding when the selected cash position cannot cover the cost', async () => {
    const targetAsset = mockAsset({ id: 'asset-sol' });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      quantity: 50,
      avgCostUsd: 1,
      assetId: 'asset-usdc',
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });

    mockPrisma.asset.findUnique.mockResolvedValue(targetAsset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.findFirst.mockResolvedValue(cashPosition);

    const res = await request(app).post('/api/positions').send({
      assetId: 'asset-sol',
      quantity: 2,
      avgCostUsd: 100,
      fundingCashPositionId: 'cash-position-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('You cannot reduce below zero quantity');
    expect(mockPrisma.position.create).not.toHaveBeenCalled();
  });
});

describe('GET /api/positions', () => {
  it('returns positions array', async () => {
    const positions = [mockPosition(), mockPosition({ id: 'position-2' })];
    mockPrisma.position.findMany.mockResolvedValue(positions);

    const res = await request(app).get('/api/positions');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('POST /api/positions (custody)', () => {
  it('passes custodyOf through to prisma create', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition({ custodyOf: 'Mum' }));

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000, custodyOf: 'Mum' });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.custodyOf).toBe('Mum');
  });

  it('converts empty custodyOf string to null', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition({ custodyOf: null }));

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000, custodyOf: '' });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.custodyOf).toBeNull();
  });

  it('accepts null custodyOf value', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition({ custodyOf: null }));

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000, custodyOf: null });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.custodyOf).toBeNull();
  });

  it('filters custodyOf: null in category limit query', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition());

    await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000 });

    // Verify findMany was called with custodyOf: null filter
    const findManyCall = mockPrisma.position.findMany.mock.calls[0][0];
    expect(findManyCall.where.custodyOf).toBeNull();
  });

  it('rejects when category is full (20 owned positions)', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    const fullCategory = Array.from({ length: 20 }, (_, i) => mockPosition({ id: `pos-${i}` }));
    mockPrisma.position.findMany.mockResolvedValue(fullCategory);

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Maximum');
  });

  it('trims whitespace from custodyOf', async () => {
    const asset = mockAsset({ currentPriceUsd: 60000 });
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.create.mockResolvedValue(mockPosition({ custodyOf: 'Mum' }));

    const res = await request(app)
      .post('/api/positions')
      .send({ assetId: 'asset-1', quantity: 1, avgCostUsd: 50000, custodyOf: '  Mum  ' });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.position.create.mock.calls[0][0];
    expect(createCall.data.custodyOf).toBe('Mum');
  });
});

describe('DELETE /api/positions/:id', () => {
  it('returns 204 on success', async () => {
    mockPrisma.position.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/positions/position-1');

    expect(res.status).toBe(204);
    expect(mockPrisma.position.deleteMany).toHaveBeenCalledWith({
      where: { id: 'position-1', userId: 'test-user-id' },
    });
  });
});

describe('PUT /api/positions/:id', () => {
  it('uses the current NAV inside the edit transaction after an intervening FX refresh', async () => {
    const original = mockPosition({
      quantity: 10,
      avgCostUsd: 3,
      asset: mockAsset({ category: 'UNIT_TRUST', currentPriceUsd: 4.8 }),
    });
    const current = { ...original, asset: { ...original.asset, currentPriceUsd: 4.3 } };
    mockPrisma.position.findFirst.mockResolvedValueOnce(original).mockResolvedValueOnce(current);
    mockPrisma.position.update.mockResolvedValue(current);
    const response = await request(app)
      .put('/api/positions/position-1')
      .send({ notes: 'Updated broker note' });
    expect(response.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ marketValueUsd: 43, unrealizedPnL: 13 }),
      })
    );
  });
  it('recalculates value fields from the new asset when assetId changes', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        assetId: 'asset-1',
        quantity: 1,
        avgCostUsd: 50,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 50 }),
      })
    );
    mockPrisma.asset.findUnique.mockResolvedValue(
      mockAsset({
        id: 'asset-2',
        symbol: 'ETH',
        currentPriceUsd: 100,
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: data.assetId,
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );

    const res = await request(app).put('/api/positions/position-1').send({
      assetId: 'asset-2',
      quantity: 10,
      avgCostUsd: 80,
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.asset.findUnique).toHaveBeenCalledWith({
      where: { id: 'asset-2' },
    });
    expect(mockPrisma.position.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'position-1' },
        data: expect.objectContaining({
          assetId: 'asset-2',
          quantity: 10,
          avgCostUsd: 80,
          marketValueUsd: 1000,
          unrealizedPnL: 200,
          unrealizedPnLPct: 25,
        }),
      })
    );
  });

  it('records add/reduce history when a delta update is submitted', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 15,
        avgCostUsd: 120,
        positionDelta: {
          mode: 'add',
          quantity: 5,
          totalCostUsd: 800,
        },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'add',
        quantity: 5,
        costBasisUsd: 800,
        previousQuantity: 10,
        previousAvgCostUsd: 100,
        previousTotalCostUsd: 1000,
        nextQuantity: 15,
        nextAvgCostUsd: 120,
        nextTotalCostUsd: 1800,
      }),
    });
  });

  it('records reset history when edit totals changes aggregate quantity or cost', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: 25000,
        avgCostUsd: 1,
        asset: mockAsset({ id: 'asset-1', category: 'CASH', currentPriceUsd: 1 }),
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app).put('/api/positions/position-1').send({
      assetId: 'asset-1',
      quantity: 20000,
      avgCostUsd: 1,
      storageType: 'BANK',
      storageLocation: 'DBS',
    });

    expect(res.status).toBe(200);
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'reset',
        quantity: 20000,
        costBasisUsd: 20000,
        previousQuantity: 25000,
        previousAvgCostUsd: 1,
        previousTotalCostUsd: 25000,
        nextQuantity: 20000,
        nextAvgCostUsd: 1,
        nextTotalCostUsd: 20000,
      }),
    });
  });

  it('reduces a funding cash position when adding to an existing position', async () => {
    const targetPosition = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 10,
      avgCostUsd: 100,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 1000,
      avgCostUsd: 1,
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(targetPosition)
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      where.id === 'position-1'
        ? mockPosition({
            id: 'position-1',
            assetId: 'asset-1',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
        : mockPosition({
            id: 'cash-position-1',
            assetId: 'asset-usdc',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
          })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 15,
        avgCostUsd: 120,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: {
          mode: 'add',
          quantity: 5,
          totalCostUsd: 800,
        },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update.mock.calls[0][0].data).not.toHaveProperty(
      'fundingCashPositionId'
    );
    expect(mockPrisma.position.update).toHaveBeenCalledWith({
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({
        quantity: 200,
        avgCostUsd: 1,
        marketValueUsd: 200,
        unrealizedPnL: 0,
        unrealizedPnLPct: 0,
      }),
    });
    expect(mockPrisma.positionHistory.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'cash-position-1',
        assetId: 'asset-usdc',
        mode: 'reduce',
        quantity: 800,
        costBasisUsd: 800,
        previousQuantity: 1000,
        previousAvgCostUsd: 1,
        previousTotalCostUsd: 1000,
        nextQuantity: 200,
        nextAvgCostUsd: 1,
        nextTotalCostUsd: 200,
      }),
    });
  });

  it('rejects a cash pile on reduce delta updates without positive sale proceeds', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Sending proceeds to a cash pile requires a positive sale amount');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('rejects linking a cash pile to a held-for-others position', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-custody',
        quantity: 10,
        avgCostUsd: 100,
        custodyOf: 'Alice',
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app)
      .put('/api/positions/position-custody')
      .send({
        quantity: 5,
        avgCostUsd: 100,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: { mode: 'reduce', quantity: 5, proceedsUsd: 1000 },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Held-for-others positions cannot be linked to a cash pile');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
    expect(mockPrisma.positionHistory.create).not.toHaveBeenCalled();
  });

  it('rejects linking a cash pile when the same request marks the position as custody', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 5,
        avgCostUsd: 100,
        custodyOf: 'Alice',
        fundingCashPositionId: 'cash-position-1',
        positionDelta: { mode: 'reduce', quantity: 5, proceedsUsd: 1000 },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Held-for-others positions cannot be linked to a cash pile');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('rejects non-finite delta amounts before they reach the history table', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app)
      .put('/api/positions/position-1')
      .set('Content-Type', 'application/json')
      .send(
        '{"quantity":8,"avgCostUsd":100,"positionDelta":{"mode":"reduce","quantity":2,"proceedsUsd":1e999}}'
      );

    expect(res.status).toBe(400);
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('allows a full exit: reducing to zero with proceeds deposited into a cash pile', async () => {
    const targetPosition = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 10,
      avgCostUsd: 100,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 1000,
      avgCostUsd: 1,
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(targetPosition)
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      mockPosition({
        id: where.id,
        assetId: where.id === 'position-1' ? 'asset-1' : 'asset-usdc',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 0,
        avgCostUsd: 0,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: { mode: 'reduce', quantity: 10, proceedsUsd: 1500 },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { id: 'position-1' },
        data: expect.objectContaining({ quantity: 0, avgCostUsd: 0, marketValueUsd: 0 }),
      })
    );
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({ quantity: 2500, avgCostUsd: 1 }),
    });
    expect(mockPrisma.positionHistory.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        mode: 'reduce',
        quantity: 10,
        costBasisUsd: 1000,
        proceedsUsd: 1500,
        nextQuantity: 0,
        nextTotalCostUsd: 0,
      }),
    });
    // Landing on zero closes the position: the row is deleted (history cascades).
    expect(mockPrisma.position.deleteMany).toHaveBeenCalledWith({
      where: { id: 'position-1', userId: 'test-user-id' },
    });
  });

  it('keeps the position when a reduce leaves quantity above zero', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({ id: 'position-1', quantity: data.quantity, avgCostUsd: data.avgCostUsd })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 4,
        avgCostUsd: 100,
        positionDelta: { mode: 'reduce', quantity: 6, proceedsUsd: 900 },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.position.deleteMany).not.toHaveBeenCalled();
  });

  it('reduces the target and deposits sale proceeds into a linked cash pile', async () => {
    const targetPosition = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 10,
      avgCostUsd: 100,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 1000,
      avgCostUsd: 1,
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(targetPosition)
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      where.id === 'position-1'
        ? mockPosition({
            id: 'position-1',
            assetId: 'asset-1',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
        : mockPosition({
            id: 'cash-position-1',
            assetId: 'asset-usdc',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
          })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
          proceedsUsd: 300,
        },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'position-1' },
      data: expect.objectContaining({
        quantity: 8,
        avgCostUsd: 100,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({
        quantity: 1300,
        avgCostUsd: 1,
      }),
    });

    const historyCalls = mockPrisma.positionHistory.create.mock.calls;
    expect(historyCalls).toHaveLength(2);
    const targetHistoryData = historyCalls[0][0].data;
    const cashHistoryData = historyCalls[1][0].data;

    expect(targetHistoryData).toEqual(
      expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'reduce',
        quantity: 2,
        costBasisUsd: 200,
        previousQuantity: 10,
        previousAvgCostUsd: 100,
        nextQuantity: 8,
        nextAvgCostUsd: 100,
        proceedsUsd: 300,
      })
    );
    expect(cashHistoryData).toEqual(
      expect.objectContaining({
        userId: 'test-user-id',
        positionId: 'cash-position-1',
        assetId: 'asset-usdc',
        mode: 'add',
        quantity: 300,
        costBasisUsd: 300,
        previousQuantity: 1000,
        previousAvgCostUsd: 1,
        nextQuantity: 1300,
        nextAvgCostUsd: 1,
      })
    );

    expect(targetHistoryData.operationId).toBeTruthy();
    expect(targetHistoryData.operationId).toBe(cashHistoryData.operationId);
    expect(targetHistoryData.createdAt).toBe(cashHistoryData.createdAt);
  });

  it('records proceeds on the history row without a linked cash pile when no pile is selected', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
          proceedsUsd: 300,
        },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'reduce',
        quantity: 2,
        costBasisUsd: 200,
        proceedsUsd: 300,
        operationId: null,
      }),
    });
  });

  it('leaves proceedsUsd null on a plain reduce with no sale amount', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
        },
      });

    expect(res.status).toBe(200);
    expect(mockPrisma.positionHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        mode: 'reduce',
        quantity: 2,
        costBasisUsd: 200,
        proceedsUsd: null,
      }),
    });
  });

  it('rejects sale proceeds on an add delta', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 15,
        avgCostUsd: 120,
        positionDelta: {
          mode: 'add',
          quantity: 5,
          totalCostUsd: 800,
          proceedsUsd: 100,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Sale proceeds are only supported when reducing a position');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('rejects a linked cash position without a position delta', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 10,
        avgCostUsd: 100,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );

    const res = await request(app).put('/api/positions/position-1').send({
      quantity: 8,
      fundingCashPositionId: 'cash-position-1',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(
      'A linked cash position is only supported when adding to or reducing a position'
    );
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('rejects a proceeds destination that is not a cash position', async () => {
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(
        mockPosition({
          id: 'position-1',
          quantity: 10,
          avgCostUsd: 100,
          asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
        })
      )
      .mockResolvedValueOnce(
        mockPosition({
          id: 'crypto-position-1',
          asset: mockAsset({ id: 'asset-eth', category: 'LIQUID_CRYPTO' }),
        })
      );

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        fundingCashPositionId: 'crypto-position-1',
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
          proceedsUsd: 300,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Proceeds destination must be a cash position');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('rejects a proceeds cash position with no usable price', async () => {
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(
        mockPosition({
          id: 'position-1',
          quantity: 10,
          avgCostUsd: 100,
          asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
        })
      )
      .mockResolvedValueOnce(
        mockPosition({
          id: 'cash-position-1',
          assetId: 'asset-usdc',
          quantity: 1000,
          avgCostUsd: 0,
          asset: mockAsset({
            id: 'asset-usdc',
            symbol: 'USDC',
            category: 'STABLECOIN',
            currentPriceUsd: null,
          }),
        })
      );

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        fundingCashPositionId: 'cash-position-1',
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
          proceedsUsd: 300,
        },
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Proceeds cash position needs a usable USD price');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
  });

  it('converts proceeds into the pile currency for a non-USD cash position', async () => {
    const cashPosition = mockPosition({
      id: 'cash-position-sgd',
      assetId: 'asset-sgd',
      quantity: 500,
      avgCostUsd: 0.74,
      asset: mockAsset({
        id: 'asset-sgd',
        symbol: 'SGD',
        category: 'CASH',
        currentPriceUsd: 0.74,
      }),
    });
    mockPrisma.position.findFirst
      .mockResolvedValueOnce(
        mockPosition({
          id: 'position-1',
          quantity: 10,
          avgCostUsd: 100,
          asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
        })
      )
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      where.id === 'position-1'
        ? mockPosition({
            id: 'position-1',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
          })
        : mockPosition({
            id: 'cash-position-sgd',
            assetId: 'asset-sgd',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
          })
    );
    mockPrisma.positionHistory.create.mockResolvedValue({});

    const res = await request(app)
      .put('/api/positions/position-1')
      .send({
        quantity: 8,
        avgCostUsd: 100,
        fundingCashPositionId: 'cash-position-sgd',
        positionDelta: {
          mode: 'reduce',
          quantity: 2,
          proceedsUsd: 100,
        },
      });

    expect(res.status).toBe(200);
    const cashHistoryData = mockPrisma.positionHistory.create.mock.calls[1][0].data;
    expect(cashHistoryData.quantity).toBeCloseTo(100 / 0.74, 4);
    expect(cashHistoryData.costBasisUsd).toBe(100);
  });
});

describe('GET /api/positions/:id/history', () => {
  it('returns add/reduce history for positions owned by the user', async () => {
    mockPrisma.position.findFirst.mockResolvedValue({ id: 'position-1' });
    mockPrisma.positionHistory.findMany.mockResolvedValue([
      {
        id: 'history-1',
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'reduce',
        quantity: 2,
        costBasisUsd: 200,
        previousQuantity: 10,
        previousAvgCostUsd: 100,
        previousTotalCostUsd: 1000,
        nextQuantity: 8,
        nextAvgCostUsd: 100,
        nextTotalCostUsd: 800,
        createdAt: '2026-06-15T00:00:00.000Z',
      },
    ]);

    const res = await request(app).get('/api/positions/position-1/history');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(mockPrisma.position.findFirst).toHaveBeenCalledWith({
      where: { id: 'position-1', userId: 'test-user-id' },
      select: { id: true },
    });
    expect(mockPrisma.positionHistory.findMany).toHaveBeenCalledWith({
      where: { positionId: 'position-1', userId: 'test-user-id' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});

describe('DELETE /api/positions/:id/history/:historyId', () => {
  it('cancels the latest add/reduce history entry and restores previous totals', async () => {
    const position = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 15,
      avgCostUsd: 120,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const historyEntry = {
      id: 'history-1',
      userId: 'test-user-id',
      positionId: 'position-1',
      assetId: 'asset-1',
      mode: 'add',
      quantity: 5,
      costBasisUsd: 800,
      previousQuantity: 10,
      previousAvgCostUsd: 100,
      previousTotalCostUsd: 1000,
      nextQuantity: 15,
      nextAvgCostUsd: 120,
      nextTotalCostUsd: 1800,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    };

    mockPrisma.position.findFirst.mockResolvedValue(position);
    mockPrisma.positionHistory.findFirst
      .mockResolvedValueOnce(historyEntry)
      .mockResolvedValueOnce({ id: 'history-1' });
    mockPrisma.position.update.mockImplementation(async ({ data }) =>
      mockPosition({
        id: 'position-1',
        assetId: 'asset-1',
        quantity: data.quantity,
        avgCostUsd: data.avgCostUsd,
        marketValueUsd: data.marketValueUsd,
        unrealizedPnL: data.unrealizedPnL,
        unrealizedPnLPct: data.unrealizedPnLPct,
      })
    );
    mockPrisma.positionHistory.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/positions/position-1/history/history-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenCalledWith({
      where: { id: 'position-1' },
      data: expect.objectContaining({
        quantity: 10,
        avgCostUsd: 100,
        marketValueUsd: 1500,
        unrealizedPnL: 500,
        unrealizedPnLPct: 50,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.positionHistory.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'history-1',
        positionId: 'position-1',
        userId: 'test-user-id',
      },
    });
  });

  it('cancels a funded add and restores the paired cash reduction', async () => {
    const targetPosition = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 15,
      avgCostUsd: 120,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 200,
      avgCostUsd: 1,
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });
    const targetHistory = {
      id: 'history-1',
      userId: 'test-user-id',
      positionId: 'position-1',
      assetId: 'asset-1',
      mode: 'add',
      quantity: 5,
      costBasisUsd: 800,
      previousQuantity: 10,
      previousAvgCostUsd: 100,
      previousTotalCostUsd: 1000,
      nextQuantity: 15,
      nextAvgCostUsd: 120,
      nextTotalCostUsd: 1800,
      operationId: 'operation-1',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    };
    const cashHistory = {
      id: 'cash-history-1',
      userId: 'test-user-id',
      positionId: 'cash-position-1',
      assetId: 'asset-usdc',
      mode: 'reduce',
      quantity: 800,
      costBasisUsd: 800,
      previousQuantity: 1000,
      previousAvgCostUsd: 1,
      previousTotalCostUsd: 1000,
      nextQuantity: 200,
      nextAvgCostUsd: 1,
      nextTotalCostUsd: 200,
      operationId: 'operation-1',
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    };

    mockPrisma.position.findFirst
      .mockResolvedValueOnce(targetPosition)
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.positionHistory.findFirst
      .mockResolvedValueOnce(targetHistory)
      .mockResolvedValueOnce({ id: 'history-1' })
      .mockResolvedValueOnce({ id: 'cash-history-1' });
    mockPrisma.positionHistory.findMany.mockResolvedValue([cashHistory]);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      where.id === 'cash-position-1'
        ? mockPosition({
            id: 'cash-position-1',
            assetId: 'asset-usdc',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
        : mockPosition({
            id: 'position-1',
            assetId: 'asset-1',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
    );
    mockPrisma.positionHistory.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/positions/position-1/history/history-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'position-1' },
      data: expect.objectContaining({
        quantity: 10,
        avgCostUsd: 100,
        marketValueUsd: 1500,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({
        quantity: 1000,
        avgCostUsd: 1,
        marketValueUsd: 1000,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.positionHistory.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'history-1',
        positionId: 'position-1',
        userId: 'test-user-id',
      },
    });
    expect(mockPrisma.positionHistory.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cash-history-1',
        positionId: 'cash-position-1',
        userId: 'test-user-id',
      },
    });
  });

  it('cancels a proceeds reduce and restores the paired cash deposit', async () => {
    const targetPosition = mockPosition({
      id: 'position-1',
      assetId: 'asset-1',
      quantity: 8,
      avgCostUsd: 100,
      asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
    });
    const cashPosition = mockPosition({
      id: 'cash-position-1',
      assetId: 'asset-usdc',
      quantity: 1300,
      avgCostUsd: 1,
      asset: mockAsset({
        id: 'asset-usdc',
        symbol: 'USDC',
        category: 'STABLECOIN',
        currentPriceUsd: 1,
      }),
    });
    const targetHistory = {
      id: 'history-1',
      userId: 'test-user-id',
      positionId: 'position-1',
      assetId: 'asset-1',
      mode: 'reduce',
      quantity: 2,
      costBasisUsd: 200,
      previousQuantity: 10,
      previousAvgCostUsd: 100,
      previousTotalCostUsd: 1000,
      nextQuantity: 8,
      nextAvgCostUsd: 100,
      nextTotalCostUsd: 800,
      proceedsUsd: 300,
      operationId: 'operation-2',
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
    };
    const cashHistory = {
      id: 'cash-history-1',
      userId: 'test-user-id',
      positionId: 'cash-position-1',
      assetId: 'asset-usdc',
      mode: 'add',
      quantity: 300,
      costBasisUsd: 300,
      previousQuantity: 1000,
      previousAvgCostUsd: 1,
      previousTotalCostUsd: 1000,
      nextQuantity: 1300,
      nextAvgCostUsd: 1,
      nextTotalCostUsd: 1300,
      operationId: 'operation-2',
      createdAt: new Date('2026-06-16T00:00:00.000Z'),
    };

    mockPrisma.position.findFirst
      .mockResolvedValueOnce(targetPosition)
      .mockResolvedValueOnce(cashPosition);
    mockPrisma.positionHistory.findFirst
      .mockResolvedValueOnce(targetHistory)
      .mockResolvedValueOnce({ id: 'history-1' })
      .mockResolvedValueOnce({ id: 'cash-history-1' });
    mockPrisma.positionHistory.findMany.mockResolvedValue([cashHistory]);
    mockPrisma.position.update.mockImplementation(async ({ where, data }) =>
      where.id === 'cash-position-1'
        ? mockPosition({
            id: 'cash-position-1',
            assetId: 'asset-usdc',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
        : mockPosition({
            id: 'position-1',
            assetId: 'asset-1',
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            marketValueUsd: data.marketValueUsd,
            unrealizedPnL: data.unrealizedPnL,
            unrealizedPnLPct: data.unrealizedPnLPct,
          })
    );
    mockPrisma.positionHistory.deleteMany.mockResolvedValue({ count: 1 });

    const res = await request(app).delete('/api/positions/position-1/history/history-1');

    expect(res.status).toBe(200);
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'position-1' },
      data: expect.objectContaining({
        quantity: 10,
        avgCostUsd: 100,
        marketValueUsd: 1500,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.position.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'cash-position-1' },
      data: expect.objectContaining({
        quantity: 1000,
        avgCostUsd: 1,
        marketValueUsd: 1000,
      }),
      include: { asset: true },
    });
    expect(mockPrisma.positionHistory.deleteMany).toHaveBeenNthCalledWith(1, {
      where: {
        id: 'history-1',
        positionId: 'position-1',
        userId: 'test-user-id',
      },
    });
    expect(mockPrisma.positionHistory.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        id: 'cash-history-1',
        positionId: 'cash-position-1',
        userId: 'test-user-id',
      },
    });
  });

  it('rejects canceling a non-latest history entry', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 15,
        avgCostUsd: 120,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.positionHistory.findFirst
      .mockResolvedValueOnce({
        id: 'history-1',
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'add',
        quantity: 5,
        costBasisUsd: 800,
        previousQuantity: 10,
        previousAvgCostUsd: 100,
        previousTotalCostUsd: 1000,
        nextQuantity: 15,
        nextAvgCostUsd: 120,
        nextTotalCostUsd: 1800,
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({ id: 'history-2' });

    const res = await request(app).delete('/api/positions/position-1/history/history-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Only the latest position history entry can be canceled');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
    expect(mockPrisma.positionHistory.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects canceling a manual reset history entry', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 20000,
        avgCostUsd: 1,
        asset: mockAsset({ id: 'asset-1', category: 'CASH', currentPriceUsd: 1 }),
      })
    );
    mockPrisma.positionHistory.findFirst.mockResolvedValue({
      id: 'history-reset-1',
      userId: 'test-user-id',
      positionId: 'position-1',
      assetId: 'asset-1',
      mode: 'reset',
      quantity: 20000,
      costBasisUsd: 20000,
      previousQuantity: 25000,
      previousAvgCostUsd: 1,
      previousTotalCostUsd: 25000,
      nextQuantity: 20000,
      nextAvgCostUsd: 1,
      nextTotalCostUsd: 20000,
      createdAt: new Date('2026-06-15T00:00:00.000Z'),
    });

    const res = await request(app).delete('/api/positions/position-1/history/history-reset-1');

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Manual total reset entries cannot be canceled from history');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
    expect(mockPrisma.positionHistory.deleteMany).not.toHaveBeenCalled();
  });

  it('rejects canceling when the position no longer matches the history entry', async () => {
    mockPrisma.position.findFirst.mockResolvedValue(
      mockPosition({
        id: 'position-1',
        quantity: 14,
        avgCostUsd: 120,
        asset: mockAsset({ id: 'asset-1', currentPriceUsd: 150 }),
      })
    );
    mockPrisma.positionHistory.findFirst
      .mockResolvedValueOnce({
        id: 'history-1',
        userId: 'test-user-id',
        positionId: 'position-1',
        assetId: 'asset-1',
        mode: 'add',
        quantity: 5,
        costBasisUsd: 800,
        previousQuantity: 10,
        previousAvgCostUsd: 100,
        previousTotalCostUsd: 1000,
        nextQuantity: 15,
        nextAvgCostUsd: 120,
        nextTotalCostUsd: 1800,
        createdAt: new Date('2026-06-15T00:00:00.000Z'),
      })
      .mockResolvedValueOnce({ id: 'history-1' });

    const res = await request(app).delete('/api/positions/position-1/history/history-1');

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('Position has changed since this history entry was recorded');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
    expect(mockPrisma.positionHistory.deleteMany).not.toHaveBeenCalled();
  });
});
