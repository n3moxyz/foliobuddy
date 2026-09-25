import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/logger.js', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { GoogleNewsClient, buildGoogleNewsUrl, isAggregatorRedirectUrl, parseGoogleNewsRss } =
  await import('../services/news/googleNews.js');

// Shape copied from a live Google News RSS response (2026-09), trimmed.
const FIXTURE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel>
<title>"DBS Group Holdings" when:14d - Google News</title>
<item><title>Singapore’s gold hub ambition gets lift with DBS vault expansion - The Straits Times</title><link>https://news.google.com/rss/articles/CBMiAAA?oc=5</link><guid isPermaLink="false">CBMiAAA</guid><pubDate>Tue, 22 Sep 2026 07:00:00 GMT</pubDate><description>&lt;a href="https://news.google.com/rss/articles/CBMiAAA?oc=5"&gt;x&lt;/a&gt;</description><source url="https://www.straitstimes.com">The Straits Times</source></item>
<item><title>Jefferies initiates DBS &amp; OCBC at &#39;buy&#39; &gt;D05.SG - Moomoo</title><link>https://news.google.com/rss/articles/CBMiBBB?oc=5</link><guid isPermaLink="false">CBMiBBB</guid><pubDate>Mon, 21 Sep 2026 01:30:00 GMT</pubDate><source url="https://www.moomoo.com">Moomoo</source></item>
<item><title>Oversea-Chinese Banking Corporation Limited (O39.SI) stock price, news, quote and history - Yahoo Finance Singapore</title><link>https://news.google.com/rss/articles/CBMiCCC?oc=5</link><guid isPermaLink="false">CBMiCCC</guid><pubDate>Mon, 21 Sep 2026 01:00:00 GMT</pubDate><source url="https://sg.finance.yahoo.com">Yahoo Finance Singapore</source></item>
<item><title>Bad link - Spam</title><link>javascript:alert(1)</link><guid isPermaLink="false">CBMiDDD</guid><source url="https://spam.example">Spam</source></item>
<item><title><![CDATA[DBS names new chairman]]></title><link>https://news.google.com/rss/articles/CBMiEEE?oc=5</link><pubDate>not a date</pubDate></item>
</channel></rss>`;

function rssResponse(body: string, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'application/xml' } });
}

describe('parseGoogleNewsRss', () => {
  it('maps items, strips the publisher suffix, decodes entities, and keeps the publisher site', () => {
    const items = parseGoogleNewsRss(FIXTURE);

    expect(items.map((item) => item.id)).toEqual([
      'gnews:CBMiAAA',
      'gnews:CBMiBBB',
      'gnews:https://news.google.com/rss/articles/CBMiEEE?oc=5',
    ]);
    expect(items[0]).toEqual({
      id: 'gnews:CBMiAAA',
      title: 'Singapore’s gold hub ambition gets lift with DBS vault expansion',
      publisher: 'The Straits Times',
      url: 'https://news.google.com/rss/articles/CBMiAAA?oc=5',
      publishedAt: '2026-09-22T07:00:00.000Z',
      sourceUrl: 'https://www.straitstimes.com/',
    });
    expect(items[1].title).toBe("Jefferies initiates DBS & OCBC at 'buy' >D05.SG");
  });

  it('drops quote pages and non-http links, and tolerates missing source/date', () => {
    const items = parseGoogleNewsRss(FIXTURE);

    expect(items.some((item) => item.title.includes('stock price'))).toBe(false);
    expect(items.some((item) => item.url.startsWith('javascript:'))).toBe(false);
    expect(items[2]).toMatchObject({
      title: 'DBS names new chairman',
      publisher: 'Google News',
      publishedAt: null,
      sourceUrl: undefined,
    });
  });

  it('never reads markup inside CDATA as tags (no forged items)', () => {
    const payload =
      '<![CDATA[Quarterly </title></item><item><title>FAKE: acquisition</title>' +
      '<link>https://news.google.com/rss/articles/FAKE</link>' +
      '<source url="https://www.sec.gov">SEC</source></item><item><title> results]]>';
    const xml = `<rss><channel><item><title>${payload}</title><link>https://news.google.com/rss/articles/REAL</link><source url="https://www.straitstimes.com">The Straits Times</source></item></channel></rss>`;

    const items = parseGoogleNewsRss(xml);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'gnews:https://news.google.com/rss/articles/REAL',
      publisher: 'The Straits Times',
      sourceUrl: 'https://www.straitstimes.com/',
    });
    expect(items[0].title).toContain('</item><item><title>FAKE: acquisition</title>');
  });

  it('only accepts links through Google News redirects', () => {
    const xml =
      '<rss><channel><item><title>Direct link</title><link>https://evil.example/x</link></item>' +
      '<item><title>Plain http</title><link>http://news.google.com/rss/articles/A</link></item>' +
      '<item><title>Redirect</title><link>https://news.google.com/rss/articles/B</link></item></channel></rss>';

    expect(parseGoogleNewsRss(xml).map((item) => item.title)).toEqual(['Redirect']);
  });

  it('stays linear on hostile structure', () => {
    const started = performance.now();
    parseGoogleNewsRss('<itemx'.repeat(200_000) + '>');
    parseGoogleNewsRss('<item>'.repeat(200_000));
    parseGoogleNewsRss('<![CDATA['.repeat(100_000));
    parseGoogleNewsRss(`<item><title>${'&a'.repeat(300_000)}</title></item>`);
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('returns nothing for malformed or empty feeds', () => {
    expect(parseGoogleNewsRss('')).toEqual([]);
    expect(parseGoogleNewsRss('<html>captcha</html>')).toEqual([]);
  });
});

