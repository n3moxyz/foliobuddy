// Google News RSS: second headline source for Singapore listings, which Yahoo
// barely indexes (probed 2026-09: DBS had 1 Yahoo headline in 30 days vs 23
// Google News headlines in 14, mostly The Straits Times / The Business Times).
//
// It is an unofficial public feed, so every failure degrades to "no extra
// headlines" and never fails the News page. Blocking responses pause the
// source for a while instead of retrying on every request.
//
// The RSS is read by a small linear scanner rather than an XML library: the
// feed's shape is stable and machine-generated, and a new dependency would
// mean regenerating the npm-10.8.2-owned lockfile (docs/DEPENDENCIES.md).
// Feed text is untrusted: CDATA is neutralized before any tag is read, item
// links must be Google's own redirect host, and no scan can go quadratic.

import { TTLCache } from '../../lib/TTLCache.js';
import { logger } from '../../lib/logger.js';
import type { ProviderNewsItem } from '../providers/types.js';

const GOOGLE_NEWS_RSS_URL = 'https://news.google.com/rss/search';
const GOOGLE_NEWS_HOST = 'news.google.com';
// Singapore English edition: the listings this source exists for.
const EDITION = { hl: 'en-SG', gl: 'SG', ceid: 'SG:en' } as const;

const REQUEST_TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX_ENTRIES = 300;
const MAX_RSS_CHARS = 2_000_000;
const BLOCKED_BACKOFF_MS = 10 * 60 * 1000;
const ERROR_BACKOFF_MS = 2 * 60 * 1000;
// Statuses that mean "this server is being refused", not "bad query".
const BLOCKING_STATUSES = new Set([403, 429, 503]);

// Quote/landing pages that the feed returns alongside real articles.
const QUOTE_PAGE_TITLES = [/stock price, news, quote/i, /latest stock news and headlines/i];

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const CDATA_OPEN = '<![CDATA[';
const CDATA_CLOSE = ']]>';
// Characters that may follow an element name in an opening tag.
const TAG_NAME_END = new Set(['>', ' ', '\t', '\n', '\r']);

interface XmlElement {
  attrs: string;
  body: string;
}

function escapeXmlText(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Rewrites CDATA sections as escaped text in one pass, so markup-looking text
 * inside them ("</item><item>…") can never be read as tags. An unterminated
 * section drops the rest of the document.
 */
function neutralizeCdata(xml: string): string {
  const parts: string[] = [];
  let pos = 0;
  for (;;) {
    const open = xml.indexOf(CDATA_OPEN, pos);
    if (open === -1) break;
    const close = xml.indexOf(CDATA_CLOSE, open + CDATA_OPEN.length);
    if (close === -1) return parts.join('') + xml.slice(pos, open);
    parts.push(xml.slice(pos, open), escapeXmlText(xml.slice(open + CDATA_OPEN.length, close)));
    pos = close + CDATA_CLOSE.length;
  }
  parts.push(xml.slice(pos));
  return parts.join('');
}

/** Linear scan for `<tag …>body</tag>`; RSS element names are case-sensitive. */
function* xmlElements(xml: string, tag: string): Generator<XmlElement> {
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let pos = 0;
  for (;;) {
    const start = xml.indexOf(open, pos);
    if (start === -1) return;
    // "<items>" is not "<item>": only a real name boundary counts.
    if (!TAG_NAME_END.has(xml[start + open.length] ?? '')) {
      pos = start + open.length;
      continue;
    }
    const openEnd = xml.indexOf('>', start + open.length);
    if (openEnd === -1) return;
    const end = xml.indexOf(close, openEnd + 1);
    if (end === -1) return;
    yield { attrs: xml.slice(start + open.length, openEnd), body: xml.slice(openEnd + 1, end) };
    pos = end + close.length;
  }
}

function firstElement(xml: string, tag: string): XmlElement | null {
  for (const element of xmlElements(xml, tag)) return element;
  return null;
}

function decodeXmlText(raw: string): string {
  // Single pass, so "&amp;lt;" decodes once to the literal text "&lt;".
  return raw
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, entity: string) => {
      if (entity.startsWith('#')) {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isInteger(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return XML_ENTITIES[entity.toLowerCase()] ?? whole;
    })
    .trim();
}

function elementText(block: string, tag: string): string | null {
  const element = firstElement(block, tag);
  if (!element) return null;
  const text = decodeXmlText(element.body);
  return text.length > 0 ? text : null;
}

function sourceOf(block: string): { name: string | null; url: string | null } {
  const element = firstElement(block, 'source');
  if (!element) return { name: null, url: null };
  const url = element.attrs.match(/\burl\s*=\s*"([^"]*)"/)?.[1] ?? null;
  const name = decodeXmlText(element.body);
  return { name: name.length > 0 ? name : null, url: url ? decodeXmlText(url) : null };
}

