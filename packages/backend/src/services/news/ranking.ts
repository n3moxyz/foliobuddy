// Deterministic ranking + clustering for the News feed.
//
// Every story is scored on four separate dimensions — materiality, source
// tier, portfolio relevance, recency — so a prestigious publisher covering a
// trivial topic cannot outrank a material filing, and a dramatic claim from a
// poor source cannot rank highly merely because it is recent. Scores are
// internal ordering artifacts only: API responses expose interpretable labels
// (importance, eventType, sourceTier, rankingReasons), never weights or
// portfolio values.

import type { ProviderNewsItem } from '../providers/types.js';
import { classifySource, type SourceClassification, type SourceTier } from './sourceQuality.js';
import { classifyMateriality, type NewsEventType, type NewsImportance } from './materiality.js';

export interface RankedNewsItem extends ProviderNewsItem {
  sourceTier: SourceTier;
  sourceLabel: string | null;
  primarySource: boolean;
  importance: NewsImportance;
  eventType: NewsEventType;
  /** Every holding symbol the clustered story touches, most relevant first. */
  affectedSymbols: string[];
  /** Concise, user-safe explanations — no values, no scoring weights. */
  rankingReasons: string[];
}

export interface NewsCandidate {
  item: ProviderNewsItem;
  /** Asset id this fetch belongs to; null for macro-query results. Assets are
   *  keyed by id, never by ticker string — symbols are not unique. */
  assetId: string | null;
  /** Display symbol for the holding; null for macro-query results. */
  symbol: string | null;
  held: boolean;
  /** Holding's share of total portfolio value — internal ranking input only. */
  weight: number;
}

export interface RankedStory {
  ranked: RankedNewsItem;
  /** Internal ordering score — never exposed in API responses. */
  score: number;
  publishedMs: number | null;
  /** Asset id of the most relevant affected holding; null for macro-only. */
  primaryAssetId: string | null;
}

export const NEWS_RANKING_CONFIG = {
  // "high" (70) always dominates the maximum any story can earn from source
  // tier + recency combined (30 + 30): a prestigious publisher covering a
  // trivial topic can never outrank a material story on the same holding.
  importanceScore: { high: 70, medium: 30, low: 0 },
  tierScore: { 1: 30, 2: 20, 3: 10, 4: 0 },
  heldScore: 15,
  openTradeScore: 5,
  largeHoldingScore: 5,
  largeHoldingWeight: 0.05,
  recencyMaxScore: 30,
  recencyHalfLifeHours: 24,
  maxAgeDays: 14,
  maxAgeDaysHighImportance: 30,
  futureSkewToleranceMs: 15 * 60 * 1000,
  clusterWindowMs: 72 * 60 * 60 * 1000,
} as const;

export const EVENT_TYPE_LABELS: Partial<Record<NewsEventType, string>> = {
  earnings: 'Earnings',
  regulation: 'Regulation',
  mna: 'M&A',
  financing: 'Financing',
  contract: 'Orders',
  security: 'Security',
  leadership: 'Leadership',
  tokenomics: 'Tokenomics',
  flows: 'Flows',
  macro: 'Macro',
  rating: 'Analyst call',
  product: 'Product',
  partnership: 'Partnership',
  industry: 'Industry data',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SIGNATURE_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'to',
  'of',
  'in',
  'on',
  'for',
  'and',
  'as',
  'at',
  'with',
  'is',
  'are',
  'its',
  'by',
  'from',
  'after',
  'amid',
  'over',
]);

/** Rejects malformed/future timestamps; clamps small clock skew to now. */
export function sanitizePublishedAt(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  if (ms > nowMs + NEWS_RANKING_CONFIG.futureSkewToleranceMs) return null;
  return Math.min(ms, nowMs);
}

export function titleSignature(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 1 && !SIGNATURE_STOPWORDS.has(word))
    .slice(0, 8)
    .join('|');
}

function urlKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname.replace(/\/$/, '');
    return `${host}${path}`;
  } catch {
    return url.toLowerCase();
  }
}

function recencyScore(publishedMs: number | null, nowMs: number): number {
  if (publishedMs === null) return 0;
  const ageHours = Math.max(0, nowMs - publishedMs) / (60 * 60 * 1000);
  return (
    NEWS_RANKING_CONFIG.recencyMaxScore *
    Math.pow(0.5, ageHours / NEWS_RANKING_CONFIG.recencyHalfLifeHours)
  );
}

interface Owner {
  assetId: string;
  symbol: string;
  held: boolean;
  weight: number;
}