describe('buildGoogleNewsUrl', () => {
  it('builds a Singapore-edition search with a recency window', () => {
    const url = new URL(buildGoogleNewsUrl('"DBS Group Holdings"', 14));
    expect(`${url.origin}${url.pathname}`).toBe('https://news.google.com/rss/search');
    expect(url.searchParams.get('q')).toBe('"DBS Group Holdings" when:14d');
    expect(url.searchParams.get('hl')).toBe('en-SG');
    expect(url.searchParams.get('gl')).toBe('SG');
    expect(url.searchParams.get('ceid')).toBe('SG:en');
  });
});

describe('isAggregatorRedirectUrl', () => {
  it('flags only news.google.com links', () => {
    expect(isAggregatorRedirectUrl('https://news.google.com/rss/articles/CBMi?oc=5')).toBe(true);
    expect(isAggregatorRedirectUrl('https://www.straitstimes.com/business/x')).toBe(false);
    expect(isAggregatorRedirectUrl('not a url')).toBe(false);
  });
});

describe('GoogleNewsClient.search', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-24T00:00:00.000Z'));
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('returns parsed items up to the limit and serves repeats from cache', async () => {
    fetchMock.mockResolvedValue(rssResponse(FIXTURE));
    const client = new GoogleNewsClient();

    const first = await client.search('"DBS Group Holdings"', 14, 2);
    const second = await client.search('"DBS Group Holdings"', 14, 10);

    expect(first.map((item) => item.id)).toEqual(['gnews:CBMiAAA', 'gnews:CBMiBBB']);
    expect(second).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pauses every query for 10 minutes after a blocking status', async () => {
    fetchMock.mockResolvedValue(rssResponse('Too many requests', 429));
    const client = new GoogleNewsClient();

    expect(await client.search('"DBS Group Holdings"', 14, 10)).toEqual([]);
    expect(await client.search('"Keppel"', 14, 10)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-24T00:10:01.000Z'));
    fetchMock.mockResolvedValue(rssResponse(FIXTURE));
    expect(await client.search('"Keppel"', 14, 10)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('pauses briefly after a network error and never rejects', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const client = new GoogleNewsClient();

    await expect(client.search('"DBS Group Holdings"', 14, 10)).resolves.toEqual([]);
    expect(await client.search('"Keppel"', 14, 10)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-09-24T00:02:01.000Z'));
    fetchMock.mockResolvedValue(rssResponse(FIXTURE));
    expect(await client.search('"Keppel"', 14, 10)).toHaveLength(3);
  });

  it('treats a 200 interstitial page as a block instead of caching it', async () => {
    fetchMock.mockResolvedValue(rssResponse('<html><body>Before you continue</body></html>'));
    const client = new GoogleNewsClient();

    expect(await client.search('"DBS Group Holdings"', 14, 10)).toEqual([]);
    expect(await client.search('"Keppel"', 14, 10)).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not pause or cache on other HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(rssResponse('oops', 500));
    const client = new GoogleNewsClient();

    expect(await client.search('"DBS Group Holdings"', 14, 10)).toEqual([]);
    fetchMock.mockResolvedValueOnce(rssResponse(FIXTURE));
    expect(await client.search('"DBS Group Holdings"', 14, 10)).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
