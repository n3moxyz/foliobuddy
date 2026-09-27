import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));

vi.mock('../lib/prisma.js', () => ({ prisma: { xPost: { findMany: mocks.findMany } } }));
vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { clearXPostCache, loadRecentXPosts, matchXPosts, xMatchPlan } =
  await import('../services/news/xPostMatching.js');
const { parseXNewsSources } = await import('../services/news/xSources.js');
const { extractCashtags } = await import('../services/news/xPostText.js');

type StoredXPost = Awaited<ReturnType<typeof loadRecentXPosts>>[number];

const ROSTER = parseXNewsSources(
  'fx_anchor:anchor_source,fx_relay:anchor_when_source_backed,fx_corro:corroboration_source,fx_radar:radar_only'
);

function post(id: string, text: string, overrides: Partial<StoredXPost> = {}): StoredXPost {
  return {
    id,
    authorHandle: 'fx_anchor',
    authorKey: 'fx_anchor',
    text,
    quotedPostId: null,
    quotedText: null,
    hasExternalLink: false,
    cashtags: extractCashtags(text),
    postedAt: new Date('2026-09-26T06:00:00.000Z'),
    ...overrides,
  };
}

function by(handle: string): Partial<StoredXPost> {
  return { authorHandle: handle, authorKey: handle.toLowerCase() };
}

function equity(providerAssetId: string, name: string) {
  return {
    symbol: providerAssetId,
    name,
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId,
  };
}

const NVDA = { assetId: 'a-nvda', plan: { cashtags: ['NVDA'], terms: ['NVIDIA'] } };
const HYNIX = { assetId: 'a-hynix', plan: { cashtags: ['HXSCL'], terms: ['Hynix'] } };
const MU = { assetId: 'a-mu', plan: { cashtags: ['MU'], terms: ['Micron'] } };

function ids(items: Array<{ id: string }> | undefined) {
  return (items ?? []).map((item) => item.id);
}

describe('xMatchPlan', () => {
  it('uses the cashtag and the company name for US listings', () => {
    expect(xMatchPlan(equity('NVDA', 'NVIDIA Corporation'))).toEqual({
      cashtags: ['NVDA'],
      terms: ['NVIDIA'],
    });
    expect(xMatchPlan(equity('BRK-B', 'Berkshire Hathaway Inc.'))).toEqual({
      cashtags: ['BRK.B'],
      terms: ['Berkshire'],
    });
  });

  it('uses aliases where the legal name is not what the roster writes', () => {
    // "Taiwan" alone is too generic to stand for TSMC.
    expect(xMatchPlan(equity('TSM', 'Taiwan Semiconductor Manufacturing Company Limited'))).toEqual(
      { cashtags: ['TSM'], terms: ['TSMC'] }
    );
    // "SK" is too short to derive; the OTC ticker is how US accounts tag it.
    expect(xMatchPlan(equity('000660.KS', 'SK hynix Inc.'))).toEqual({
      cashtags: ['HXSCL'],
      terms: ['SK hynix', 'Hynix'],
    });
  });

  it("never derives a name from a fund's issuer or from a common word", () => {
    // "Vanguard" and "Invesco" name issuers, not funds; "Target…" starts sentences.
    expect(xMatchPlan(equity('VOO', 'Vanguard S&P 500 ETF'))).toEqual({
      cashtags: ['VOO'],
      terms: [],
    });
    expect(xMatchPlan(equity('QQQ', 'Invesco QQQ Trust, Series 1'))?.terms).toEqual([]);
    expect(xMatchPlan(equity('TGT', 'Target Corporation'))?.terms).toEqual([]);
  });

  it('matches suffixed listings by name only, coins by cashtag only, and skips funds', () => {
    expect(xMatchPlan(equity('285A.T', 'Kioxia Holdings Corporation'))).toEqual({
      cashtags: [],
      terms: ['Kioxia'],
    });
    expect(
      xMatchPlan({
        symbol: 'SOL',
        name: 'Solana',
        category: 'LIQUID_CRYPTO',
        priceProvider: 'coingecko',
        providerAssetId: 'solana',
      })
    ).toEqual({ cashtags: ['SOL'], terms: [] });
    expect(
      xMatchPlan({ ...equity('0P0000XXXX.SI', 'Some Fund'), category: 'UNIT_TRUST' })
    ).toBeNull();
    expect(xMatchPlan({ ...equity('FUND', 'Manual Fund'), priceProvider: 'manual' })).toBeNull();
  });
});

