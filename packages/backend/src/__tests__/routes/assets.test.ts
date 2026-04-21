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
  },
  fxRate: { findUnique: vi.fn() },
  position: { findFirst: vi.fn() },
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
  mockPriceService.updatePositionValues.mockResolvedValue(undefined);
});

describe('PATCH /api/assets/:id/nav', () => {
  it('rejects NAV updates when the authenticated user does not hold the asset', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(mockManualAsset());
    mockPrisma.position.findFirst.mockResolvedValue(null);

    const res = await request(app)
      .patch('/api/assets/asset-1/nav')
      .send({ navPrice: 1.25, asOfDate: '2026-04-20T00:00:00.000Z' });

    expect(res.status).toBe(404);
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
