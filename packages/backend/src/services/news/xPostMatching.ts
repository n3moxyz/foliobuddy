// Read-time matching of stored X posts to a user's holdings.
//
// The collector stores every roster post regardless of who holds what
// (xCollector.ts). Per request, this module decides which posts are about a
// holding — by cashtag, or by the company's name written capitalized — and
// turns them into news items carrying the author's roster role. Radar-role
// posts belong on a holding's own page only, never the main feed.
//
// Names matter more than cashtags: in 90 days of roster data the strongest
// anchors never used a cashtag, writing "SK Hynix" or "Samsung" instead.
// (Never name roster accounts or quote their posts here: this repo is public
// and the roster is private.)

import type { Asset } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { TTLCache } from '../../lib/TTLCache.js';
import { AssetCategory, PriceProvider } from '../../lib/constants.js';
import { cleanCompanyName, distinctiveTerm, yahooNewsTicker } from './newsQuery.js';
import type { NewsImportance } from './materiality.js';
import type { NewsSourceItem } from './ranking.js';
import {
  getXNewsSources,
  X_HANDLE_PATTERN,
  xRoleFor,
  type XSourceRole,
  type XSourceRoster,
} from './xSources.js';
import { extractCashtags, substanceLetters, truncateAtWord } from './xPostText.js';

export interface StoredXPost {
  id: string;
  authorHandle: string;
  authorKey: string;
  text: string;
  quotedPostId: string | null;
  quotedText: string | null;
  hasExternalLink: boolean;
  cashtags: string[];
  postedAt: Date;
}

export interface XMatchPlan {
  /** Upper-cased tickers, without "$". */
  cashtags: string[];
  /** Names that count only when written capitalized ("Nvidia", "TSMC"). */
  terms: string[];
}

export interface XMatchTarget {
  assetId: string;
  plan: XMatchPlan;
}

export interface XMatchOptions {
  /** Radar-role posts surface leads: a holding's own page, never the main feed. */
  includeRadar: boolean;
  roster?: XSourceRoster;
}

type XMatchAsset = Pick<
  Asset,
  'symbol' | 'name' | 'category' | 'priceProvider' | 'providerAssetId'
>;

const DAY_MS = 24 * 60 * 60 * 1000;
const POSTS_CACHE_TTL_MS = 60 * 1000;
const MAX_POSTS_LOADED = 20_000;
// One-word replies, "👀 $TICKER", emoji — a feed row needs words a reader can use.
const MIN_SUBSTANCE_LETTERS = 15;
// A post is about a holding when it names it early, the way a headline would.
// Measured 2026-09 on roster data: 78% of company-naming anchor and
// corroboration posts name it within 140 characters, and those at 80–140 were
// still on-topic (often a source tag first, then the company); the market
// wraps, ticker lists and asides that mismatched live posts named it 175+ in.
const MENTION_LEAD_CHARS = 140;
// A post tagging this many tickers is a watchlist, not news about any one of them.
const BASKET_CASHTAGS = 4;
const MAX_TITLE_CHARS = 280;

// Names the roster writes that a legal name can't produce: "Taiwan
// Semiconductor Manufacturing" is written "TSMC", "SK hynix" is too short to
// derive, and Alphabet is "Google". Keyed by the Yahoo ticker newsQuery
// resolves. Extend when a held name is visibly missed.
const X_ALIASES: ReadonlyMap<string, Partial<XMatchPlan>> = new Map([
  ['TSM', { terms: ['TSMC'] }],
  ['2330.TW', { terms: ['TSMC'], cashtags: ['TSM'] }],
  // The company brands itself "SK hynix": the lowercase "h" fails the capital rule alone.
  ['000660.KS', { terms: ['SK hynix', 'Hynix'], cashtags: ['HXSCL'] }],
  ['005930.KS', { cashtags: ['SSNLF'] }],
  ['AMD', { terms: ['AMD'] }],
  ['AMAT', { terms: ['Applied Materials'] }],
  ['WDC', { terms: ['Western Digital'] }],
  ['8035.T', { terms: ['Tokyo Electron'] }],
  ['GOOGL', { terms: ['Google'] }],
  ['GOOG', { terms: ['Google'] }],
  ['AMZN', { terms: ['Amazon'] }],
] satisfies Array<[string, Partial<XMatchPlan>]>);

// First words too generic to stand for one company in prose (beyond the
// headline list newsQuery already applies). The capital rule doesn't help at
// the start of a sentence: "Target raised to $200…" is not about Target Corp.
const X_GENERIC_TERMS = new Set([
  'advanced',
  'applied',
  'micro',
  'tokyo',
  'digital',
  'semiconductor',
  'super',
  'data',
  'energy',
  'power',
  'bank',
  'target',
  'block',
  'dollar',
  'snap',
  'match',
  'gap',
  'unity',
  'carrier',
]);

