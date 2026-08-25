import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { extractArticleText, fetchArticleText, isPrivateIp } =
  await import('../services/news/articleRetrieval.js');

const LONG_SENTENCE =
  'This paragraph carries enough characters to clear the forty character minimum easily. ';

describe('extractArticleText', () => {
  it('extracts paragraph text, preferring the article block and dropping script/style', () => {
    const html = `
      <html><head><style>p { color: red }</style><script>var x = "<p>fake</p>";</script></head>
      <body>
        <p>${LONG_SENTENCE}Navigation boilerplate outside the article block.</p>
        <article>
          ${Array.from({ length: 8 }, (_, i) => `<p>${LONG_SENTENCE}Paragraph ${i}.</p>`).join('')}
        </article>
      </body></html>`;

    const text = extractArticleText(html);

    expect(text).toContain('Paragraph 0.');
    expect(text).not.toContain('fake');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('Navigation boilerplate');
  });

  it('returns null when too little readable text survives extraction', () => {
    expect(extractArticleText('<p>Short.</p>')).toBeNull();
  });

  it(
    'stays linear on hostile HTML full of unclosed tags (ReDoS regression)',
    { timeout: 5000 },
    () => {
      // 1.4MB of unclosed openers — the old regex extractor stalled the event
      // loop for ~60s on this shape; the linear tokenizer must finish instantly.
      const hostile = '<aside><p '.repeat(140_000);
      const started = Date.now();
      extractArticleText(hostile);
      expect(Date.now() - started).toBeLessThan(2000);
    }
  );
});

describe('isPrivateIp', () => {
  it('classifies loopback, RFC1918, link-local, CGNAT, and IPv6 private ranges', () => {
    expect(isPrivateIp('127.0.0.1', 4)).toBe(true);
    expect(isPrivateIp('10.1.2.3', 4)).toBe(true);
    expect(isPrivateIp('169.254.169.254', 4)).toBe(true);
    expect(isPrivateIp('172.20.0.1', 4)).toBe(true);
    expect(isPrivateIp('192.168.1.1', 4)).toBe(true);
    expect(isPrivateIp('100.90.0.1', 4)).toBe(true);
    expect(isPrivateIp('::1', 6)).toBe(true);
    expect(isPrivateIp('fd00::1', 6)).toBe(true);
    expect(isPrivateIp('::ffff:10.0.0.1', 6)).toBe(true);
    // fe80::/10 spans fe80–febf — not just literal "fe80" (review regression).
    expect(isPrivateIp('fe80::1', 6)).toBe(true);
    expect(isPrivateIp('fe9f::1', 6)).toBe(true);
    expect(isPrivateIp('feb0::1', 6)).toBe(true);
    expect(isPrivateIp('fec0::1', 6)).toBe(true);
    expect(isPrivateIp('8.8.8.8', 4)).toBe(false);
    expect(isPrivateIp('2606:4700::1111', 6)).toBe(false);
  });
});

describe('fetchArticleText', () => {
  const goodHtml = `<article>${Array.from(
    { length: 10 },
    (_, i) => `<p>${LONG_SENTENCE}Body ${i}.</p>`
  ).join('')}</article>`;

  function htmlResponse(body: string, init: ResponseInit = {}) {
    return new Response(body, {
      status: 200,
      headers: { 'content-type': 'text/html' },
      ...init,
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
    mocks.fetch.mockResolvedValue(htmlResponse(goodHtml));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches and extracts a normal article', async () => {
    const text = await fetchArticleText('https://news.example.com/story');
    expect(text).toContain('Body 0.');
  });

  it('rejects unfetchable urls and hosts resolving to private space', async () => {
    expect(await fetchArticleText('http://localhost/admin')).toBeNull();
    expect(await fetchArticleText('ftp://news.example.com/x')).toBeNull();

    mocks.lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    expect(await fetchArticleText('https://internal-looking.example.com/x')).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('rejects a hostname when ANY resolved address is private (multi-address regression)', async () => {
    mocks.lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '192.168.1.10', family: 4 },
    ]);

    expect(await fetchArticleText('https://dual-homed.example.com/x')).toBeNull();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('re-validates every redirect hop instead of blindly following (SSRF regression)', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'https://evil.example.net/meta' } })
    );
    mocks.lookup
      .mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]) // original host
      .mockResolvedValueOnce([{ address: '169.254.169.254', family: 4 }]); // redirect target

    expect(await fetchArticleText('https://news.example.com/story')).toBeNull();
    // The redirect target was checked and never fetched.
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('follows a safe redirect chain but gives up past the hop limit', async () => {
    mocks.fetch
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/moved' } }))
      .mockResolvedValueOnce(htmlResponse(goodHtml));

    expect(await fetchArticleText('https://news.example.com/story')).toContain('Body 0.');

    mocks.fetch.mockReset();
    mocks.fetch.mockResolvedValue(
      new Response(null, { status: 302, headers: { location: 'https://news.example.com/loop' } })
    );
    expect(await fetchArticleText('https://news.example.com/story')).toBeNull();
  });

  it('rejects oversized bodies via content-length and via the streamed byte cap', async () => {
    mocks.fetch.mockResolvedValueOnce(
      htmlResponse('x', { headers: { 'content-type': 'text/html', 'content-length': '99999999' } })
    );
    expect(await fetchArticleText('https://news.example.com/story')).toBeNull();

    mocks.fetch.mockResolvedValueOnce(htmlResponse('<p>x</p>'.repeat(400_000)));
    expect(await fetchArticleText('https://news.example.com/story')).toBeNull();
  });

  it('rejects non-html content types', async () => {
    mocks.fetch.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    );
    expect(await fetchArticleText('https://news.example.com/story')).toBeNull();
  });
});
