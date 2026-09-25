import type { Asset } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from './priceService.js';
import { AssetCategory, TradeStatus } from '../lib/constants.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  compareStories,
  isTopStoryCandidate,
  rankStories,
  type NewsCandidate,
  type RankedNewsItem,
  type RankedStory,
} from './news/ranking.js';
import { newsEnrichmentService } from './news/enrichmentService.js';
import { normalizeOfficialDomain } from './news/sourceQuality.js';
import { filterRelevantNews, newsQueryPlan, type NewsQueryPlan } from './news/newsQuery.js';
import { googleNewsClient } from './news/googleNews.js';
import type { ProviderNewsItem } from './providers/types.js';

export interface AssetNewsGroup {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  openTradeOnly: boolean;
  items: RankedNewsItem[];
  /** Feed stories touching this holding, incl. ones filed under a bigger holding. */
  storyCount: number;
}

export type NewsBucket = 'crypto' | 'equities';

/** Search index + quiet list: every holding with a news feed. */
export interface NewsHolding {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  bucket: NewsBucket;
  openTradeOnly: boolean;
  storyCount: number;
  /** False when past the feed's fetch cap — its own page still loads its news. */
  loaded: boolean;
}

export interface PortfolioNewsResponse {
  /** Highest-ranked genuinely material stories; empty on quiet days. */
  topStories: RankedNewsItem[];
  crypto: AssetNewsGroup[];
  equities: AssetNewsGroup[];
  macro: RankedNewsItem[];
  /** Largest holding first; order only — values never leave the service. */
  holdings: NewsHolding[];
  fetchedAt: string;
}

export interface AssetNewsResponse {
  holding: Omit<NewsHolding, 'storyCount' | 'loaded'>;
  /** Newest first; undated stories last. */
  items: RankedNewsItem[];
  windowDays: number;
  fetchedAt: string;
}

const NEWS_PER_ASSET_FETCH = 10;
const NEWS_PER_ASSET_DISPLAY = 5;
const MACRO_NEWS_PER_QUERY = 8;
const MACRO_NEWS_LIMIT = 10;
const TOP_STORIES_LIMIT = 4;
const NEWS_FETCH_CONCURRENCY = 5;
// Raised from 25: smaller holdings were silently never fetched. Holdings past
// the cap still appear in `holdings` and load on their own page.
const MAX_NEWS_TARGETS = 40;
const FEED_WINDOW_DAYS = 14;
// A single holding's page looks further back: thinly covered listings (most
// SGX names) can go weeks between stories.
const ASSET_NEWS_WINDOW_DAYS = 60;
const ASSET_NEWS_YAHOO_FETCH = 30;
const ASSET_NEWS_GOOGLE_FETCH = 40;
const ASSET_NEWS_LIMIT = 60;

// Macro feed sources: broad-market tickers plus recurring policy topics.
// Yahoo's search endpoint returns general market coverage for all of these;
// ranking (not query membership) decides what actually surfaces.
const MACRO_NEWS_QUERIES = ['^GSPC', '^TNX', 'DX-Y.NYB', 'Federal Reserve', 'inflation'];

interface NewsTarget {
  asset: Asset;
  bucket: NewsBucket;
  plan: NewsQueryPlan;
  valueUsd: number;
  openTradeOnly: boolean;
}

export function newsBucketFor(category: string): NewsBucket | null {
  if (category === AssetCategory.LIQUID_CRYPTO) return 'crypto';
  if (category === AssetCategory.EQUITY || category === AssetCategory.UNIT_TRUST) {
    return 'equities';
  }
  // STABLECOIN / CASH / NFT / ANGEL have no meaningful headline feed.
  return null;
}

type PositionForNews = {
  assetId: string;
  quantity: number;
  marketValueUsd: number | null;
  asset: Asset;
};

