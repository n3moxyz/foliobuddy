import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  positionFindMany: vi.fn(),
  tradeFindMany: vi.fn(),
  getSummary: vi.fn(),
  getAllocationByCategory: vi.fn(),
  getTopPerformers: vi.fn(),
  getWorstPerformers: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    position: { findMany: mocks.positionFindMany },
    trade: { findMany: mocks.tradeFindMany },
  },
}));
vi.mock('../../services/portfolioService.js', () => ({
  portfolioService: {
    getSummary: mocks.getSummary,
    getAllocationByCategory: mocks.getAllocationByCategory,
    getTopPerformers: mocks.getTopPerformers,
    getWorstPerformers: mocks.getWorstPerformers,
  },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));

const { default: agentRouter } = await import('../../routes/agent.js');
const app = createTestApp(agentRouter, '/api/agent');

describe('GET /api/agent/portfolio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSummary.mockResolvedValue({ totalValueUsd: 100 });
    mocks.getAllocationByCategory.mockResolvedValue([]);
    mocks.getTopPerformers.mockResolvedValue([]);
    mocks.getWorstPerformers.mockResolvedValue([]);
    mocks.positionFindMany.mockResolvedValue([
      {
        quantity: 2,
        avgCostUsd: 40,
        marketValueUsd: null,
        unrealizedPnL: null,
        unrealizedPnLPct: null,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
        asset: { symbol: 'ABC', name: 'ABC', category: 'EQUITY', currentPriceUsd: 50 },
      },
    ]);
    mocks.tradeFindMany.mockResolvedValue([
      {
        direction: 'SHORT',
        entryPrice: 100,
        quantity: 1,
        entryDate: new Date('2026-01-01T00:00:00Z'),
        notes: null,
        asset: { symbol: 'ABC', name: 'ABC', currentPriceUsd: 80 },
      },
    ]);
  });

  it('derives missing values and computes short-trade returns with direction-aware math', async () => {
    const response = await request(app).get('/api/agent/portfolio');

    expect(response.status).toBe(200);
    expect(response.body.positions[0]).toMatchObject({ marketValueUsd: 100, allocationPct: 100 });
    expect(response.body.openTrades[0]).toMatchObject({ direction: 'SHORT', unrealizedPnLPct: 20 });
    expect(mocks.positionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'test-user-id', custodyOf: null }, take: 100 })
    );
  });
});
