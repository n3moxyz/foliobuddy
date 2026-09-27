// Pure text helpers for X posts, shared by the collector (what gets stored)
// and the matcher (what gets shown). Post text is untrusted: every pattern is
// linear, and callers bound input length before any regex runs.

const TCO_LINK = /https?:\/\/t\.co\/[A-Za-z0-9]+/g;
const ESCAPED_ENTITY = /&(amp|lt|gt|quot|apos|#39);/g;
const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
};

// "$NVDA", "$BRK.B", "$EOS.AX". A letter comes first, so a price ("$5") never
// counts. Boundaries are Latin-script, so "$MU는" (a Korean particle) still counts.
const CASHTAG =
  /(?<![\p{Script=Latin}\p{N}_$])\$([A-Za-z][A-Za-z0-9]{0,5}(?:\.[A-Za-z]{1,2})?)(?![\p{Script=Latin}\p{N}])/gu;
const SYMBOL = /^[A-Za-z][A-Za-z0-9]{0,5}(?:\.[A-Za-z]{1,2})?$/;
const MAX_CASHTAGS = 20;

const X_HOSTS = new Set([
  'x.com',
  'twitter.com',
  't.co',
  'mobile.x.com',
  'mobile.twitter.com',
  'pic.x.com',
  'pic.twitter.com',
]);

// Links, cashtags and @mentions carry no words a reader can use on their own.
const NON_SUBSTANCE = /https?:\/\/\S+|[@$][A-Za-z0-9_.]+/g;
const NON_LETTER = /[^\p{L}]/gu;

/** Slices without splitting a surrogate pair (emoji) at the cut. */
function safeSlice(text: string, max: number): string {
  if (text.length <= max) return text;
  const last = text.charCodeAt(max - 1);
  return text.slice(0, last >= 0xd800 && last <= 0xdbff ? max - 1 : max);
}

/** Decodes X's HTML-escaped text, drops opaque t.co links, collapses whitespace. */
export function cleanPostText(raw: string, maxChars: number): string {
  // Single decoding pass: "&amp;lt;" becomes the literal text "&lt;", never "<".
  const cleaned = safeSlice(raw, maxChars * 2)
    .replace(TCO_LINK, ' ')
    .replace(ESCAPED_ENTITY, (_whole, name: string) => ENTITIES[name])
    .replace(/\s+/g, ' ')
    .trim();
  return safeSlice(cleaned, maxChars).trim();
}

/** Upper-cased tickers from X's own symbol entities plus any `$TICKER` in the text. */
export function extractCashtags(
  text: string,
  symbols: ReadonlyArray<{ text: string }> = []
): string[] {
  const tags = new Set<string>();
  for (const symbol of symbols) {
    if (SYMBOL.test(symbol.text)) tags.add(symbol.text.toUpperCase());
  }
  for (const match of text.matchAll(CASHTAG)) tags.add(match[1].toUpperCase());
  return [...tags].slice(0, MAX_CASHTAGS);
}

/** True when the post links a page off X — the "source-backed" signal. */
export function linksExternalSource(
  urls: ReadonlyArray<{ expanded_url?: string | null }>
): boolean {
  return urls.some(({ expanded_url }) => {
    if (!expanded_url) return false;
    try {
      const url = new URL(expanded_url);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
      const host = url.hostname.toLowerCase().replace(/^www\./, '');
      return !X_HOSTS.has(host) && !host.endsWith('.x.com') && !host.endsWith('.twitter.com');
    } catch {
      return false;
    }
  });
}

/** Letters a reader gets from the post itself, ignoring links, cashtags and mentions. */
export function substanceLetters(text: string): number {
  return text.replace(NON_SUBSTANCE, ' ').replace(NON_LETTER, '').length;
}

/** Cuts at a word boundary when one is reasonably close, marking the cut with "…". */
export function truncateAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = safeSlice(text, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  const trimmed = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${trimmed.trimEnd()}…`;
}
