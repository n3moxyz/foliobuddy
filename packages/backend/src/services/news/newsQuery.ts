// Per-holding news query planning + relevance gating.
//
// Yahoo's search endpoint returns no headlines for exchange-suffixed tickers
// (D05.SI, 7203.T, EQNR.OL) or for coin tickers like SOL-USD, but it does
// return tagged coverage when queried by company or coin name (probed
// 2026-09: "Kioxia Holdings" → 20 stories tagged 285A.T, "Solana" → 19 tagged
// SOL-USD). Name queries also surface loosely related stories, so Yahoo
// results are kept only when tagged with the holding's ticker or when the
// headline names the company. Singapore listings get a second source (Google
// News) because Yahoo barely indexes them even by name.

import type { Asset } from '@prisma/client';
import type { ProviderNewsItem } from '../providers/types.js';
import { AssetCategory, PriceProvider } from '../../lib/constants.js';

export interface NewsRelevanceGate {
  /** Upper-cased tickers; an article Yahoo tagged with any of them is relevant. */
  tickers: string[];
  /** Distinctive company words; a headline containing one (whole word) is relevant. */
  titleTerms: string[];
}

export interface NewsQueryPlan {
  yahooQuery: string;
  relevance: NewsRelevanceGate;
  /** Exact-phrase Google News query, or null when Yahoo alone covers the listing. */
  googleQuery: string | null;
}

type NewsQueryAsset = Pick<
  Asset,
  'symbol' | 'name' | 'category' | 'priceProvider' | 'providerAssetId'
>;

// Listings whose Yahoo coverage is too thin to stand alone. Extend with care:
// every entry adds one Google News request per holding per cache window.
const GOOGLE_NEWS_SUFFIXES = new Set(['.SI']);

const LEGAL_SUFFIX =
  /[\s,]+(?:ltd\.?|limited|corporation|corp\.?|incorporated|inc\.?|plc|asa|ag|s\.?a\.?|n\.?v\.?|se|co\.?|company|k\.k\.|bhd|berhad|tbk|pte\.?|llc|l\.?p\.?|class [a-z])$/i;

// First words too generic to prove a headline is about one company.
const GENERIC_NAME_WORDS = new Set([
  'the',
  'singapore',
  'united',
  'china',
  'chinese',
  'japan',
  'hong',
  'korea',
  'first',
  'national',
  'great',
  'new',
  'global',
  'asia',
  'asian',
  'pacific',
  'american',
  'international',
  'general',
  'capital',
  'royal',
  'eastern',
  'western',
]);

const MAX_QUERY_LENGTH = 80;
// Rows written before the ingestion cap (MAX_ASSET_NAME_LENGTH) can be
// longer, and suffix stripping is quadratic on adversarial names (a 64k-char
// name took 1.6s of event loop): bound the input before any regex runs.
const MAX_NAME_INPUT = 200;

export function yahooNewsTicker(
  asset: Pick<Asset, 'symbol' | 'priceProvider' | 'providerAssetId'>
): string | null {
  if (asset.priceProvider === PriceProvider.YAHOO) {
    // Yahoo-priced assets already store an exact Yahoo ticker (incl. .SI/.T suffixes).
    return asset.providerAssetId?.trim().toUpperCase() || null;
  }
  if (asset.priceProvider === PriceProvider.COINGECKO) {
    const symbol = asset.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return null;
    return `${symbol}-USD`;
  }
  // Manually-priced assets have no queryable ticker.
  return null;
}

/** "Oversea-Chinese Banking Corporation Limited" → "Oversea-Chinese Banking". */
export function cleanCompanyName(name: string): string {
  let cleaned = name.slice(0, MAX_NAME_INPUT).replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  for (;;) {
    const next = cleaned.replace(LEGAL_SUFFIX, '').replace(/[\s,]+$/, '');
    if (next === cleaned || next.length === 0) break;
    cleaned = next;
  }
  return cleaned.slice(0, MAX_QUERY_LENGTH).trim();
}

function listingSuffix(ticker: string): string | null {
  const match = ticker.match(/\.[A-Z]{1,4}$/);
  return match ? match[0] : null;
}

function isUsableName(name: string, ticker: string): boolean {
  return name.length >= 3 && /\p{L}/u.test(name) && name.toUpperCase() !== ticker;
}

function distinctiveTerm(name: string): string | null {
  const first = name.split(' ')[0]?.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '') ?? '';
  if (first.length < 3 || GENERIC_NAME_WORDS.has(first.toLowerCase())) return null;
  return first;
}

export function newsQueryPlan(asset: NewsQueryAsset): NewsQueryPlan | null {
  const ticker = yahooNewsTicker(asset);
  if (!ticker) return null;

  if (asset.priceProvider === PriceProvider.COINGECKO) {
    // Coin names ("Solana") beat SOL-USD, which returns nothing. Yahoo tags
    // coin coverage reliably, so the tag alone gates relevance — coin names
    // ("Near", "Sky") are too often ordinary words for a headline match.
    const name = asset.name
      .slice(0, MAX_NAME_INPUT)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
    return {
      yahooQuery: isUsableName(name, ticker) ? name : ticker,
      relevance: { tickers: [ticker], titleTerms: [] },
      googleQuery: null,
    };
  }

  const suffix = listingSuffix(ticker);
  // US listings answer to the ticker; fund feeds (Morningstar ids) have no
  // meaningful name coverage, so they keep the ticker query too.
  if (!suffix || asset.category === AssetCategory.UNIT_TRUST) {
    return {
      yahooQuery: ticker,
      relevance: { tickers: [ticker], titleTerms: [] },
      googleQuery: null,
    };
  }

  const name = cleanCompanyName(asset.name);
  if (!isUsableName(name, ticker)) {
    return {
      yahooQuery: ticker,
      relevance: { tickers: [ticker], titleTerms: [] },
      googleQuery: null,
    };
  }
  // Toyota/Equinor coverage is tagged with the US ADR (TM, EQNR), not the
  // local listing, so a headline naming the company also qualifies.
  const term = distinctiveTerm(name);
  return {
    yahooQuery: name,
    relevance: { tickers: [ticker], titleTerms: term ? [term] : [] },
    googleQuery: GOOGLE_NEWS_SUFFIXES.has(suffix) ? `"${name}"` : null,
  };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function headlineNames(title: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}($|[^\\p{L}\\p{N}])`, 'iu').test(
    title
  );
}

export function isRelevantNewsItem(item: ProviderNewsItem, gate: NewsRelevanceGate): boolean {
  const tags = item.relatedTickers ?? [];
  if (gate.tickers.some((ticker) => tags.includes(ticker))) return true;
  return gate.titleTerms.some((term) => headlineNames(item.title, term));
}

/**
 * Keeps results tagged with the holding or naming it. Fails open when no
 * result carries any ticker tag — a Yahoo response-shape change must degrade
 * to unfiltered headlines, not to an empty feed.
 */
export function filterRelevantNews(
  items: ProviderNewsItem[],
  gate: NewsRelevanceGate
): ProviderNewsItem[] {
  if (!items.some((item) => (item.relatedTickers?.length ?? 0) > 0)) return items;
  return items.filter((item) => isRelevantNewsItem(item, gate));
}
