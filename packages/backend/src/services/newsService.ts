import type { Asset } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from './priceService.js';
import { AssetCategory, PriceProvider, TradeStatus } from '../lib/constants.js';
import {
  isTopStoryCandidate,
  rankStories,
  type NewsCandidate,
  type RankedNewsItem,
  type RankedStory,
} from './news/ranking.js';
import { newsEnrichmentService } from './news/enrichmentService.js';
import { normalizeOfficialDomain } from './news/sourceQuality.js';

export interface AssetNewsGroup {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  openTradeOnly: boolean;
  items: RankedNewsItem[];
}

export interface PortfolioNewsResponse {
  /** Highest-ranked genuinely material stories; empty on quiet days. */
  topStories: RankedNewsItem[];
  crypto: AssetNewsGroup[];
  equities: AssetNewsGroup[];
  macro: RankedNewsItem[];
  fetchedAt: string;
}

const NEWS_PER_ASSET_FETCH = 10;
const NEWS_PER_ASSET_DISPLAY = 5;
const MACRO_NEWS_PER_QUERY = 8;
const MACRO_NEWS_LIMIT = 10;
const TOP_STORIES_LIMIT = 4;
const NEWS_FETCH_CONCURRENCY = 5;

// Macro feed sources: broad-market tickers plus recurring policy topics.
// Yahoo's search endpoint returns general market coverage for all of these;
// ranking (not query membership) decides what actually surfaces.
const MACRO_NEWS_QUERIES = ['^GSPC', '^TNX', 'DX-Y.NYB', 'Federal Reserve', 'inflation'];

type NewsBucket = 'crypto' | 'equities';

interface NewsTarget {
  asset: Asset;
  bucket: NewsBucket;
  ticker: string;
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

export function yahooNewsTicker(
  asset: Pick<Asset, 'symbol' | 'priceProvider' | 'providerAssetId'>
): string | null {
  if (asset.priceProvider === PriceProvider.YAHOO) {
    // Yahoo-priced assets already store an exact Yahoo ticker (incl. .SI/.T suffixes).
    return asset.providerAssetId?.trim() || null;
  }
  if (asset.priceProvider === PriceProvider.COINGECKO) {
    const symbol = asset.symbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(symbol)) return null;
    return `${symbol}-USD`;
  }
  // Manually-priced assets have no queryable ticker.
  return null;
}

type PositionForNews = {
  assetId: string;
  quantity: number;
  marketValueUsd: number | null;
  asset: Asset;
};

function collectNewsTargets(
  positions: PositionForNews[],
  openTrades: Array<{ assetId: string; asset: Asset }>
): NewsTarget[] {
  const targets = new Map<string, NewsTarget>();

  for (const position of positions) {
    const bucket = newsBucketFor(position.asset.category);
    if (!bucket) continue;
    const ticker = yahooNewsTicker(position.asset);
    if (!ticker) continue;
    const valueUsd =
      position.marketValueUsd ?? position.quantity * (position.asset.currentPriceUsd ?? 0);
    const existing = targets.get(position.assetId);
    if (existing) {
      existing.valueUsd += valueUsd;
    } else {
      targets.set(position.assetId, {
        asset: position.asset,
        bucket,
        ticker,
        valueUsd,
        openTradeOnly: false,
      });
    }
  }

  for (const trade of openTrades) {
    if (targets.has(trade.assetId)) continue;
    const bucket = newsBucketFor(trade.asset.category);
    if (!bucket) continue;
    const ticker = yahooNewsTicker(trade.asset);
    if (!ticker) continue;
    targets.set(trade.assetId, {
      asset: trade.asset,
      bucket,
      ticker,
      valueUsd: 0,
      openTradeOnly: true,
    });
  }

  // Largest holdings first; open-trade-only targets (value 0) sort last.
  return Array.from(targets.values()).sort(
    (a, b) => b.valueUsd - a.valueUsd || a.asset.symbol.localeCompare(b.asset.symbol)
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    results.push(...(await Promise.all(chunk.map(fn))));
  }
  return results;
}

function buildHoldingGroups(
  targets: NewsTarget[],
  stories: RankedStory[]
): Record<NewsBucket, AssetNewsGroup[]> {
  // Grouping keys on asset id, never ticker text — Asset.symbol has no
  // uniqueness constraint, so two holdings can legitimately share a symbol.
  const byPrimaryAssetId = new Map<string, RankedStory[]>();
  for (const story of stories) {
    if (story.primaryAssetId === null) continue;
    const list = byPrimaryAssetId.get(story.primaryAssetId) ?? [];
    list.push(story);
    byPrimaryAssetId.set(story.primaryAssetId, list);
  }

  const sections: Record<NewsBucket, AssetNewsGroup[]> = { crypto: [], equities: [] };
  for (const target of targets) {
    const own = byPrimaryAssetId.get(target.asset.id) ?? [];
    // `stories` arrives globally sorted, so per-group order is preserved.
    const items = own.slice(0, NEWS_PER_ASSET_DISPLAY).map((story) => story.ranked);
    if (items.length === 0) continue;
    sections[target.bucket].push({
      assetId: target.asset.id,
      symbol: target.asset.symbol,
      name: target.asset.name,
      category: target.asset.category,
      openTradeOnly: target.openTradeOnly,
      items,
    });
  }
  return sections;
}

class NewsService {
  async getPortfolioNews(userId: string): Promise<PortfolioNewsResponse> {
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

    const targets = collectNewsTargets(positions, openTrades);
    const yahoo = priceService.getYahooProvider();

    const [holdingNews, macroBatches] = await Promise.all([
      mapWithConcurrency(targets, NEWS_FETCH_CONCURRENCY, (target) =>
        yahoo.getNews(target.ticker, NEWS_PER_ASSET_FETCH)
      ),
      mapWithConcurrency(MACRO_NEWS_QUERIES, NEWS_FETCH_CONCURRENCY, (query) =>
        yahoo.getNews(query, MACRO_NEWS_PER_QUERY)
      ),
    ]);

    // Portfolio share is a ranking input only — it never leaves the service.
    const totalValueUsd = targets.reduce((sum, target) => sum + target.valueUsd, 0);
    const candidates: NewsCandidate[] = targets.flatMap((target, index) =>
      (holdingNews[index] ?? []).map((item) => ({
        item,
        assetId: target.asset.id,
        symbol: target.asset.symbol,
        held: !target.openTradeOnly,
        weight: totalValueUsd > 0 ? target.valueUsd / totalValueUsd : 0,
      }))
    );
    for (const item of macroBatches.flat()) {
      candidates.push({ item, assetId: null, symbol: null, held: false, weight: 0 });
    }

    // One clustering space for the whole page: a story fetched under both a
    // holding ticker and a macro query appears exactly once, in the most
    // relevant place, tagged with every affected symbol.
    const now = Date.now();
    const officialDomains = targets
      .map((target) => normalizeOfficialDomain(target.asset.officialDomain))
      .filter((domain): domain is string => domain !== null);
    const stories = rankStories(candidates, now, officialDomains);

    const sections = buildHoldingGroups(targets, stories);
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
      fetchedAt: new Date(now).toISOString(),
    };
  }
}

export const newsService = new NewsService();