interface EnrichedArticle {
  item: ProviderNewsItem;
  source: SourceClassification;
  importance: NewsImportance;
  eventType: NewsEventType;
  publishedMs: number | null;
}

interface Cluster {
  articles: EnrichedArticle[];
  owners: Map<string, Owner>;
  macro: boolean;
}

function addOwner(cluster: Cluster, candidate: NewsCandidate): void {
  if (candidate.assetId === null || candidate.symbol === null) {
    cluster.macro = true;
    return;
  }
  const existing = cluster.owners.get(candidate.assetId);
  if (existing) {
    existing.held = existing.held || candidate.held;
    existing.weight = Math.max(existing.weight, candidate.weight);
  } else {
    cluster.owners.set(candidate.assetId, {
      assetId: candidate.assetId,
      symbol: candidate.symbol,
      held: candidate.held,
      weight: candidate.weight,
    });
  }
}

function mergeClusters(target: Cluster, other: Cluster): void {
  for (const article of other.articles) {
    if (!target.articles.some((a) => a.item.id === article.item.id)) {
      target.articles.push(article);
    }
  }
  for (const owner of other.owners.values()) {
    const existing = target.owners.get(owner.assetId);
    if (existing) {
      existing.held = existing.held || owner.held;
      existing.weight = Math.max(existing.weight, owner.weight);
    } else {
      target.owners.set(owner.assetId, { ...owner });
    }
  }
  target.macro = target.macro || other.macro;
}

function enrich(candidate: NewsCandidate, nowMs: number): EnrichedArticle | null {
  const source = classifySource(candidate.item.publisher, candidate.item.url);
  if (source.denied) return null;

  const { importance, eventType } = classifyMateriality(candidate.item.title);
  const publishedMs = sanitizePublishedAt(candidate.item.publishedAt, nowMs);

  // Configurable maximum age: hide stale stories unless they stay highly
  // material (a two-week-old filing can still matter; undated stories are
  // kept and simply earn zero recency).
  if (publishedMs !== null) {
    const maxAgeDays =
      importance === 'high'
        ? NEWS_RANKING_CONFIG.maxAgeDaysHighImportance
        : NEWS_RANKING_CONFIG.maxAgeDays;
    if (nowMs - publishedMs > maxAgeDays * DAY_MS) return null;
  }

  return { item: candidate.item, source, importance, eventType, publishedMs };
}

/** id → url → title-signature (within a 72h window) clustering. */
function buildClusters(candidates: NewsCandidate[], nowMs: number): Cluster[] {
  const byId = new Map<string, Cluster>();
  for (const candidate of candidates) {
    const existing = byId.get(candidate.item.id);
    if (existing) {
      addOwner(existing, candidate);
      continue;
    }
    const enriched = enrich(candidate, nowMs);
    if (!enriched) continue;
    const cluster: Cluster = { articles: [enriched], owners: new Map(), macro: false };
    addOwner(cluster, candidate);
    byId.set(candidate.item.id, cluster);
  }

  const byUrl = new Map<string, Cluster>();
  for (const cluster of byId.values()) {
    const key = urlKey(cluster.articles[0].item.url);
    const existing = byUrl.get(key);
    if (existing) mergeClusters(existing, cluster);
    else byUrl.set(key, cluster);
  }

  const bySignature = new Map<string, Cluster[]>();
  const merged: Cluster[] = [];
  for (const cluster of byUrl.values()) {
    const signature = titleSignature(cluster.articles[0].item.title);
    const buckets = bySignature.get(signature) ?? [];
    const anchorTime = cluster.articles[0].publishedMs;
    const match = buckets.find((bucket) => {
      const bucketTime = bucket.articles[0].publishedMs;
      // Without timestamps on both sides the 72h window cannot be checked, so
      // a signature match alone must NOT merge — recurring headline templates
      // ("Fed holds rates steady") describe different events months apart.
      if (anchorTime === null || bucketTime === null) return false;
      return Math.abs(anchorTime - bucketTime) <= NEWS_RANKING_CONFIG.clusterWindowMs;
    });
    if (match) {
      mergeClusters(match, cluster);
    } else {
      buckets.push(cluster);
      bySignature.set(signature, buckets);
      merged.push(cluster);
    }
  }
  return merged;
}

/** Prefer primary source, then highest tier, then the earliest (original) copy. */
function pickRepresentative(articles: EnrichedArticle[]): EnrichedArticle {
  return [...articles].sort((a, b) => {
    if (a.source.primary !== b.source.primary) return a.source.primary ? -1 : 1;
    if (a.source.tier !== b.source.tier) return a.source.tier - b.source.tier;
    const aTime = a.publishedMs ?? Number.MAX_SAFE_INTEGER;
    const bTime = b.publishedMs ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) return aTime - bTime;
    return a.item.id.localeCompare(b.item.id);
  })[0];
}

