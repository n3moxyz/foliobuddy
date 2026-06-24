import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mockPrisma = {
  asset: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  fxRate: { findUnique: vi.fn() },
  position: { findFirst: vi.fn(), findMany: vi.fn() },
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
const app = createTestApp(assetsRouter, '/api/assets');

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
      where: { assetId_timestamp: { assetId: 'asset-1', timestamp } },
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
      data: { currentPriceUsd: 1.25, priceUpdatedAt: timestamp },
    });
    expect(mockPriceService.updatePositionValues).toHaveBeenCalledWith(['asset-1']);
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
      mockManualAsset({ currentPriceUsd: 1.4, priceUpdatedAt: latestTimestamp })
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
    expect(mockPrisma.asset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: { currentPriceUsd: 1.4, priceUpdatedAt: latestTimestamp },
    });
  });
});
