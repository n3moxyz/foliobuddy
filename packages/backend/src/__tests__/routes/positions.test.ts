import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockAsset, mockPosition } from '../helpers/fixtures.js';
import { createTestApp } from '../helpers/createTestApp.js';

// Mock Prisma
const mockPrisma = {
  $transaction: vi.fn(async (callback) => callback(mockPrisma)),
  asset: { findUnique: vi.fn(), findMany: vi.fn() },
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
    create: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/positions', () => {
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