describe('matchXPosts', () => {
  it('matches by cashtag, by capitalized name, and through the quoted post', () => {
    const posts = [
      post('1', 'Nvidia Rubin orders keep climbing into next year'),
      post('2', 'Long $MU into the print, supply is tight'),
      post('3', 'This is the key datapoint for the quarter', {
        quotedText: 'SK Hynix HBM4 yields reach 70%',
      }),
      post('4', 'honestly the nvidia and micron threads are exhausting today'),
      post('5', 'Nvidia and Micron both gain from this memory shift'),
    ];

    const result = matchXPosts([NVDA, HYNIX, MU], posts, { includeRadar: false, roster: ROSTER });

    expect(ids(result.get('a-nvda'))).toEqual(['x:1', 'x:5']);
    expect(ids(result.get('a-mu'))).toEqual(['x:2', 'x:5']);
    expect(ids(result.get('a-hynix'))).toEqual(['x:3']);
  });

  it("matches a brand's own lowercase spelling and names followed by Korean particles", () => {
    const HYNIX_BRAND = {
      assetId: 'a-hynix',
      plan: { cashtags: [], terms: ['SK hynix', 'Hynix'] },
    };
    const TSM = { assetId: 'a-tsm', plan: { cashtags: ['TSM'], terms: ['TSMC'] } };
    const posts = [
      post('60', 'SK hynix begins HBM4 mass production for next year'),
      post('61', 'TSMC의 2나노 수율이 예상보다 빠르게 올라가는 중이라고 합니다'),
      post('62', '$TSM는 오늘 강세, 파운드리 가격 인상 소식이 반영되는 중'),
      post('63', 'the sk hynix story everyone keeps talking about today'),
    ];

    const result = matchXPosts([HYNIX_BRAND, TSM], posts, { includeRadar: false, roster: ROSTER });

    expect(ids(result.get('a-hynix'))).toEqual(['x:60']);
    expect(ids(result.get('a-tsm'))).toEqual(['x:61', 'x:62']);
  });

  it('keeps the stronger post when roster accounts quote each other, in the feed and on the page', () => {
    const posts = [
      post('70', 'Hearing Nvidia wins a large Rubin order this quarter', by('fx_radar')),
      post('71', 'Confirmed: Nvidia wins a large Rubin order this quarter', {
        quotedPostId: '70',
      }),
      post('72', 'Nvidia raises its Rubin build plan by a third again'),
      post('73', 'Adding context on the Nvidia build plan change here', {
        ...by('fx_corro'),
        quotedPostId: '72',
      }),
    ];
    const kept = (includeRadar: boolean) =>
      ids(matchXPosts([NVDA], posts, { includeRadar, roster: ROSTER }).get('a-nvda'));

    // The anchor's confirmation outranks the radar lead it quotes; the anchor's
    // original outranks the corroborating quote. Both views agree.
    expect(kept(false)).toEqual(['x:71', 'x:72']);
    expect(kept(true)).toEqual(['x:71', 'x:72']);
  });

  it('keeps the original when an equal-role account quotes it', () => {
    const posts = [
      post('80', 'Nvidia raises its Rubin build plan by a third again'),
      post('81', 'Worth repeating: Nvidia raises its Rubin plan again', { quotedPostId: '80' }),
    ];

    expect(
      ids(matchXPosts([NVDA], posts, { includeRadar: true, roster: ROSTER }).get('a-nvda'))
    ).toEqual(['x:80']);
  });

  it('builds items with an X link, the role caps, and the opening to classify', () => {
    const [item] =
      matchXPosts([NVDA], [post('1', 'Nvidia Rubin orders keep climbing into next year')], {
        includeRadar: false,
        roster: ROSTER,
      }).get('a-nvda') ?? [];

    expect(item).toEqual({
      id: 'x:1',
      title: 'Nvidia Rubin orders keep climbing into next year',
      publisher: '@fx_anchor',
      url: 'https://x.com/fx_anchor/status/1',
      publishedAt: '2026-09-26T06:00:00.000Z',
      xRole: 'anchor',
      maxImportance: 'high',
      classificationText: 'Nvidia Rubin orders keep climbing into next year',
    });
  });

  it('gates by roster role: radar only on a holding page, corroboration capped at medium', () => {
    const posts = [
      post('10', 'Nvidia supply chain check from the radar desk', by('fx_radar')),
      post('11', 'Nvidia confirms the Rubin ramp schedule today', {
        ...by('fx_relay'),
        hasExternalLink: true,
      }),
      post('12', 'Nvidia rumor making the rounds again this week', by('fx_relay')),
      post('13', 'Nvidia channel checks look healthy this month', by('fx_corro')),
    ];
    const roles = (includeRadar: boolean) =>
      (matchXPosts([NVDA], posts, { includeRadar, roster: ROSTER }).get('a-nvda') ?? []).map(
        (item) => [item.id, item.xRole, item.maxImportance]
      );

    expect(roles(false)).toEqual([
      ['x:11', 'anchor', 'high'],
      ['x:12', 'corroboration', 'medium'],
      ['x:13', 'corroboration', 'medium'],
    ]);
    expect(roles(true)).toContainEqual(['x:10', 'radar', 'medium']);
  });

  it('drops empty posts, roster quotes of roster posts, and authors off the roster', () => {
    const posts = [
      post('20', '👀 $NVDA https://t.co/abc'),
      post('21', 'Watchlist for tomorrow: $NVDA $AMD $AVGO $MU $TSM $INTC'),
      post('22', 'Nvidia raises the Rubin build plan by a third'),
      post('23', 'Worth reading this one about Nvidia plans', {
        ...by('fx_corro'),
        quotedPostId: '22',
      }),
      post('24', 'Nvidia from an account since removed from the roster', by('fx_gone')),
      post('25', 'Nvidia from a row with a malformed handle', by('bad-handle')),
    ];

    const items = matchXPosts([NVDA], posts, { includeRadar: true, roster: ROSTER }).get('a-nvda');

    expect(ids(items)).toEqual(['x:21', 'x:22']);
    // A post tagging six or more tickers is a watchlist, never important.
    expect(items?.[0].maxImportance).toBe('low');
  });

  it('needs the holding named up front: a late aside or market wrap is not about it', () => {
    const filler = 'Broad strength today across photonics, power and equipment names. '.repeat(3);
    const posts = [
      post('40', `${filler}Nvidia also moved a little.`),
      post('41', 'Quick take on the quoted note, worth a read today', {
        quotedText: 'Nvidia lifts its Rubin build plan for next year',
      }),
      post('42', `${filler}Also watching $NVDA into the close.`),
    ];

    const items = matchXPosts([NVDA], posts, { includeRadar: true, roster: ROSTER }).get('a-nvda');

    expect(ids(items)).toEqual(['x:41']);
  });

  it('caps watchlists (four or more tickers) and questions at low importance', () => {
    const posts = [
      post('50', 'Adding to $NVDA $AMD $AVGO $MU on this dip today'),
      post('51', 'How do you think Nvidia earnings will turn out?'),
      post('52', 'Nvidia and $AMD both gain from the same order'),
    ];

    const items = matchXPosts([NVDA], posts, { includeRadar: true, roster: ROSTER }).get('a-nvda');

    expect(items?.map((item) => [item.id, item.maxImportance])).toEqual([
      ['x:50', 'low'],
      ['x:51', 'low'],
      ['x:52', 'high'],
    ]);
  });

  it('shows long posts cut at a word boundary', () => {
    const long = `Nvidia ${'supply chain detail '.repeat(30)}`.trim();

    const [item] =
      matchXPosts([NVDA], [post('30', long)], { includeRadar: false, roster: ROSTER }).get(
        'a-nvda'
      ) ?? [];

    expect(item.title.length).toBeLessThanOrEqual(280);
    expect(item.title.endsWith('…')).toBe(true);
  });

  it('matches nothing without a roster', () => {
    const empty = parseXNewsSources('');
    expect(
      matchXPosts([NVDA], [post('1', 'Nvidia news')], { includeRadar: true, roster: empty }).size
    ).toBe(0);
  });
});

describe('loadRecentXPosts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearXPostCache();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-26T08:00:00.000Z'));
    vi.stubEnv('X_NEWS_SOURCES', 'fx_anchor:anchor_source');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it('reads nothing when no roster is configured', async () => {
    vi.stubEnv('X_NEWS_SOURCES', '');

    expect(await loadRecentXPosts(14)).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it('loads the window newest first and reuses it briefly', async () => {
    mocks.findMany.mockResolvedValue([post('1', 'Nvidia news')]);

    await loadRecentXPosts(14);
    await loadRecentXPosts(14);

    expect(mocks.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { postedAt: { gte: new Date('2026-09-12T08:00:00.000Z') } },
        orderBy: { postedAt: 'desc' },
      })
    );
  });

  it('never rejects: a database failure means no posts', async () => {
    mocks.findMany.mockRejectedValue(new Error('db down'));

    expect(await loadRecentXPosts(60)).toEqual([]);
  });
});
