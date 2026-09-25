import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  getPortfolioNews: vi.fn(),
  getAssetNews: vi.fn(),
  getResponseFor: vi.fn(),
}));

vi.mock('../../services/newsService.js', () => ({
  newsService: { getPortfolioNews: mocks.getPortfolioNews, getAssetNews: mocks.getAssetNews },
}));
vi.mock('../../services/news/enrichmentService.js', () => ({
  newsEnrichmentService: { getResponseFor: mocks.getResponseFor },
}));
vi.mock('../../middleware/auth.js', () => ({
  ensureUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: newsRouter } = await import('../../routes/news.js');
const app = createTestApp(newsRouter, '/api/news');

describe('News routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the portfolio news payload for the authenticated user', async () => {
    const payload = {
      crypto: [
        {
          assetId: 'asset-btc',
          symbol: 'BTC',
          name: 'Bitcoin',
          category: 'LIQUID_CRYPTO',
          openTradeOnly: false,
          items: [
            {
              id: 'story-1',
              title: 'Bitcoin story',
              publisher: 'Wire',
              url: 'https://example.com/story-1',
              publishedAt: '2026-08-24T10:00:00.000Z',
            },
          ],
        },
      ],
      equities: [],
      macro: [],
      fetchedAt: '2026-08-24T12:00:00.000Z',
    };
    mocks.getPortfolioNews.mockResolvedValue(payload);

    const response = await request(app).get('/api/news');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(mocks.getPortfolioNews).toHaveBeenCalledWith('test-user-id');
  });

  it("returns one holding's news for a well-formed asset id", async () => {
    const payload = {
      holding: {
        assetId: 'clx1asset',
        symbol: 'D05.SI',
        name: 'DBS Group Holdings Ltd',
        category: 'EQUITY',
        bucket: 'equities',
        openTradeOnly: false,
      },
      items: [],
      windowDays: 60,
      fetchedAt: '2026-08-24T12:00:00.000Z',
    };
    mocks.getAssetNews.mockResolvedValue(payload);

    const response = await request(app).get('/api/news/asset/clx1asset');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(mocks.getAssetNews).toHaveBeenCalledWith('test-user-id', 'clx1asset');
  });

  it('rejects malformed asset ids before reaching the service', async () => {
    const response = await request(app).get(`/api/news/asset/${'a'.repeat(65)}`);
    const dotted = await request(app).get('/api/news/asset/bad.id');

    expect(response.status).toBe(400);
    expect(dotted.status).toBe(400);
    expect(mocks.getAssetNews).not.toHaveBeenCalled();
  });

  it('passes a not-held 404 through with its message', async () => {
    const { AppError } = await import('../../middleware/errorHandler.js');
    mocks.getAssetNews.mockRejectedValue(new AppError('No news feed for this holding', 404));

    const response = await request(app).get('/api/news/asset/clx1other');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'No news feed for this holding' });
  });

  it('propagates service failures to the error handler as 500s', async () => {
    mocks.getPortfolioNews.mockRejectedValue(new Error('yahoo down'));

    const response = await request(app).get('/api/news');

    expect(response.status).toBe(500);
  });

  it('accepts story-metadata feedback and logs it without storing values', async () => {
    const { logger } = await import('../../lib/logger.js');
    const response = await request(app).post('/api/news/feedback').send({
      storyId: 'story-1',
      title: 'Bitcoin story',
      publisher: 'Wire',
      eventType: 'general',
      importance: 'low',
      symbol: 'BTC',
      reason: 'not_relevant',
    });

    expect(response.status).toBe(204);
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('[NewsFeedback]'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('not_relevant'));
  });

  it('rejects malformed feedback payloads', async () => {
    const response = await request(app)
      .post('/api/news/feedback')
      .send({ storyId: 'x', title: 'y', reason: 'i-hate-it' });

    expect(response.status).toBe(400);
  });

  it('serves enrichment results for the authenticated user', async () => {
    const payload = {
      enabled: true,
      enrichments: {
        'story-1': {
          id: 'story-1',
          summary: 'A factual sentence.',
          whyItMatters: 'A mechanism sentence.',
          provenance: 'article',
          confidence: 'high',
          enrichedAt: '2026-08-25T06:00:00.000Z',
        },
      },
    };
    mocks.getResponseFor.mockReturnValue(payload);

    const response = await request(app).get('/api/news/enrichment');

    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(mocks.getResponseFor).toHaveBeenCalledWith('test-user-id');
  });
});