function newsTargetFor(asset: Asset): Pick<NewsTarget, 'bucket' | 'plan'> | null {
  const bucket = newsBucketFor(asset.category);
  if (!bucket) return null;
  const plan = newsQueryPlan(asset);
  return plan ? { bucket, plan } : null;
}

/** Every news-eligible holding, largest first; open-trade-only targets last. */
function collectNewsTargets(
  positions: PositionForNews[],
  openTrades: Array<{ assetId: string; asset: Asset }>
): NewsTarget[] {
  const targets = new Map<string, NewsTarget>();

  for (const position of positions) {
    const valueUsd =
      position.marketValueUsd ?? position.quantity * (position.asset.currentPriceUsd ?? 0);
    const existing = targets.get(position.assetId);
    if (existing) {
      existing.valueUsd += valueUsd;
      continue;
    }
    const eligible = newsTargetFor(position.asset);
    if (!eligible) continue;
    targets.set(position.assetId, {
      asset: position.asset,
      ...eligible,
      valueUsd,
      openTradeOnly: false,
    });
  }

  for (const trade of openTrades) {
    if (targets.has(trade.assetId)) continue;
    const eligible = newsTargetFor(trade.asset);
    if (!eligible) continue;
    targets.set(trade.assetId, {
      asset: trade.asset,
      ...eligible,
      valueUsd: 0,
      openTradeOnly: true,
    });
  }

  return Array.from(targets.values()).sort(
    (a, b) => b.valueUsd - a.valueUsd || a.asset.symbol.localeCompare(b.asset.symbol)
  );
}

async function loadNewsTargets(userId: string): Promise<NewsTarget[]> {
  const [positions, openTrades] = await Promise.all([
    prisma.position.findMany({
      where: { userId, custodyOf: null },
      include: { asset: true },
    }),
    prisma.trade.findMany({
      where: { userId, status: TradeStatus.OPEN },
      include: { asset: true },
    }),
  ]);
  return collectNewsTargets(positions, openTrades);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.allSettled(chunk.map(fn))));
  }
  return results;
}

function valuesOrEmpty<T>(results: PromiseSettledResult<T[]>[]): T[][] {
  return results.map((result) => (result.status === 'fulfilled' ? result.value : []));
}

async function fetchYahooHoldingNews(target: NewsTarget, count: number) {
  const items = await priceService.getYahooProvider().getNews(target.plan.yahooQuery, count);
  return filterRelevantNews(items, target.plan.relevance);
}

function holdingCandidates(
  target: NewsTarget,
  items: ProviderNewsItem[],
  weight: number
): NewsCandidate[] {
  return items.map((item) => ({
    item,
    assetId: target.asset.id,
    symbol: target.asset.symbol,
    held: !target.openTradeOnly,
    weight,
  }));
}

function officialDomainsOf(targets: NewsTarget[]): string[] {
  return targets
    .map((target) => normalizeOfficialDomain(target.asset.officialDomain))
    .filter((domain): domain is string => domain !== null);
}

function holdingRef(target: NewsTarget): AssetNewsResponse['holding'] {
  return {
    assetId: target.asset.id,
    symbol: target.asset.symbol,
    name: target.asset.name,
    category: target.asset.category,
    bucket: target.bucket,
    openTradeOnly: target.openTradeOnly,
  };
}

