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

  it('rejects funding cash source for reduce delta updates', async () => {
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
    expect(res.body.error).toBe('Funding cash source is only supported when adding to a position');
    expect(mockPrisma.position.update).not.toHaveBeenCalled();
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
