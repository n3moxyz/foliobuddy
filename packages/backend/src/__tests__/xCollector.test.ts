import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  createMany: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('../lib/prisma.js', () => ({
  prisma: {
    xPost: {
      aggregate: mocks.aggregate,
      createMany: mocks.createMany,
      deleteMany: mocks.deleteMany,
    },
  },
}));
vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  XPostCollector,
  batchXSources,
  buildXSearchQuery,
  dailyCallBudget,
  pruneXPosts,
  toXPostRow,
} = await import('../services/news/xCollector.js');
const { rawTweetSchema } = await import('../services/news/twitterApi.js');
const { parseXNewsSources } = await import('../services/news/xSources.js');

const NOW = Date.parse('2026-09-26T08:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ROSTER_KEYS = new Set(['fx_anchor', 'fx_radar']);

// Shape copied from a live twitterapi.io advanced_search response (2026-09), trimmed.
function tweet(overrides: Record<string, unknown> = {}) {
  return {
    type: 'tweet',
    id: '2071000000000000001',
    url: 'https://x.com/fx_anchor/status/2071000000000000001',
    text: 'Samsung HBM4 qualification done &amp; volume ramps in Q1 $MU https://t.co/AbC123',
    createdAt: 'Sat Sep 26 06:44:14 +0000 2026',
    lang: 'en',
    isReply: false,
    author: { type: 'user', userName: 'fx_anchor', name: 'Fixture Anchor', followers: 1000 },
    entities: {
      hashtags: [],
      symbols: [{ text: 'MU', indices: [57, 60] }],
      urls: [{ expanded_url: 'https://www.thelec.kr/news/articleView.html?idxno=1' }],
      user_mentions: [],
    },
    quoted_tweet: null,
    retweeted_tweet: null,
    ...overrides,
  };
}

function page(tweets: unknown[], nextCursor: string | null = null) {
  return new Response(
    JSON.stringify({ tweets, has_next_page: nextCursor !== null, next_cursor: nextCursor ?? '' }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function row(overrides: Record<string, unknown> = {}) {
  return toXPostRow(rawTweetSchema.parse(tweet(overrides)), ROSTER_KEYS, NOW);
}

describe('batchXSources / buildXSearchQuery', () => {
  it('groups handles eight per query, in a stable order', () => {
    const handles = Array.from({ length: 19 }, (_, i) => `fx_handle_${String(i).padStart(2, '0')}`);
    const roster = parseXNewsSources(handles.map((h) => `${h}:radar_only`).join(','));

    const batches = batchXSources([...roster.sources].reverse());

    expect(batches.map((batch) => batch.length)).toEqual([8, 8, 3]);
    expect(batches[0][0].handle).toBe('fx_handle_00');
  });

  it('builds one short OR query per batch that excludes replies', () => {
    expect(buildXSearchQuery(['fx_a', 'fx_b'], 1790000000)).toBe(
      '(from:fx_a OR from:fx_b) since_time:1790000000 -filter:replies'
    );
    const longest = Array.from({ length: 8 }, (_, i) => `fx_fifteen_ch_${i}`);
    expect(buildXSearchQuery(longest, 1790000000).length).toBeLessThan(260);
  });
});

describe('toXPostRow', () => {
  it('stores cleaned text, cashtags, the source-link signal and the quoted post', () => {
    const quoted = {
      id: '2070000000000000009',
      text: 'SK Hynix &amp; Samsung lift HBM prices',
      author: { userName: 'fx_newsdesk' },
    };

    expect(row({ quoted_tweet: quoted })).toEqual({
      id: '2071000000000000001',
      authorHandle: 'fx_anchor',
      authorKey: 'fx_anchor',
      text: 'Samsung HBM4 qualification done & volume ramps in Q1 $MU',
      quotedPostId: '2070000000000000009',
      quotedHandle: 'fx_newsdesk',
      quotedText: 'SK Hynix & Samsung lift HBM prices',
      hasExternalLink: true,
      cashtags: ['MU'],
      lang: 'en',
      postedAt: new Date('2026-09-26T06:44:14.000Z'),
    });
  });

  it('drops replies, reposts, non-roster authors, bad dates and future posts', () => {
    expect(row({ isReply: true })).toBeNull();
    expect(row({ retweeted_tweet: tweet() })).toBeNull();
    expect(row({ author: { userName: 'fx_stranger' } })).toBeNull();
    expect(row({ author: { userName: 'bad-handle' } })).toBeNull();
    expect(row({ createdAt: 'not a date' })).toBeNull();
    expect(row({ createdAt: new Date(NOW + 2 * HOUR).toUTCString() })).toBeNull();
    // Roster matching is case-insensitive, like X handles.
    expect(row({ author: { userName: 'FX_Anchor' } })?.authorKey).toBe('fx_anchor');
  });

  it('keeps a post whose enrichment fields are malformed', () => {
    expect(row({ entities: 'garbage', quoted_tweet: { nope: true } })).toMatchObject({
      hasExternalLink: false,
      cashtags: ['MU'],
      quotedPostId: null,
    });
  });
});

describe('XPostCollector.collect', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    vi.stubEnv('TWITTERAPI_IO_KEY', 'test-key');
    vi.stubEnv('X_NEWS_SOURCES', 'fx_anchor:anchor_source,fx_radar:radar_only');
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mocks.aggregate.mockResolvedValue({ _max: { postedAt: null } });
    mocks.createMany.mockImplementation(async ({ data }: { data: unknown[] }) => ({
      count: data.length,
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('is off without a key or a roster, and never calls the API', async () => {
    vi.stubEnv('TWITTERAPI_IO_KEY', '');
    expect((await new XPostCollector().collect()).status).toBe('disabled');

    vi.stubEnv('TWITTERAPI_IO_KEY', 'test-key');
    vi.stubEnv('X_NEWS_SOURCES', '');
    expect((await new XPostCollector().collect()).status).toBe('disabled');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reads each batch from its newest stored post, sending the key only as a header', async () => {
    mocks.aggregate.mockResolvedValue({ _max: { postedAt: new Date(NOW - HOUR) } });
    fetchMock.mockResolvedValue(page([tweet()]));

    const result = await new XPostCollector().collect();

    expect(result).toEqual({
      status: 'ok',
      calls: 1,
      stored: 1,
      failedBatches: 0,
      truncatedBatches: 0,
    });
    expect(mocks.aggregate).toHaveBeenCalledWith({
      _max: { postedAt: true },
      where: { authorKey: { in: ['fx_anchor', 'fx_radar'] } },
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(`${url.origin}${url.pathname}`).toBe(
      'https://api.twitterapi.io/twitter/tweet/advanced_search'
    );
    // Ten minutes of overlap behind the newest stored post: indexing lags posting.
    const since = Math.floor((NOW - HOUR - 10 * 60 * 1000) / 1000);
    expect(url.searchParams.get('query')).toBe(
      `(from:fx_anchor OR from:fx_radar) since_time:${since} -filter:replies`
    );
    expect(url.searchParams.get('queryType')).toBe('Latest');
    expect(url.toString()).not.toContain('test-key');
    expect(init.headers).toMatchObject({ 'X-API-Key': 'test-key' });
    // A redirect would carry the key to another host.
    expect(init.redirect).toBe('error');
    expect(mocks.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ id: '2071000000000000001' })],
      skipDuplicates: true,
    });
  });

  it('starts a batch with no stored posts at the catch-up floor', async () => {
    fetchMock.mockResolvedValue(page([]));

    await new XPostCollector().collect({ catchUpDays: 3 });

    const url = fetchMock.mock.calls[0][0] as URL;
    expect(url.searchParams.get('query')).toContain(
      `since_time:${Math.floor((NOW - 3 * DAY) / 1000)}`
    );
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('follows cursors until the window is exhausted, writing the batch once', async () => {
    fetchMock
      .mockResolvedValueOnce(page([tweet()], 'cursor-2'))
      .mockResolvedValueOnce(page([tweet({ id: '2071000000000000002' })]));

    const result = await new XPostCollector().collect();

    expect(result.calls).toBe(2);
    expect((fetchMock.mock.calls[1][0] as URL).searchParams.get('cursor')).toBe('cursor-2');
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    expect(mocks.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('stops after the page that reaches an already-stored post, whatever the cursor says', async () => {
    mocks.aggregate.mockResolvedValue({ _max: { postedAt: new Date(NOW - 2 * HOUR) } });
    fetchMock.mockResolvedValue(
      page(
        [
          tweet({ id: '2071000000000000005', createdAt: new Date(NOW - HOUR).toUTCString() }),
          tweet({ id: '2071000000000000004', createdAt: new Date(NOW - 2 * HOUR).toUTCString() }),
        ],
        'always-another-cursor'
      )
    );

    const result = await new XPostCollector().collect();

    expect(result.calls).toBe(1);
  });

  it('stops at the page cap and reports the truncated batch', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => page([tweet({ id: String(9000 + n) })], `c${n++}`));

    const result = await new XPostCollector().collect();

    expect(result.calls).toBe(10);
    expect(result.truncatedBatches).toBe(1);
    expect(mocks.createMany.mock.calls[0][0].data).toHaveLength(10);
  });

  it('stops paging once a page reaches past the window, even if the provider ignores it', async () => {
    const old = new Date(NOW - 5 * DAY).toUTCString();
    fetchMock.mockResolvedValue(page([tweet({ createdAt: old })], 'more'));

    const result = await new XPostCollector().collect();

    expect(result.calls).toBe(1);
  });

  it('writes nothing for a batch that fails midway, so the next poll re-reads it', async () => {
    fetchMock
      .mockResolvedValueOnce(page([tweet()], 'cursor-2'))
      .mockResolvedValueOnce(new Response('upstream error', { status: 500 }));

    const result = await new XPostCollector().collect();

    expect(result).toMatchObject({ status: 'ok', failedBatches: 1 });
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('pauses on a rejected key, missing credits or rate limits instead of retrying every poll', async () => {
    for (const status of [401, 402, 403, 429]) {
      const collector = new XPostCollector();
      fetchMock.mockResolvedValueOnce(new Response('{}', { status }));

      expect((await collector.collect()).status).toBe('paused');
      const calls = fetchMock.mock.calls.length;
      expect((await collector.collect()).status).toBe('paused');
      expect(fetchMock.mock.calls.length).toBe(calls);
    }
  });

  it('rejects a malformed page but drops only the malformed tweets in a good one', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>captcha</html>', { status: 200 }));
    expect((await new XPostCollector().collect()).failedBatches).toBe(1);

    // A numeric id has already lost precision in JSON.parse, so it is dropped too.
    fetchMock.mockResolvedValueOnce(
      page([{ id: 'not-numeric' }, tweet({ id: 2071000000000000002 }), tweet(), 'junk'])
    );
    const result = await new XPostCollector().collect();
    expect(result.stored).toBe(1);
  });

  it('fails loudly when no tweet in a page parses, or the body has no tweets list', async () => {
    // A provider shape change must not look like "no new posts" forever.
    fetchMock.mockResolvedValueOnce(page([{ id: '1', author: { user_name: 'renamed' } }]));
    expect(await new XPostCollector().collect()).toMatchObject({ failedBatches: 1, stored: 0 });

    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'error', msg: 'upstream' }), { status: 200 })
    );
    expect(await new XPostCollector().collect()).toMatchObject({ failedBatches: 1, stored: 0 });
  });

  it('scales the daily budget with the roster, never below 1,000 calls', () => {
    expect(dailyCallBudget(5)).toBe(1000);
    expect(dailyCallBudget(25)).toBe(25 * 96 * 2);
  });

  it('stops for the day at the call budget', async () => {
    let n = 0;
    fetchMock.mockImplementation(async () => page([tweet({ id: String(1000 + n) })], `c${n++}`));
    const collector = new XPostCollector();

    for (let run = 0; run < 100; run++) await collector.collect();
    expect(fetchMock).toHaveBeenCalledTimes(1000);

    expect((await collector.collect()).status).toBe('paused');
    expect(fetchMock).toHaveBeenCalledTimes(1000);
  });

  it('skips a run while another is still in flight', async () => {
    let release: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (release = resolve)));
    const collector = new XPostCollector();

    const first = collector.collect();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect((await collector.collect()).status).toBe('busy');

    release(page([]));
    expect((await first).status).toBe('ok');
  });
});

describe('pruneXPosts', () => {
  it('deletes posts older than the 60-day window', async () => {
    mocks.deleteMany.mockResolvedValue({ count: 3 });

    expect(await pruneXPosts(NOW)).toBe(3);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { postedAt: { lt: new Date(NOW - 60 * DAY) } },
    });
  });
});
