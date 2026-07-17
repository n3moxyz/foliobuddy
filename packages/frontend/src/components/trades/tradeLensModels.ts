import type { Trade } from '@/lib/types';

export type TradeLens = 'review' | 'ticker' | 'monthly';

export interface TickerDossier {
  symbol: string;
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

export function buildTickerDossiers(trades: Trade[]): TickerDossier[] {
  const grouped = new Map<string, Trade[]>();
  for (const trade of trades) {
    const key = trade.asset.symbol;
    grouped.set(key, [...(grouped.get(key) ?? []), trade]);
  }

  return Array.from(grouped.entries())
    .map(([symbol, tickerTrades]) => {
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
        symbol,
        name: tickerTrades[0]?.asset.name ?? symbol,
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
    .sort(
      (a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL) || a.symbol.localeCompare(b.symbol)
    );
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
