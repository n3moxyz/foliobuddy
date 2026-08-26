import { describe, expect, it } from 'vitest';
import type { ProviderNewsItem } from '../services/providers/types.js';
import {
  isTopStoryCandidate,
  rankStories,
  sanitizePublishedAt,
  titleSignature,
  type NewsCandidate,
} from '../services/news/ranking.js';

const NOW = Date.parse('2026-08-25T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

function makeItem(
  id: string,
  title: string,
  publisher: string,
  hoursAgo: number | null,
  url = `https://example.com/${id}`
): ProviderNewsItem {
  return {
    id,
    title,
    publisher,
    url,
    publishedAt: hoursAgo === null ? null : new Date(NOW - hoursAgo * HOUR).toISOString(),
  };
}

function candidate(
  item: ProviderNewsItem,
  symbol: string | null,
  overrides: Partial<Pick<NewsCandidate, 'held' | 'weight' | 'assetId'>> = {}
): NewsCandidate {
  // Tests use the symbol as the asset id unless a collision is being simulated.
  return { item, assetId: symbol, symbol, held: symbol !== null, weight: 0, ...overrides };
}

describe('sanitizePublishedAt', () => {
  it('rejects missing, malformed, and far-future timestamps; clamps small skew', () => {
    expect(sanitizePublishedAt(null, NOW)).toBeNull();
    expect(sanitizePublishedAt('not-a-date', NOW)).toBeNull();
    expect(sanitizePublishedAt(new Date(NOW + 2 * HOUR).toISOString(), NOW)).toBeNull();
    expect(sanitizePublishedAt(new Date(NOW + 5 * 60 * 1000).toISOString(), NOW)).toBe(NOW);
    expect(sanitizePublishedAt(new Date(NOW - HOUR).toISOString(), NOW)).toBe(NOW - HOUR);
  });
});

describe('titleSignature', () => {
  it('normalizes syndicated headline variants to one signature', () => {
    expect(titleSignature('Nvidia Beats Estimates As Q3 Revenue Jumps')).toBe(
      titleSignature('NVIDIA beats estimates as Q3 revenue jumps!')
    );
    expect(titleSignature('Nvidia beats estimates')).not.toBe(
      titleSignature('Nvidia misses estimates')
    );
  });
});

describe('rankStories', () => {
  it('ranks a material story from a quality source above fresh low-quality commentary', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('filing', 'SEC approves spot Ethereum ETF applications', 'Reuters', 30),
          'ETH'
        ),
        candidate(
          makeItem(
            'chatter',
            'Ethereum trades sideways in quiet session',
            'Random Crypto Blog',
            0.2
          ),
          'ETH'
        ),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['filing', 'chatter']);
    expect(stories[0].ranked.importance).toBe('high');
    expect(stories[0].ranked.rankingReasons).toContain('Regulation');
  });

  it('lets a material two-day-old story outrank a trivial story from minutes ago', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('old-material', 'Nvidia beats estimates as revenue jumps', 'Wire A', 48),
          'NVDA'
        ),
        candidate(
          makeItem('new-trivial', 'Nvidia shares tick higher in early trading', 'Wire A', 0.2),
          'NVDA'
        ),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['old-material', 'new-trivial']);
  });

  it('clusters syndicated copies and represents them with the better publisher', () => {
    const title = 'Broadcom agrees to buy chip designer for $12 billion';
    const stories = rankStories(
      [
        candidate(
          makeItem('copy-benzinga', title, 'Benzinga', 2, 'https://benzinga.com/a'),
          'AVGO'
        ),
        candidate(makeItem('copy-reuters', title, 'Reuters', 3, 'https://reuters.com/b'), 'AVGO'),
      ],
      NOW
    );

    expect(stories).toHaveLength(1);
    expect(stories[0].ranked.publisher).toBe('Reuters');
    expect(stories[0].ranked.sourceTier).toBe(2);
    expect(stories[0].ranked.rankingReasons).toContain('Syndicated by 2 outlets');
  });

  it('preserves article-identity query parameters while dropping tracking parameters', () => {
    const distinct = rankStories(
      [
        candidate(
          makeItem(
            'a',
            'Issuer announces quarterly earnings results',
            'Wire A',
            1,
            'https://news.example.com/article?id=123&utm_source=x'
          ),
          'ABC'
        ),
        candidate(
          makeItem(
            'b',
            'Issuer launches a new product family',
            'Wire B',
            1,
            'https://news.example.com/article?id=456&utm_source=x'
          ),
          'ABC'
        ),
      ],
      NOW
    );
    expect(distinct).toHaveLength(2);

    const title = 'Issuer announces quarterly earnings results';
    const trackedCopy = rankStories(
      [
        candidate(
          makeItem('c', title, 'Wire A', 1, 'https://news.example.com/article?id=123&utm_source=x'),
          'ABC'
        ),
        candidate(
          makeItem('d', title, 'Wire B', 1, 'https://news.example.com/article?utm_medium=y&id=123'),
          'ABC'
        ),
      ],
      NOW
    );
    expect(trackedCopy).toHaveLength(1);
  });

  it('shows a story affecting multiple holdings once, tagged with every symbol', () => {
    const shared = makeItem('shared', 'Memory makers rally on AI server demand', 'Wire A', 4);
    const stories = rankStories(
      [candidate(shared, 'NVDA', { weight: 0.3 }), candidate(shared, 'TSM', { weight: 0.1 })],
      NOW
    );

    expect(stories).toHaveLength(1);
    expect(stories[0].primaryAssetId).toBe('NVDA');
    expect(stories[0].ranked.affectedSymbols).toEqual(['NVDA', 'TSM']);
  });

  it('ranks a held position above an open-trade-only asset when otherwise equal', () => {
    const stories = rankStories(
      [
        candidate(makeItem('trade-only', 'Token update ships on schedule', 'Wire A', 5), 'SOL', {
          held: false,
        }),
        candidate(makeItem('held', 'Token update ships on schedule today', 'Wire A', 5), 'BTC'),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['held', 'trade-only']);
    expect(stories[0].ranked.rankingReasons).toContain('Held position');
    expect(stories[1].ranked.rankingReasons).toContain('Open trade');
  });

  it('treats future-dated stories as undated instead of boosting them', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('future', 'Bitcoin steady ahead of options expiry', 'Wire A', -2),
          'BTC'
        ),
        candidate(makeItem('dated', 'Bitcoin steadies after options expiry', 'Wire A', 6), 'BTC'),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['dated', 'future']);
    expect(stories[1].publishedMs).toBeNull();
    // The raw future ISO string must never leak — the API carries only
    // sanitized timestamps, so the UI cannot render a skewed "just now".
    expect(stories[1].ranked.publishedAt).toBeNull();
    expect(stories[1].ranked.rankingReasons).toContain('Undated');
  });

  it('hides stale stories unless they remain highly material', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('stale-trivial', 'Quiet week for chip stocks', 'Wire A', 20 * 24),
          'NVDA'
        ),
        candidate(
          makeItem(
            'stale-material',
            'Chipmaker files for chapter 11 bankruptcy',
            'Wire A',
            20 * 24
          ),
          'NVDA'
        ),
        candidate(
          makeItem('ancient-material', 'Chipmaker exits chapter 11 bankruptcy', 'Wire A', 40 * 24),
          'NVDA'
        ),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['stale-material']);
  });

  it('suppresses denylisted publishers entirely', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('spam', 'Solana could reach $500, insiders say', 'Analytics Insight', 1),
          'SOL'
        ),
      ],
      NOW
    );
    expect(stories).toEqual([]);
  });

  it('tags macro-only stories as market-wide with no primary asset', () => {
    const stories = rankStories(
      [candidate(makeItem('macro', 'Fed holds rates steady at June meeting', 'Reuters', 2), null)],
      NOW
    );

    expect(stories[0].primaryAssetId).toBeNull();
    expect(stories[0].ranked.affectedSymbols).toEqual([]);
    expect(stories[0].ranked.rankingReasons).toContain('Market-wide');
  });

  it('lets high materiality dominate source tier plus recency combined', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem('hack', 'Exchange hacked for $50M as attacker drains funds', 'Unknown Wire', 47),
          'ETH'
        ),
        candidate(
          makeItem('fresh-trivial', 'Ether edges higher in quiet trading', 'Reuters', 0.1),
          'ETH'
        ),
      ],
      NOW
    );

    expect(stories.map((s) => s.ranked.id)).toEqual(['hack', 'fresh-trivial']);
  });

  it("labels a cluster from its representative's own headline, never a sibling's", () => {
    const base = 'Chipmaker files for chapter 11 bankruptcy protection in delaware court';
    const stories = rankStories(
      [
        candidate(makeItem('clean', `${base} on monday`, 'Unknown Wire', 4), 'NVDA'),
        candidate(makeItem('bait', `${base} heres why it could soar`, 'Reuters', 3), 'NVDA'),
      ],
      NOW
    );

    expect(stories).toHaveLength(1);
    // Reuters (tier 2) represents the cluster, so the shown headline is the
    // clickbait-tailed one — its label must be its OWN classification (low),
    // not the clean sibling's "high"/mna.
    expect(stories[0].ranked.publisher).toBe('Reuters');
    expect(stories[0].ranked.importance).toBe('low');
  });

  it('dates an undated representative from a dated copy of the same article', () => {
    // Same canonical URL (differently attributed) — the one merge path that
    // can legitimately join an undated copy to a dated one.
    const title = 'MicroStrategy announces $2B convertible notes offering';
    const url = 'https://www.reuters.com/markets/mstr-notes/';
    const stories = rankStories(
      [
        candidate(makeItem('undated-reuters', title, 'Reuters', null, url), 'MSTR'),
        candidate(makeItem('dated-copy', title, 'Daily Blog', 1, url), 'MSTR'),
      ],
      NOW
    );

    expect(stories).toHaveLength(1);
    expect(stories[0].ranked.publisher).toBe('Reuters');
    expect(stories[0].publishedMs).toBe(NOW - 1 * HOUR);
    expect(stories[0].ranked.publishedAt).toBe(new Date(NOW - 1 * HOUR).toISOString());
    expect(stories[0].ranked.rankingReasons).not.toContain('Undated');
  });

  it('never merges same-signature stories on a timestamp it cannot verify', () => {
    const title = 'Token migration deadline approaches for holders';
    const stories = rankStories(
      [
        candidate(makeItem('dated', title, 'Wire A', 5, 'https://a.example/1'), 'BTC'),
        candidate(makeItem('undated', title, 'Wire B', null, 'https://b.example/2'), 'BTC'),
      ],
      NOW
    );

    expect(stories).toHaveLength(2);
  });
});

