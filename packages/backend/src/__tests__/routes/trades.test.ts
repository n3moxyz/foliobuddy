import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockAsset, mockTrade } from '../helpers/fixtures.js';
import { createTestApp } from '../helpers/createTestApp.js';

// Mock Prisma
const mockPrisma = {
  asset: { findUnique: vi.fn() },
  trade: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('../../index.js', () => ({ prisma: mockPrisma }));
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

// Import route after mocks
const { default: tradesRouter } = await import('../../routes/trades.js');
const app = createTestApp(tradesRouter, '/api/trades');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/trades', () => {
  it('creates a LONG trade with exit and calculates realizedPnL', async () => {
    const asset = mockAsset();
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.trade.create.mockResolvedValue(
      mockTrade({ realizedPnL: 10000, realizedPnLPct: 25, status: 'CLOSED' })
    );

    const res = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      direction: 'LONG',
      entryPrice: 40000,
      exitPrice: 50000,
      quantity: 1,
      entryDate: '2024-01-01',
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.trade.create.mock.calls[0][0];
    // (50000 - 40000) * 1 = 10000
    expect(createCall.data.realizedPnL).toBe(10000);
    expect(createCall.data.realizedPnLPct).toBe(25);
    expect(createCall.data.status).toBe('CLOSED');
  });

  it('creates a SHORT trade with exit and calculates realizedPnL', async () => {
    const asset = mockAsset();
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.trade.create.mockResolvedValue(
      mockTrade({ realizedPnL: 5000, realizedPnLPct: 10, status: 'CLOSED', direction: 'SHORT' })
    );

    const res = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      direction: 'SHORT',
      entryPrice: 50000,
      exitPrice: 45000,
      quantity: 1,
      entryDate: '2024-01-01',
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.trade.create.mock.calls[0][0];
    // (50000 - 45000) * 1 = 5000
    expect(createCall.data.realizedPnL).toBe(5000);
    expect(createCall.data.realizedPnLPct).toBe(10);
    expect(createCall.data.status).toBe('CLOSED');
  });

  it('creates an OPEN trade with null PnL when no exit price', async () => {
    const asset = mockAsset();
    mockPrisma.asset.findUnique.mockResolvedValue(asset);
    mockPrisma.trade.create.mockResolvedValue(
      mockTrade({ status: 'OPEN', realizedPnL: null, realizedPnLPct: null, exitPrice: null })
    );

    const res = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      direction: 'LONG',
      entryPrice: 40000,
      quantity: 1,
      entryDate: '2024-01-01',
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.trade.create.mock.calls[0][0];
    expect(createCall.data.status).toBe('OPEN');
    expect(createCall.data.realizedPnL).toBeNull();
    expect(createCall.data.realizedPnLPct).toBeNull();
  });

  it('returns 404 when asset not found', async () => {
    mockPrisma.asset.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/trades').send({
      assetId: 'nonexistent',
      direction: 'LONG',
      entryPrice: 100,
      quantity: 1,
      entryDate: '2024-01-01',
    });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Asset not found');
  });

  it('returns 400 for validation error (negative price)', async () => {
    const res = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      direction: 'LONG',
      entryPrice: -100,
      quantity: 1,
      entryDate: '2024-01-01',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation error');
  });
});

describe('GET /api/trades', () => {
  it('returns trades array', async () => {
    const trades = [mockTrade(), mockTrade({ id: 'trade-2' })];
    mockPrisma.trade.findMany.mockResolvedValue(trades);

    const res = await request(app).get('/api/trades');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('supports pagination', async () => {
    const trades = [mockTrade()];
    mockPrisma.trade.findMany.mockResolvedValue(trades);
    mockPrisma.trade.count.mockResolvedValue(25);

    const res = await request(app).get('/api/trades?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      limit: 10,
      total: 25,
      totalPages: 3,
    });
  });
});
