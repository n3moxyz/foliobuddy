// Best-effort article text retrieval for news enrichment.
//
// Enrichment must never summarize from a headline alone, so this module's job
// is to get the actual article body — and to say "no" honestly when it can't
// (paywalls, bot walls, JS-only pages). The page content is hostile input:
// extraction is a LINEAR indexOf tokenizer (no regex over the full document —
// lazy tag-pair regexes go quadratic on unclosed tags and can stall the event
// loop for a minute on one crafted page), redirects are re-validated hop by
// hop against the SSRF checks including a DNS private-range lookup, and the
// body is streamed with a hard byte cap instead of buffered then measured.

import { lookup } from 'node:dns/promises';
import { logger } from '../../lib/logger.js';

const ARTICLE_FETCH_TIMEOUT_MS = 8000;
const MAX_BODY_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;
const MIN_ARTICLE_CHARS = 400;
export const MAX_ARTICLE_CHARS = 12_000;
const MAX_PARAGRAPHS = 400;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// Only fetch public web articles. URLs come from Yahoo's news results (never
// from client input), but SSRF hygiene applies to every redirect hop too.
export function isFetchableNewsUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return false;
    // IPv4/IPv6 literals are never legitimate news hosts.
    if (/^[\d.]+$/.test(host) || host.includes(':')) return false;
    return host.includes('.');
  } catch {
    return false;
  }
}

export function isPrivateIp(address: string, family: number): boolean {
  if (family === 6) {
    const a = address.toLowerCase();
    if (a.startsWith('::ffff:')) return isPrivateIp(a.slice(7), 4);
    // fc00::/7 unique-local, fe80::/10 link-local (fe80–febf, not just the
    // literal "fe80" prefix), fec0::/10 deprecated site-local.
    return (
      a === '::1' || a === '::' || a.startsWith('fc') || a.startsWith('fd') || /^fe[89a-f]/.test(a)
    );
  }
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o))) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

// Best-effort DNS gate: resolves EVERY address for the hostname and rejects
// if any lands in private/loopback/link-local/special-use space — a
// multi-address record must not pass on its first public entry. A rebinding
// TOCTOU window remains (fetch resolves again and undici's global fetch
// cannot pin the connection to the validated address), but this closes the
// practical redirect-to-internal primitive for a server fetching publishers.
async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((entry) => !isPrivateIp(entry.address, entry.family));
  } catch {
    return false;
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// ASCII-only lowercase keeps indices aligned with the original string
// (full toLowerCase can change string length for some Unicode).
function asciiLower(text: string): string {
  return text.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

interface HtmlView {
  html: string;
  lower: string;
}

/** Linear removal of <tag>…</tag> blocks; an unclosed opener drops the rest. */
function stripBlocks(view: HtmlView, tag: string): HtmlView {
  const open = `<${tag}`;
  const close = `</${tag}`;
  let outHtml = '';
  let outLower = '';
  let pos = 0;
  for (;;) {
    const start = view.lower.indexOf(open, pos);
    if (start === -1) {
      outHtml += view.html.slice(pos);
      outLower += view.lower.slice(pos);
      break;
    }
    outHtml += view.html.slice(pos, start);
    outLower += view.lower.slice(pos, start);
    const closeStart = view.lower.indexOf(close, start + open.length);
    if (closeStart === -1) break;
    const closeEnd = view.lower.indexOf('>', closeStart);
    if (closeEnd === -1) break;
    pos = closeEnd + 1;
  }
  return { html: outHtml, lower: outLower };
}

export function extractArticleText(html: string): string | null {
  let view: HtmlView = { html, lower: asciiLower(html) };
  view = stripBlocks(view, 'script');
  view = stripBlocks(view, 'style');

  const articleStart = view.lower.indexOf('<article');
  if (articleStart !== -1) {
    const articleEnd = view.lower.indexOf('</article', articleStart);
    if (articleEnd !== -1) {
      view = {
        html: view.html.slice(articleStart, articleEnd),
        lower: view.lower.slice(articleStart, articleEnd),
      };
    }
  }

  const paragraphs: string[] = [];
  let pos = 0;
  while (paragraphs.length < MAX_PARAGRAPHS) {
    const start = view.lower.indexOf('<p', pos);
    if (start === -1) break;
    const afterTag = view.lower[start + 2];
    if (
      afterTag !== '>' &&
      afterTag !== ' ' &&
      afterTag !== '\t' &&
      afterTag !== '\n' &&
      afterTag !== '\r'
    ) {
      pos = start + 2;
      continue;
    }
    const openEnd = view.lower.indexOf('>', start);
    if (openEnd === -1) break;
    const closeStart = view.lower.indexOf('</p', openEnd);
    if (closeStart === -1) break;
    const closeEnd = view.lower.indexOf('>', closeStart);
    pos = closeEnd === -1 ? view.lower.length : closeEnd + 1;

    const inner = view.html.slice(openEnd + 1, closeStart);
    const text = decodeEntities(inner.replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (text.length > 40) paragraphs.push(text);
  }

  const combined = paragraphs.join('\n');
  if (combined.length < MIN_ARTICLE_CHARS) return null;
  return combined.slice(0, MAX_ARTICLE_CHARS);
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Follows up to MAX_REDIRECTS manually, re-validating every hop. */
async function fetchWithGuardedRedirects(
  startUrl: string,
  signal: AbortSignal
): Promise<Response | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isFetchableNewsUrl(current)) return null;
    if (!(await resolvesToPublicAddress(new URL(current).hostname))) return null;

    const response = await fetch(current, {
      headers: { Accept: 'text/html', 'User-Agent': USER_AGENT },
      signal,
      redirect: 'manual',
    });
    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get('location');
    if (!location) return null;
    current = new URL(location, current).toString();
  }
  return null;
}

/** Streams the body with a hard byte cap — never buffer-then-measure. */
async function readBodyCapped(response: Response): Promise<string | null> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return null;
  if (!response.body) return null;

  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    total += buffer.length;
    if (total > MAX_BODY_BYTES) return null; // breaking cancels the stream
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Returns the readable article body, or null when it cannot be retrieved. */
export async function fetchArticleText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetchWithGuardedRedirects(url, controller.signal);
    if (!response || !response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;

    const html = await readBodyCapped(response);
    if (html === null) return null;
    return extractArticleText(html);
  } catch (error) {
    logger.debug(
      `[NewsEnrichment] article fetch failed for ${url}:`,
      error instanceof Error ? error.message : error
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
