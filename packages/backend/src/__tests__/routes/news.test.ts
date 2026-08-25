import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  getPortfolioNews: vi.fn(),
  getResponseFor: vi.fn(),
}));

vi.mock('../../services/newsService.js', () => ({
  newsService: { getPortfolioNews: mocks.getPortfolioNews },
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

  it('propagates service failures to the error handler as 500s', async () => {
    mocks.getPortfolioNews.mockRejectedValue(new Error('yahoo down'));

    const response = await request(app).get('/api/news');

    expect(response.status).toBe(500);
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