function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function buildHoldingGroups(
  targets: NewsTarget[],
  stories: RankedStory[]
): { sections: Record<NewsBucket, AssetNewsGroup[]>; storyCounts: Map<string, number> } {
  // Grouping keys on asset id, never ticker text — Asset.symbol has no
  // uniqueness constraint, so two holdings can legitimately share a symbol.
  const primaryStories = new Map<string, RankedStory[]>();
  const touchingStories = new Map<string, RankedStory[]>();
  for (const story of stories) {
    if (story.primaryAssetId !== null) pushTo(primaryStories, story.primaryAssetId, story);
    for (const assetId of story.ownerAssetIds) pushTo(touchingStories, assetId, story);
  }
  const rankOf = new Map(stories.map((story, index) => [story, index]));

  const ranked: Array<{ bucket: NewsBucket; bestRank: number; group: AssetNewsGroup }> = [];
  const storyCounts = new Map<string, number>();
  for (const target of targets) {
    const touching = touchingStories.get(target.asset.id) ?? [];
    storyCounts.set(target.asset.id, touching.length);
    // One story, one place — except when every story about a holding was
    // filed under a bigger one; then show it here too rather than presenting
    // the holding as quiet. `stories` is globally sorted, so order survives.
    const own = primaryStories.get(target.asset.id) ?? [];
    const shown = own.length > 0 ? own : touching;
    if (shown.length === 0) continue;
    ranked.push({
      bucket: target.bucket,
      bestRank: rankOf.get(shown[0]) ?? Number.MAX_SAFE_INTEGER,
      group: {
        assetId: target.asset.id,
        symbol: target.asset.symbol,
        name: target.asset.name,
        category: target.asset.category,
        openTradeOnly: target.openTradeOnly,
        items: shown.slice(0, NEWS_PER_ASSET_DISPLAY).map((story) => story.ranked),
        storyCount: touching.length,
      },
    });
  }

  // Most newsworthy holding first (same ranking as the stories themselves),
  // so a small holding with material news is not buried under big quiet ones.
  ranked.sort((a, b) => a.bestRank - b.bestRank);
  const sections: Record<NewsBucket, AssetNewsGroup[]> = { crypto: [], equities: [] };
  for (const entry of ranked) sections[entry.bucket].push(entry.group);
  return { sections, storyCounts };
}

function newestFirst(a: RankedStory, b: RankedStory): number {
  if (a.publishedMs !== b.publishedMs) {
    if (a.publishedMs === null) return 1;
    if (b.publishedMs === null) return -1;
    return b.publishedMs - a.publishedMs;
  }
  return compareStories(a, b);
}

