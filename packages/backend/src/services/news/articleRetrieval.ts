// Best-effort article text retrieval for news enrichment.
//
// Enrichment must never summarize from a headline alone, so this module's job
// is to get the actual article body — and to say "no" honestly when it can't
// (paywalls, bot walls, JS-only pages). Extraction is deliberately dependency
// free: strip non-content tags, prefer the <article> block, join paragraphs.

import { logger } from '../../lib/logger.js';

const ARTICLE_FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000;
const MIN_ARTICLE_CHARS = 400;
export const MAX_ARTICLE_CHARS = 12_000;

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

// Only fetch public web articles. URLs come from Yahoo's news results (never
// from client input), but cheap SSRF hygiene still applies.
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

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

export function extractArticleText(html: string): string | null {
  let scope = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside|form|figure)[\s\S]*?<\/\1>/gi, ' ');

  const articleMatch = scope.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) scope = articleMatch[0];

  const paragraphs = [...scope.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) =>
      decodeEntities(match[1].replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim()
    )
    .filter((text) => text.length > 40);

  const combined = paragraphs.join('\n');
  if (combined.length < MIN_ARTICLE_CHARS) return null;
  return combined.slice(0, MAX_ARTICLE_CHARS);
}

/** Returns the readable article body, or null when it cannot be retrieved. */
export async function fetchArticleText(url: string): Promise<string | null> {
  if (!isFetchableNewsUrl(url)) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'text/html', 'User-Agent': USER_AGENT },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) return null;

    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) return null;
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
