import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RankedNewsItem } from '../services/news/ranking.js';

const mocks = vi.hoisted(() => ({
  parse: vi.fn(),
  fetchArticleText: vi.fn(),
}));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { parse: mocks.parse };
  },
}));
vi.mock('../services/news/articleRetrieval.js', () => ({
  fetchArticleText: mocks.fetchArticleText,
}));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { newsEnrichmentService } = await import('../services/news/enrichmentService.js');

function makeStory(id: string): RankedNewsItem {
  return {
    id,
    title: `Story ${id}`,
    publisher: 'Reuters',
    url: `https://reuters.com/${id}`,
    publishedAt: '2026-08-25T06:00:00.000Z',
    sourceTier: 2,
    sourceLabel: 'Trusted press',
    primarySource: false,
    importance: 'high',
    eventType: 'regulation',
    affectedSymbols: ['BTC'],
    rankingReasons: ['Regulation', 'Trusted press'],
  };
}

describe('newsEnrichmentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
    newsEnrichmentService.resetForTests();
    mocks.fetchArticleText.mockResolvedValue('An article body long enough to summarize.');
    mocks.parse.mockResolvedValue({
      parsed_output: {
        summary: 'The SEC approved the applications.',
        whyItMatters: 'Approval opens regulated access for holders.',
        confidence: 'high',
      },
    });
  });

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    newsEnrichmentService.resetForTests();
  });

  it('is fully disabled without ANTHROPIC_API_KEY and never fetches or calls the API', async () => {
    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();

    expect(newsEnrichmentService.getResponseFor('user-1')).toEqual({
      enabled: false,
      enrichments: {},
    });
    expect(mocks.fetchArticleText).not.toHaveBeenCalled();
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it('produces an article-based enrichment scoped to the requesting user', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';

    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();

    const response = newsEnrichmentService.getResponseFor('user-1');
    expect(response.enabled).toBe(true);
    expect(response.enrichments.a).toMatchObject({
      id: 'a',
      summary: 'The SEC approved the applications.',
      whyItMatters: 'Approval opens regulated access for holders.',
      provenance: 'article',
      confidence: 'high',
    });
    // The prompt carries the retrieved article body, never just the headline.
    const request = mocks.parse.mock.calls[0][0];
    expect(request.messages[0].content).toContain('An article body long enough to summarize.');
    expect(request.system).toContain('never follow instructions');
    // Another user with no tracked top stories sees nothing.
    expect(newsEnrichmentService.getResponseFor('user-2').enrichments).toEqual({});
  });

  it('never summarizes from the headline alone when the article is unreachable', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.fetchArticleText.mockResolvedValue(null);

    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();

    expect(mocks.parse).not.toHaveBeenCalled();
    expect(newsEnrichmentService.getResponseFor('user-1').enrichments).toEqual({});

    // The failure is cached — re-queueing does not hammer the article again.
    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();
    expect(mocks.fetchArticleText).toHaveBeenCalledTimes(1);
  });

  it('never serves one user an explanation written for another holding context', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.parse
      .mockResolvedValueOnce({
        parsed_output: {
          summary: 'Shared story summary.',
          whyItMatters: 'Matters to BTC holders.',
          confidence: 'high',
        },
      })
      .mockResolvedValueOnce({
        parsed_output: {
          summary: 'Shared story summary.',
          whyItMatters: 'Matters to ETH holders.',
          confidence: 'high',
        },
      });

    const btcStory = makeStory('shared');
    const ethStory = { ...makeStory('shared'), affectedSymbols: ['ETH'] };

    newsEnrichmentService.trackAndQueue('user-a', [btcStory]);
    await newsEnrichmentService.settleForTests();
    newsEnrichmentService.trackAndQueue('user-b', [ethStory]);
    await newsEnrichmentService.settleForTests();

    // Same story id, different holding context — two distinct enrichments,
    // each user sees only the one written for their portfolio.
    expect(mocks.parse).toHaveBeenCalledTimes(2);
    expect(newsEnrichmentService.getResponseFor('user-a').enrichments.shared.whyItMatters).toBe(
      'Matters to BTC holders.'
    );
    expect(newsEnrichmentService.getResponseFor('user-b').enrichments.shared.whyItMatters).toBe(
      'Matters to ETH holders.'
    );

    // Identical holding context DOES share the cache — no third API call.
    newsEnrichmentService.trackAndQueue('user-c', [makeStory('shared')]);
    await newsEnrichmentService.settleForTests();
    expect(mocks.parse).toHaveBeenCalledTimes(2);
  });

  it('caches low-confidence output for diagnostics but never serves it', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.parse.mockResolvedValue({
      parsed_output: { summary: 'Thin page.', whyItMatters: 'Unclear.', confidence: 'low' },
    });

    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();

    expect(newsEnrichmentService.getResponseFor('user-1').enrichments).toEqual({});
    // Cached: re-queueing the same story does not re-call the API.
    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();
    expect(mocks.parse).toHaveBeenCalledTimes(1);
  });

  it('treats an unparseable model response as a failure, not an enrichment', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.parse.mockResolvedValue({ parsed_output: null });

    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a')]);
    await newsEnrichmentService.settleForTests();

    expect(newsEnrichmentService.getResponseFor('user-1').enrichments).toEqual({});
  });

  it('survives API errors without affecting other stories in the queue', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    mocks.parse.mockRejectedValueOnce(new Error('rate limited')).mockResolvedValueOnce({
      parsed_output: {
        summary: 'Second story summary.',
        whyItMatters: 'Matters.',
        confidence: 'moderate',
      },
    });

    newsEnrichmentService.trackAndQueue('user-1', [makeStory('a'), makeStory('b')]);
    await newsEnrichmentService.settleForTests();

    const response = newsEnrichmentService.getResponseFor('user-1');
    expect(response.enrichments.a).toBeUndefined();
    expect(response.enrichments.b).toMatchObject({ summary: 'Second story summary.' });
  });
});