class NewsService {
  async getPortfolioNews(userId: string): Promise<PortfolioNewsResponse> {
    const allTargets = await loadNewsTargets(userId);
    const targets = allTargets.slice(0, MAX_NEWS_TARGETS);
    const googleTargets = targets.filter((target) => target.plan.googleQuery !== null);
    const yahoo = priceService.getYahooProvider();

    const [holdingResults, googleResults, macroResults] = await Promise.all([
      mapWithConcurrency(targets, NEWS_FETCH_CONCURRENCY, (target) =>
        fetchYahooHoldingNews(target, NEWS_PER_ASSET_FETCH)
      ),
      // Supplementary source: never rejects, so it never fails the page.
      mapWithConcurrency(googleTargets, NEWS_FETCH_CONCURRENCY, (target) =>
        googleNewsClient.search(target.plan.googleQuery!, FEED_WINDOW_DAYS, NEWS_PER_ASSET_FETCH)
      ),
      mapWithConcurrency(MACRO_NEWS_QUERIES, NEWS_FETCH_CONCURRENCY, (query) =>
        yahoo.getNews(query, MACRO_NEWS_PER_QUERY)
      ),
    ]);

    // Yahoo is the primary source: if every Yahoo request failed, reject so
    // the client keeps its last-good headlines instead of an empty feed.
    const primaryResults = [...holdingResults, ...macroResults];
    const firstSuccess = primaryResults.find((result) => result.status === 'fulfilled');
    if (!firstSuccess && primaryResults.length > 0) {
      const firstFailure = primaryResults[0] as PromiseRejectedResult;
      throw firstFailure.reason;
    }
    const holdingNews = valuesOrEmpty(holdingResults);
    const googleNews = valuesOrEmpty(googleResults);
    const macroBatches = valuesOrEmpty(macroResults);

    // Portfolio share is a ranking input only — it never leaves the service.
    const totalValueUsd = targets.reduce((sum, target) => sum + target.valueUsd, 0);
    const weightOf = (target: NewsTarget) =>
      totalValueUsd > 0 ? target.valueUsd / totalValueUsd : 0;
    const candidates: NewsCandidate[] = [
      ...targets.flatMap((target, index) =>
        holdingCandidates(target, holdingNews[index] ?? [], weightOf(target))
      ),
      ...googleTargets.flatMap((target, index) =>
        holdingCandidates(target, googleNews[index] ?? [], weightOf(target))
      ),
    ];
    for (const item of macroBatches.flat()) {
      candidates.push({ item, assetId: null, symbol: null, held: false, weight: 0 });
    }

    // One clustering space for the whole page: a story fetched under both a
    // holding query and a macro query (or from both Yahoo and Google) appears
    // exactly once, in the most relevant place, tagged with every affected symbol.
    const now = Date.now();
    const stories = rankStories(candidates, now, officialDomainsOf(targets));

    const { sections, storyCounts } = buildHoldingGroups(targets, stories);
    const macro = stories
      .filter((story) => story.primaryAssetId === null)
      .slice(0, MACRO_NEWS_LIMIT)
      .map((story) => story.ranked);
    // Never manufacture Top stories on a quiet day — the bar is high
    // materiality from a credible source, and an empty list is a valid result.
    const topStories = stories
      .filter(isTopStoryCandidate)
      .slice(0, TOP_STORIES_LIMIT)
      .map((story) => story.ranked);

    // Fire-and-forget: enrichment (Stage 2) never blocks or fails this response.
    newsEnrichmentService.trackAndQueue(userId, topStories);

    return {
      topStories,
      crypto: sections.crypto,
      equities: sections.equities,
      macro,
      holdings: allTargets.map((target, index) => ({
        ...holdingRef(target),
        storyCount: storyCounts.get(target.asset.id) ?? 0,
        loaded: index < MAX_NEWS_TARGETS,
      })),
      fetchedAt: new Date(now).toISOString(),
    };
  }

  /** Every story touching one of the user's news-eligible holdings, newest first. */
  async getAssetNews(userId: string, assetId: string): Promise<AssetNewsResponse> {
    // Ownership and eligibility come from the same target list as the feed:
    // an owned (non-custody) position or an open trade with a news query.
    const targets = await loadNewsTargets(userId);
    const target = targets.find((candidate) => candidate.asset.id === assetId);
    if (!target) throw new AppError('No news feed for this holding', 404);

    const [yahooResult, googleItems] = await Promise.all([
      fetchYahooHoldingNews(target, ASSET_NEWS_YAHOO_FETCH).then(
        (items) => ({ ok: true as const, items }),
        (error: unknown) => ({ ok: false as const, error })
      ),
      target.plan.googleQuery
        ? googleNewsClient.search(
            target.plan.googleQuery,
            ASSET_NEWS_WINDOW_DAYS,
            ASSET_NEWS_GOOGLE_FETCH
          )
        : Promise.resolve([]),
    ]);
    // Uncached total failure rejects so the client can offer a retry.
    if (!yahooResult.ok && googleItems.length === 0) throw yahooResult.error;

    const items = [...(yahooResult.ok ? yahooResult.items : []), ...googleItems];
    const now = Date.now();
    const stories = rankStories(
      holdingCandidates(target, items, 0),
      now,
      officialDomainsOf(targets),
      {
        maxAgeDays: ASSET_NEWS_WINDOW_DAYS,
        maxAgeDaysHighImportance: ASSET_NEWS_WINDOW_DAYS,
      }
    );

    return {
      holding: holdingRef(target),
      items: stories
        .sort(newestFirst)
        .slice(0, ASSET_NEWS_LIMIT)
        .map((story) => story.ranked),
      windowDays: ASSET_NEWS_WINDOW_DAYS,
      fetchedAt: new Date(now).toISOString(),
    };
  }
}

export const newsService = new NewsService();