function sortOwners(owners: Owner[]): Owner[] {
  return [...owners].sort((a, b) => {
    if (a.held !== b.held) return a.held ? -1 : 1;
    if (a.weight !== b.weight) return b.weight - a.weight;
    return a.symbol.localeCompare(b.symbol);
  });
}

function buildReasons(
  rep: EnrichedArticle,
  eventPublishedMs: number | null,
  bestOwner: Owner | null,
  macroOnly: boolean,
  publisherCount: number
): string[] {
  const reasons: string[] = [];
  const eventLabel = EVENT_TYPE_LABELS[rep.eventType];
  if (eventLabel && rep.importance !== 'low') reasons.push(eventLabel);
  if (rep.source.label) reasons.push(rep.source.label);
  if (bestOwner) reasons.push(bestOwner.held ? 'Held position' : 'Open trade');
  else if (macroOnly) reasons.push('Market-wide');
  if (publisherCount > 1) reasons.push(`Syndicated by ${publisherCount} outlets`);
  if (eventPublishedMs === null) reasons.push('Undated');
  return reasons.slice(0, 4);
}

function scoreCluster(cluster: Cluster, nowMs: number): RankedStory {
  const rep = pickRepresentative(cluster.articles);
  const owners = sortOwners([...cluster.owners.values()]);
  const bestOwner = owners[0] ?? null;
  const publisherCount = new Set(cluster.articles.map((a) => a.item.publisher.toLowerCase())).size;

  // Event time = earliest sanitized member timestamp: a dated syndicate copy
  // can date an otherwise-undated representative, and scoring/labels never use
  // raw provider timestamps (a future-skewed original stays "Undated").
  const memberTimes = cluster.articles
    .map((article) => article.publishedMs)
    .filter((ms): ms is number => ms !== null);
  const eventPublishedMs = memberTimes.length > 0 ? Math.min(...memberTimes) : null;

  const cfg = NEWS_RANKING_CONFIG;
  let relevance = 0;
  if (bestOwner) {
    relevance = bestOwner.held ? cfg.heldScore : cfg.openTradeScore;
    if (bestOwner.held && bestOwner.weight >= cfg.largeHoldingWeight) {
      relevance += cfg.largeHoldingScore;
    }
  }
  // Importance and event type come from the representative's OWN headline —
  // the label shown to the user must describe the headline they read, so a
  // clickbait-tailed copy can never borrow a sibling's "high" classification.
  const score =
    cfg.importanceScore[rep.importance] +
    cfg.tierScore[rep.source.tier] +
    relevance +
    recencyScore(eventPublishedMs, nowMs);

  const uniqueSymbols = [...new Set(owners.map((owner) => owner.symbol))];

  return {
    ranked: {
      ...rep.item,
      // Expose the sanitized cluster event time, never the raw provider string.
      publishedAt: eventPublishedMs === null ? null : new Date(eventPublishedMs).toISOString(),
      sourceTier: rep.source.tier,
      sourceLabel: rep.source.label,
      primarySource: rep.source.primary,
      importance: rep.importance,
      eventType: rep.eventType,
      affectedSymbols: uniqueSymbols,
      rankingReasons: buildReasons(rep, eventPublishedMs, bestOwner, cluster.macro, publisherCount),
    },
    score,
    publishedMs: eventPublishedMs,
    primaryAssetId: bestOwner?.assetId ?? null,
  };
}

/** Deterministic ordering: score, then recency, then id. */
export function compareStories(a: RankedStory, b: RankedStory): number {
  if (a.score !== b.score) return b.score - a.score;
  const aTime = a.publishedMs ?? Number.MIN_SAFE_INTEGER;
  const bTime = b.publishedMs ?? Number.MIN_SAFE_INTEGER;
  if (aTime !== bTime) return bTime - aTime;
  return a.ranked.id.localeCompare(b.ranked.id);
}

export function rankStories(candidates: NewsCandidate[], nowMs: number): RankedStory[] {
  return buildClusters(candidates, nowMs)
    .map((cluster) => scoreCluster(cluster, nowMs))
    .sort(compareStories);
}

/** "Important"/Top-stories bar: high materiality from a credible (≤3) source. */
export function isTopStoryCandidate(story: RankedStory): boolean {
  return story.ranked.importance === 'high' && story.ranked.sourceTier <= 3;
}
