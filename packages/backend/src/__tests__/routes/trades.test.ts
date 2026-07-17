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
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
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

describe('adversarial trade boundaries', () => {
  it('rejects impossible and backwards dates before reading the asset', async () => {
    const impossible = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      entryPrice: 100,
      quantity: 1,
      entryDate: '2026-02-31',
    });
    const backwards = await request(app).post('/api/trades').send({
      assetId: 'asset-1',
      entryPrice: 100,
      exitPrice: 110,
      quantity: 1,
      entryDate: '2026-02-10',
      exitDate: '2026-02-01',
    });

    expect(impossible.status).toBe(400);
    expect(backwards.status).toBe(400);
    expect(mockPrisma.asset.findUnique).not.toHaveBeenCalled();
  });

  it('uses JSON-safe infinite profit factor semantics and UTC month buckets', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade({ id: 'win-1', realizedPnL: 10, exitDate: new Date('2026-01-31T16:30:00Z') }),
      mockTrade({ id: 'win-2', realizedPnL: 30, exitDate: new Date('2026-01-15T00:00:00Z') }),
    ]);

    const res = await request(app).get('/api/trades/analytics');

    expect(res.status).toBe(200);
    expect(res.body.profitFactor).toBeNull();
    expect(res.body.bestTrade.id).toBe('win-2');
    expect(res.body.worstTrade).toBeNull();
    expect(res.body.monthlyBreakdown).toEqual([
      { month: '2026-01', pnl: 40, count: 2, winRate: 100 },
    ]);
  });

  it('does not label a losing-only trade set as having a best trade', async () => {
    mockPrisma.trade.findMany.mockResolvedValue([
      mockTrade({ id: 'loss-1', realizedPnL: -10 }),
      mockTrade({ id: 'loss-2', realizedPnL: -30 }),
    ]);

    const res = await request(app).get('/api/trades/analytics');

    expect(res.body.bestTrade).toBeNull();
    expect(res.body.worstTrade.id).toBe('loss-2');
  });

  it('refuses to close a trade before its entry date', async () => {
    mockPrisma.trade.findFirst.mockResolvedValue(
      mockTrade({ status: 'OPEN', exitPrice: null, entryDate: new Date('2026-02-10T00:00:00Z') })
    );

    const res = await request(app).patch('/api/trades/trade-1/close').send({
      exitPrice: 110,
      exitDate: '2026-02-01',
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Exit date cannot precede entry date');
    expect(mockPrisma.trade.update).not.toHaveBeenCalled();
  });

  it('rejects internally inconsistent bulk trade state', async () => {
    const res = await request(app)
      .post('/api/trades/bulk-import')
      .send([
        {
          asset: {
            coingeckoId: 'bitcoin',
            symbol: 'BTC',
            name: 'Bitcoin',
            category: 'LIQUID_CRYPTO',
          },
          direction: 'LONG',
          entryPrice: 100,
          exitPrice: 110,
          quantity: 1,
          entryDate: '2026-01-01',
          status: 'OPEN',
        },
      ]);

    expect(res.status).toBe(400);
    expect(mockPrisma.trade.create).not.toHaveBeenCalled();
  });
});
