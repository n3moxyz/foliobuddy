import type { Asset, Trade } from '@/lib/types';
import { CategoryGroup, categoryGroup } from '@/lib/utils';

export type TradeLens = 'review' | 'ticker' | 'monthly';

/** One traded asset as the ticker views address it. */
export interface TickerRef {
  assetId: string;
  symbol: string;
}

export interface TickerDossier extends TickerRef {
  /** The ticker, plus its asset class when another traded asset shares it. */
  label: string;
  name: string;
  trades: Trade[];
  closedTrades: Trade[];
  openCount: number;
  totalPnL: number;
  wins: number;
  losses: number;
  winRate: number;
  avgHoldDays: number | null;
  avgPositionSizeUsd: number;
  largestWin: Trade | null;
  largestLoss: Trade | null;
  topTags: Array<{ label: string; count: number }>;
}

export interface MonthlyReview {
  key: string;
  label: string;
  trades: Trade[];
  totalPnL: number;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  largestWin: Trade | null;
  largestLoss: Trade | null;
  topTags: Array<{ label: string; count: number }>;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function getClosedTrades(trades: Trade[]) {
  return trades.filter(
    (trade) =>
      trade.status === 'CLOSED' &&
      typeof trade.realizedPnL === 'number' &&
      Number.isFinite(trade.realizedPnL)
  );
}

function getHoldDays(trade: Trade) {
  const start = new Date(trade.entryDate).getTime();
  const end = new Date(trade.exitDate ?? new Date().toISOString()).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

function getTradeTags(trade: Trade) {
  if (!trade.tags) return [];

  return trade.tags.split(',').flatMap((tag) => {
    const label = tag.trim();
    return label ? [label] : [];
  });
}

export function topTagsForTrades(trades: Trade[], limit = 3) {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0;
  const counts = new Map<string, number>();
  for (const trade of trades) {
    for (const tag of getTradeTags(trade)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, safeLimit);
}

function getMonthKey(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string) {
  if (key === 'unknown') return 'Unknown';
  return MONTH_FORMATTER.format(new Date(`${key}-01T00:00:00.000Z`));
}

function bestTradeByPnL(trades: Trade[]) {
  return trades.reduce<Trade | null>((best, trade) => {
    if (trade.realizedPnL === null || trade.realizedPnL <= 0) return best;
    if (!best || (best.realizedPnL ?? -Infinity) < trade.realizedPnL) return trade;
    return best;
  }, null);
}

function worstTradeByPnL(trades: Trade[]) {
  return trades.reduce<Trade | null>((worst, trade) => {
    if (trade.realizedPnL === null || trade.realizedPnL >= 0) return worst;
    if (!worst || (worst.realizedPnL ?? Infinity) > trade.realizedPnL) return trade;
    return worst;
  }, null);
}

const CLASS_LABELS: Record<CategoryGroup, string> = {
  [CategoryGroup.CRYPTO]: 'Crypto',
  [CategoryGroup.STABLES]: 'Cash',
  [CategoryGroup.EQUITIES]: 'Equity',
  [CategoryGroup.UNIT_TRUSTS]: 'Unit trust',
};

type LabelledAsset = Pick<Asset, 'id' | 'symbol' | 'name' | 'category'>;

/**
 * What tells each asset apart from the others sharing its ticker: its class when
 * no other shares that, else its name, else its name numbered by id. The last
 * case is duplicate catalog rows for one instrument (an old unpriced import
 * beside the live listing).
 */
function distinctSuffixes(group: LabelledAsset[]): string[] {
  const classOf = (asset: LabelledAsset) => CLASS_LABELS[categoryGroup(asset.category)];
  return group.map((asset) => {
    if (group.filter((other) => classOf(other) === classOf(asset)).length === 1) {
      return classOf(asset);
    }
    const sameName = group.filter((other) => other.name === asset.name);
    if (sameName.length === 1) return asset.name;
    const ids = sameName.map((other) => other.id).sort();
    return `${asset.name} (${ids.indexOf(asset.id) + 1})`;
  });
}

/**
 * Display label per asset id, unique among the given assets. Tickers repeat
 * across asset classes (BTC is a coin and a spot ETF; USDE is a stablecoin and
 * StablecoinX's equity), so a shared ticker gets a suffix.
 */
export function tickerLabels(assets: LabelledAsset[]): Map<string, string> {
  const bySymbol = new Map<string, LabelledAsset[]>();
  for (const asset of assets) {
    bySymbol.set(asset.symbol, [...(bySymbol.get(asset.symbol) ?? []), asset]);
  }

  const labels = new Map<string, string>();
  for (const [symbol, group] of bySymbol) {
    const suffixes = group.length > 1 ? distinctSuffixes(group) : [];
    group.forEach((asset, index) => {
      labels.set(asset.id, suffixes[index] ? `${symbol} · ${suffixes[index]}` : symbol);
    });
  }
  return labels;
}

/** The dossier a `?ticker=` (and, for a shared ticker, `&asset=`) URL names. */
export function findTickerDossier(
  dossiers: TickerDossier[],
  ticker: string | null,
  assetId: string | null
): TickerDossier | null {
  if (!ticker) return null;
  const matches = dossiers.filter((dossier) => dossier.symbol === ticker);
  return matches.find((dossier) => dossier.assetId === assetId) ?? matches[0] ?? null;
}

/** Point URL params at one asset: a readable ticker, plus its id only when shared. */
export function setTickerParams(
  params: URLSearchParams,
  ticker: TickerRef,
  dossiers: TickerDossier[]
) {
  params.set('ticker', ticker.symbol);
  if (dossiers.filter((dossier) => dossier.symbol === ticker.symbol).length > 1) {
    params.set('asset', ticker.assetId);
  } else {
    params.delete('asset');
  }
}

export function clearTickerParams(params: URLSearchParams) {
  params.delete('ticker');
  params.delete('asset');
}

export function buildTickerDossiers(trades: Trade[]): TickerDossier[] {
  // Keyed by asset, not ticker: a BTC coin trade and a BTC ETF trade are different assets.
  const grouped = new Map<string, Trade[]>();
  for (const trade of trades) {
    grouped.set(trade.assetId, [...(grouped.get(trade.assetId) ?? []), trade]);
  }
  const labels = tickerLabels(
    Array.from(grouped, ([assetId, [{ asset }]]) => ({ ...asset, id: assetId }))
  );

  return Array.from(grouped.entries())
    .map(([assetId, tickerTrades]) => {
      const { symbol, name } = tickerTrades[0].asset;
      const closedTrades = getClosedTrades(tickerTrades);
      const wins = closedTrades.filter((trade) => (trade.realizedPnL ?? 0) > 0).length;
      const losses = closedTrades.filter((trade) => (trade.realizedPnL ?? 0) < 0).length;
      const totalPnL = closedTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0);
      const holdDays = closedTrades
        .map(getHoldDays)
        .filter((value): value is number => value !== null);
      const avgHoldDays =
        holdDays.length > 0
          ? Math.round(holdDays.reduce((sum, value) => sum + value, 0) / holdDays.length)
          : null;

      return {
        assetId,
        symbol,
        label: labels.get(assetId) ?? symbol,
        name,
        trades: tickerTrades,
        closedTrades,
        openCount: tickerTrades.filter((trade) => trade.status === 'OPEN').length,
        totalPnL,
        wins,
        losses,
        winRate: closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0,
        avgHoldDays,
        avgPositionSizeUsd: (() => {
          const sizes = tickerTrades
            .map((trade) => trade.positionSizeUsd)
            .filter((size) => Number.isFinite(size) && size >= 0);
          return sizes.length > 0 ? sizes.reduce((sum, size) => sum + size, 0) / sizes.length : 0;
        })(),
        largestWin: bestTradeByPnL(closedTrades),
        largestLoss: worstTradeByPnL(closedTrades),
        topTags: topTagsForTrades(tickerTrades),
      };
    })
    .sort((a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL) || a.label.localeCompare(b.label));
}

export function buildMonthlyReviews(trades: Trade[]): MonthlyReview[] {
  const grouped = new Map<string, Trade[]>();
  for (const trade of getClosedTrades(trades)) {
    const key = getMonthKey(trade.exitDate ?? trade.entryDate);
    grouped.set(key, [...(grouped.get(key) ?? []), trade]);
  }

  return Array.from(grouped.entries())
    .map(([key, monthTrades]) => {
      const wins = monthTrades.filter((trade) => (trade.realizedPnL ?? 0) > 0).length;
      const losses = monthTrades.filter((trade) => (trade.realizedPnL ?? 0) < 0).length;
      const totalPnL = monthTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0);
      return {
        key,
        label: formatMonthLabel(key),
        trades: monthTrades,
        totalPnL,
        count: monthTrades.length,
        wins,
        losses,
        winRate: monthTrades.length > 0 ? (wins / monthTrades.length) * 100 : 0,
        largestWin: bestTradeByPnL(monthTrades),
        largestLoss: worstTradeByPnL(monthTrades),
        topTags: topTagsForTrades(monthTrades),
      };
    })
    .sort((a, b) => {
      if (a.key === 'unknown') return 1;
      if (b.key === 'unknown') return -1;
      return b.key.localeCompare(a.key);
    });
}
