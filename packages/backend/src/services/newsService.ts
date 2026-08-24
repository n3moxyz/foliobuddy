import type { Asset } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { priceService } from './priceService.js';
import { AssetCategory, PriceProvider, TradeStatus } from '../lib/constants.js';
import type { ProviderNewsItem } from './providers/types.js';

export interface AssetNewsGroup {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  openTradeOnly: boolean;
  items: ProviderNewsItem[];
}

export interface PortfolioNewsResponse {
  crypto: AssetNewsGroup[];
  equities: AssetNewsGroup[];
  macro: ProviderNewsItem[];
  fetchedAt: string;
}

const NEWS_PER_ASSET_FETCH = 8;
const NEWS_PER_ASSET_DISPLAY = 5;
const MACRO_NEWS_PER_QUERY = 6;
const MACRO_NEWS_LIMIT = 10;
const NEWS_FETCH_CONCURRENCY = 5;

// Macro feed sources: broad-market tickers plus recurring policy topics.
// Yahoo's search endpoint returns general market coverage for all of these.
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

function byPublishedAtDesc(a: ProviderNewsItem, b: ProviderNewsItem): number {
  return (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '');
}

function buildHoldingSections(
  targets: NewsTarget[],
  newsPerTarget: ProviderNewsItem[][]
): Record<NewsBucket, AssetNewsGroup[]> {
  // The same story often tags several tickers — dedupe within a section so the
  // highest-value holding keeps it and it never renders twice.
  const seen: Record<NewsBucket, Set<string>> = { crypto: new Set(), equities: new Set() };
  const sections: Record<NewsBucket, AssetNewsGroup[]> = { crypto: [], equities: [] };

  targets.forEach((target, index) => {
    const items = (newsPerTarget[index] ?? [])
      .filter((item) => !seen[target.bucket].has(item.id))
      .sort(byPublishedAtDesc)
      .slice(0, NEWS_PER_ASSET_DISPLAY);
    for (const item of items) seen[target.bucket].add(item.id);
    if (items.length === 0) return;
    sections[target.bucket].push({
      assetId: target.asset.id,
      symbol: target.asset.symbol,
      name: target.asset.name,
      category: target.asset.category,
      openTradeOnly: target.openTradeOnly,
      items,
    });
  });

  return sections;
}

function dedupeMacro(batches: ProviderNewsItem[][]): ProviderNewsItem[] {
  const seen = new Set<string>();
  return batches
    .flat()
    .filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .sort(byPublishedAtDesc)
    .slice(0, MACRO_NEWS_LIMIT);
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

    const sections = buildHoldingSections(targets, holdingNews);

    return {
      crypto: sections.crypto,
      equities: sections.equities,
      macro: dedupeMacro(macroBatches),
      fetchedAt: new Date().toISOString(),
    };
  }
}

export const newsService = new NewsService();
