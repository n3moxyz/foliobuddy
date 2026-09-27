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
  getPortfolioNews: vi.fn(),
  getAssetNews: vi.fn(),
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
vi.mock('../../services/newsService.js', () => ({
  newsService: { getPortfolioNews: mocks.getPortfolioNews, getAssetNews: mocks.getAssetNews },
}));
vi.mock('../../services/news/enrichmentService.js', () => ({
  newsEnrichmentService: { getResponseFor: vi.fn() },
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

describe('GET /api/agent/news', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("serves the owner's feed with the signed-in payload", async () => {
    const feed = {
      topStories: [],
      crypto: [],
      equities: [],
      macro: [],
      holdings: [],
      fetchedAt: 'now',
    };
    mocks.getPortfolioNews.mockResolvedValue(feed);

    const response = await request(app).get('/api/agent/news');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(feed);
    expect(mocks.getPortfolioNews).toHaveBeenCalledWith('test-user-id');
  });

  it("serves one holding's page and rejects malformed ids before the service", async () => {
    mocks.getAssetNews.mockResolvedValue({ items: [], windowDays: 60 });

    const page = await request(app).get('/api/agent/news/asset/clx1asset');
    const malformed = await request(app).get('/api/agent/news/asset/bad.id');

    expect(page.status).toBe(200);
    expect(mocks.getAssetNews).toHaveBeenCalledWith('test-user-id', 'clx1asset');
    expect(malformed.status).toBe(400);
    expect(mocks.getAssetNews).toHaveBeenCalledTimes(1);
  });

  it('passes a not-held 404 through with its message', async () => {
    const { AppError } = await import('../../middleware/errorHandler.js');
    mocks.getAssetNews.mockRejectedValue(new AppError('No news feed for this holding', 404));

    const response = await request(app).get('/api/agent/news/asset/clx1other');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No news feed for this holding' });
  });
});