describe('isTopStoryCandidate', () => {
  it('requires high materiality from a credible source', () => {
    const [credible] = rankStories(
      [
        candidate(
          makeItem('a', 'SEC approves spot Ethereum ETF applications', 'Reuters', 1),
          'ETH'
        ),
      ],
      NOW
    );
    const [poorSource] = rankStories(
      [
        candidate(
          makeItem('b', 'Exchange hacked for $50M, funds drained', 'Totally Unknown Blog', 1),
          'ETH'
        ),
      ],
      NOW
    );
    const [trivial] = rankStories(
      [candidate(makeItem('c', 'Ethereum trades in narrow range', 'Reuters', 1), 'ETH')],
      NOW
    );

    expect(isTopStoryCandidate(credible)).toBe(true);
    expect(isTopStoryCandidate(poorSource)).toBe(false);
    expect(isTopStoryCandidate(trivial)).toBe(false);
  });

  it('grants primary status to articles from a holding official domain', () => {
    const stories = rankStories(
      [
        candidate(
          makeItem(
            'ir',
            'Nvidia announces quarterly results and guidance',
            'NVIDIA Newsroom',
            2,
            'https://nvidianews.nvidia.com/news/q3'
          ),
          'NVDA'
        ),
      ],
      NOW,
      ['nvidia.com']
    );

    expect(stories[0].ranked).toMatchObject({
      primarySource: true,
      sourceTier: 1,
      sourceLabel: 'Company announcement',
    });
    expect(isTopStoryCandidate(stories[0])).toBe(true);
  });

  it('admits tier-3 specialists only with independent corroboration', () => {
    const title = 'Bridge protocol hacked for $120M as attacker drains funds';
    const [uncorroborated] = rankStories(
      [candidate(makeItem('solo', title, 'CoinDesk', 2, 'https://coindesk.com/a'), 'ETH')],
      NOW
    );
    const [corroborated] = rankStories(
      [
        candidate(makeItem('copy-a', title, 'CoinDesk', 2, 'https://coindesk.com/a'), 'ETH'),
        candidate(makeItem('copy-b', title, 'The Block', 3, 'https://theblock.co/b'), 'ETH'),
      ],
      NOW
    );

    expect(uncorroborated.ranked.sourceTier).toBe(3);
    expect(isTopStoryCandidate(uncorroborated)).toBe(false);
    expect(corroborated.corroboration).toBe(2);
    expect(isTopStoryCandidate(corroborated)).toBe(true);
  });

  it('does not count publisher aliases as independent corroboration', () => {
    const title = 'Bridge protocol hacked for $120M as attacker drains funds';
    const [aliased] = rankStories(
      [
        candidate(makeItem('a', title, 'CoinDesk', 2, 'https://coindesk.com/a'), 'ETH'),
        candidate(makeItem('b', title, 'CoinDesk.com', 3, 'https://coindesk.com/b'), 'ETH'),
      ],
      NOW
    );

    expect(aliased.corroboration).toBe(1);
    expect(isTopStoryCandidate(aliased)).toBe(false);
  });
});