// A fund's first word is its issuer ("Vanguard", "Invesco", "SPDR"), never the
// fund: funds match by cashtag only.
const FUND_NAME = /\b(?:ETFs?|ETNs?|Fund|Trust|Index|UCITS)\b/i;

const ROLE_RANK: Record<XSourceRole, number> = { anchor: 2, corroboration: 1, radar: 0 };

// Anchors may claim any importance; other roles can strengthen a story, never headline it.
const ROLE_MAX_IMPORTANCE: Record<XSourceRole, NewsImportance> = {
  anchor: 'high',
  corroboration: 'medium',
  radar: 'medium',
};

const postsCache = new TTLCache<number, StoredXPost[]>(POSTS_CACHE_TTL_MS, 4);

/** Stored roster posts from the last `windowDays`, newest first. Never rejects. */
export async function loadRecentXPosts(windowDays: number): Promise<StoredXPost[]> {
  if (getXNewsSources().sources.length === 0) return [];
  const cached = postsCache.get(windowDays);
  if (cached) return cached;
  try {
    const posts = await prisma.xPost.findMany({
      where: { postedAt: { gte: new Date(Date.now() - windowDays * DAY_MS) } },
      select: {
        id: true,
        authorHandle: true,
        authorKey: true,
        text: true,
        quotedPostId: true,
        quotedText: true,
        hasExternalLink: true,
        cashtags: true,
        postedAt: true,
      },
      orderBy: { postedAt: 'desc' },
      take: MAX_POSTS_LOADED,
    });
    if (posts.length === MAX_POSTS_LOADED) {
      logger.warn(
        `[XPosts] Read cap of ${MAX_POSTS_LOADED} posts reached: the ${windowDays}-day window is shorter than it says`
      );
    }
    postsCache.set(windowDays, posts);
    return posts;
  } catch (error) {
    logger.warn(
      `[XPosts] Could not load stored posts: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

/** Test seam: forget cached post windows. */
export function clearXPostCache(): void {
  postsCache.clear();
}

/** How a holding is recognized in a post; null when it has no X presence. */
export function xMatchPlan(asset: XMatchAsset): XMatchPlan | null {
  // Fund ids (Morningstar codes) never appear in posts.
  if (asset.category === AssetCategory.UNIT_TRUST) return null;
  const ticker = yahooNewsTicker(asset);
  if (!ticker) return null;
  if (asset.priceProvider === PriceProvider.COINGECKO) {
    // Coins match by cashtag only: coin names ("Near", "Sky") are too often ordinary words.
    return { cashtags: [ticker.replace(/-USD$/, '')], terms: [] };
  }

  const alias = X_ALIASES.get(ticker);
  const cashtags = new Set(alias?.cashtags ?? []);
  // US tickers have a cashtag convention ($BRK.B); suffixed listings (D05.SI) don't.
  if (!/\.[A-Z]{1,4}$/.test(ticker)) cashtags.add(ticker.replace(/-/g, '.'));
  const terms = new Set(alias?.terms ?? []);
  const name = cleanCompanyName(asset.name);
  const derived = FUND_NAME.test(name) ? null : distinctiveTerm(name);
  if (derived && !X_GENERIC_TERMS.has(derived.toLowerCase())) terms.add(derived);
  if (cashtags.size === 0 && terms.size === 0) return null;
  return { cashtags: [...cashtags], terms: [...terms] };
}

interface PreparedPost {
  post: StoredXPost;
  role: XSourceRole;
  cashtags: Set<string>;
  searchText: string;
  /** Watchlists and questions report nothing about any one holding. */
  lowImportance: boolean;
}

/** The opening of a post, extended to the end of the word at the cut. */
function leadOf(text: string): string {
  if (text.length <= MENTION_LEAD_CHARS) return text;
  const rest = /^\S{0,20}/.exec(text.slice(MENTION_LEAD_CHARS))?.[0] ?? '';
  return text.slice(0, MENTION_LEAD_CHARS) + rest;
}

function preparePosts(posts: readonly StoredXPost[], roster: XSourceRoster): PreparedPost[] {
  return posts.flatMap((post) => {
    // Rows are re-checked here: they can arrive by db:sync, not only the collector.
    if (!X_HANDLE_PATTERN.test(post.authorHandle) || !/^\d{1,25}$/.test(post.id)) return [];
    // Removing a handle from the roster hides its stored posts at once.
    const source = roster.byKey.get(post.authorKey);
    if (!source) return [];
    const role = xRoleFor(source, post.hasExternalLink);
    if (substanceLetters(post.text) < MIN_SUBSTANCE_LETTERS) return [];
    // The quoted post often carries the news the author is reacting to.
    const searchText = post.quotedText
      ? `${leadOf(post.text)}\n${leadOf(post.quotedText)}`
      : leadOf(post.text);
    return [
      {
        post,
        role,
        cashtags: new Set(extractCashtags(searchText)),
        searchText,
        lowImportance: post.cashtags.length >= BASKET_CASHTAGS || post.text.trimEnd().endsWith('?'),
      },
    ];
  });
}

function normalizeTerm(term: string): string {
  return term.toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One alternation over every holding's names, longest first; whole words only.
 * Word boundaries are Latin-script, so a Korean or Japanese particle written
 * straight after the name ("TSMC의") still counts as the name.
 */
function buildTermPattern(terms: string[]): RegExp {
  const alternatives = [...terms]
    .sort((a, b) => b.length - a.length)
    .map((term) => escapeRegExp(term).replace(/ /g, '\\s+'));
  return new RegExp(
    `(?<![\\p{Script=Latin}\\p{N}])(?:${alternatives.join('|')})(?![\\p{Script=Latin}\\p{N}])`,
    'giu'
  );
}

/** Name hits written with a capital first letter: "Micron" counts, "micron" doesn't. */
function capitalizedTerms(pattern: RegExp, text: string): string[] {
  const hits: string[] = [];
  for (const match of text.matchAll(pattern)) {
    if (/^\p{Lu}/u.test(match[0])) hits.push(normalizeTerm(match[0]));
  }
  return hits;
}

/**
 * A roster post quoting another roster post about the same holding repeats its
 * signal, so one of the two goes: the weaker role, or at equal role the quote
 * (the original said it first). Runs before any role filter, so the feed and a
 * holding's page always keep the same post.
 */
function withoutRosterQuotes(posts: PreparedPost[]): PreparedPost[] {
  const byId = new Map(posts.map((prepared) => [prepared.post.id, prepared]));
  const dropped = new Set<string>();
  for (const quoting of posts) {
    const quoted = quoting.post.quotedPostId ? byId.get(quoting.post.quotedPostId) : undefined;
    if (!quoted || quoted === quoting) continue;
    const quoteOutranks = ROLE_RANK[quoting.role] > ROLE_RANK[quoted.role];
    dropped.add(quoteOutranks ? quoted.post.id : quoting.post.id);
  }
  return posts.filter(({ post }) => !dropped.has(post.id));
}

function toNewsItem({ post, role, lowImportance }: PreparedPost): NewsSourceItem {
  return {
    id: `x:${post.id}`,
    title: truncateAtWord(post.text, MAX_TITLE_CHARS),
    publisher: `@${post.authorHandle}`,
    // Built from validated parts, never taken from the provider's own URL field.
    url: `https://x.com/${post.authorHandle}/status/${post.id}`,
    publishedAt: post.postedAt.toISOString(),
    xRole: role,
    maxImportance: lowImportance ? 'low' : ROLE_MAX_IMPORTANCE[role],
    // Headline patterns fit a post's opening; deep in a long post a stray
    // "integration" or "earnings" would mislabel the whole post.
    classificationText: leadOf(post.text),
  };
}

function pushTo<V>(map: Map<string, V[]>, key: string, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/** News items per asset id for every target a post names. */
export function matchXPosts(
  targets: readonly XMatchTarget[],
  posts: readonly StoredXPost[],
  options: XMatchOptions
): Map<string, NewsSourceItem[]> {
  const roster = options.roster ?? getXNewsSources();
  const result = new Map<string, NewsSourceItem[]>();
  if (roster.sources.length === 0 || targets.length === 0 || posts.length === 0) return result;

  const byCashtag = new Map<string, string[]>();
  const byTerm = new Map<string, string[]>();
  for (const { assetId, plan } of targets) {
    for (const tag of plan.cashtags) pushTo(byCashtag, tag.toUpperCase(), assetId);
    for (const term of plan.terms) pushTo(byTerm, normalizeTerm(term), assetId);
  }
  const termPattern = byTerm.size > 0 ? buildTermPattern([...byTerm.keys()]) : null;

  const matched = new Map<string, PreparedPost[]>();
  for (const prepared of preparePosts(posts, roster)) {
    const assetIds = new Set<string>();
    for (const tag of prepared.cashtags) {
      for (const assetId of byCashtag.get(tag) ?? []) assetIds.add(assetId);
    }
    if (termPattern) {
      for (const term of capitalizedTerms(termPattern, prepared.searchText)) {
        for (const assetId of byTerm.get(term) ?? []) assetIds.add(assetId);
      }
    }
    for (const assetId of assetIds) pushTo(matched, assetId, prepared);
  }

  for (const [assetId, list] of matched) {
    const kept = withoutRosterQuotes(list).filter(
      ({ role }) => options.includeRadar || role !== 'radar'
    );
    if (kept.length > 0) result.set(assetId, kept.map(toNewsItem));
  }
  return result;
}