function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

/** Item links must go through Google's own redirect host, never an arbitrary site. */
function googleRedirectLink(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === GOOGLE_NEWS_HOST
      ? parsed.toString()
      : null;
  } catch {
    return null;
  }
}

/** Google appends " - Publisher" to every title; the publisher is shown separately. */
function stripPublisherSuffix(title: string, publisher: string | null): string {
  if (!publisher) return title;
  const suffix = ` - ${publisher}`;
  const stripped = title.endsWith(suffix) ? title.slice(0, -suffix.length).trim() : title;
  return stripped.length > 0 ? stripped : title;
}

function isoDate(value: string | null): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export function parseGoogleNewsRss(xml: string): ProviderNewsItem[] {
  const items: ProviderNewsItem[] = [];
  for (const { body } of xmlElements(neutralizeCdata(xml), 'item')) {
    const source = sourceOf(body);
    const rawTitle = elementText(body, 'title');
    const url = googleRedirectLink(elementText(body, 'link'));
    if (!rawTitle || !url) continue;
    const title = stripPublisherSuffix(rawTitle, source.name);
    if (QUOTE_PAGE_TITLES.some((pattern) => pattern.test(title))) continue;
    const guid = elementText(body, 'guid');
    items.push({
      id: `gnews:${guid ?? url}`,
      title,
      publisher: source.name ?? 'Google News',
      url,
      publishedAt: isoDate(elementText(body, 'pubDate')),
      // Google's attribution of the publisher's site; drives source tiers only.
      sourceUrl: httpUrl(source.url) ?? undefined,
    });
  }
  return items;
}

export function buildGoogleNewsUrl(query: string, windowDays: number): string {
  const params = new URLSearchParams({ q: `${query} when:${windowDays}d`, ...EDITION });
  return `${GOOGLE_NEWS_RSS_URL}?${params.toString()}`;
}

/** Google News links are opaque redirects; article text can't be fetched from them. */
export function isAggregatorRedirectUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase() === GOOGLE_NEWS_HOST;
  } catch {
    return false;
  }
}

export class GoogleNewsClient {
  private readonly cache = new TTLCache<string, ProviderNewsItem[]>(
    CACHE_TTL_MS,
    CACHE_MAX_ENTRIES
  );
  private pausedUntil = 0;

  /** Never rejects: an unavailable feed yields no extra headlines. */
  async search(query: string, windowDays: number, limit: number): Promise<ProviderNewsItem[]> {
    const url = buildGoogleNewsUrl(query, windowDays);
    const cached = this.cache.get(url);
    if (cached) return cached.slice(0, limit);
    if (Date.now() < this.pausedUntil) return [];

    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.1' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        if (BLOCKING_STATUSES.has(response.status)) {
          this.pause(BLOCKED_BACKOFF_MS, `HTTP ${response.status}`);
        } else {
          logger.warn(`[GoogleNews] HTTP ${response.status} for "${query}"`);
        }
        return [];
      }
      const xml = await response.text();
      if (xml.length > MAX_RSS_CHARS) {
        logger.warn(`[GoogleNews] oversized feed for "${query}" — ignored`);
        return [];
      }
      // A 200 that isn't RSS is a consent/captcha interstitial: treat it as a
      // block rather than caching an empty result.
      if (!/<rss\b/i.test(xml.slice(0, 2000))) {
        this.pause(BLOCKED_BACKOFF_MS, 'non-RSS response');
        return [];
      }
      const items = parseGoogleNewsRss(xml);
      // Empty-but-successful results are cached; failures are not.
      this.cache.set(url, items);
      return items.slice(0, limit);
    } catch (err) {
      this.pause(ERROR_BACKOFF_MS, err instanceof Error ? err.message : String(err));
      return [];
    }
  }

  private pause(ms: number, reason: string): void {
    this.pausedUntil = Date.now() + ms;
    logger.warn(`[GoogleNews] paused for ${Math.round(ms / 60000)} min: ${reason}`);
  }
}

export const googleNewsClient = new GoogleNewsClient();
