import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useTrades,
  useTradeAnalytics,
  useDeleteAllTrades,
  useDeleteTrade,
} from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import {
  formatCurrency,
  formatNumber,
  formatPrice,
  formatPercent,
  formatDate,
  getPnLColorClass,
} from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { TradeForm } from '@/components/trades/TradeForm';
import { TradeStatsCard } from '@/components/dashboard/TradeStatsCard';
import { TickerPnLCard } from '@/components/trades/TickerPnLCard';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Download,
  Copy,
  Check,
  Trash2,
  MoreVertical,
  Pencil,
  Columns2,
  Columns3,
  X,
  CalendarDays,
  FileText,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import type { Trade } from '@/lib/types';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig } from '@/hooks/useTableSort';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';

// Format trades for clipboard - includes asset info for recreating
function formatTradesForClipboard(trades: Trade[]) {
  const formatted = trades.map((t) => ({
    asset: {
      coingeckoId: t.asset.coingeckoId,
      symbol: t.asset.symbol,
      name: t.asset.name,
      category: t.asset.category,
    },
    direction: t.direction,
    entryPrice: t.entryPrice,
    exitPrice: t.exitPrice,
    quantity: t.quantity,
    entryDate: t.entryDate,
    exitDate: t.exitDate,
    status: t.status,
    notes: t.notes,
    tags: t.tags,
  }));
  return JSON.stringify(formatted, null, 2);
}

async function copyTradesToClipboard(trades: Trade[]): Promise<boolean> {
  try {
    const text = formatTradesForClipboard(trades);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

type TradeLens = 'review' | 'ticker' | 'monthly';

interface TickerDossier {
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

interface MonthlyReview {
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

function convertCurrency(usdValue: number, currency: 'USD' | 'SGD', fxRate: number) {
  return currency === 'SGD' ? usdValue * fxRate : usdValue;
}

function formatSignedCurrency(value: number, currency: 'USD' | 'SGD', decimals = 0) {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatCurrency(value, currency, decimals)}`;
}

function getClosedTrades(trades: Trade[]) {
  return trades.filter((trade) => trade.status === 'CLOSED' && trade.realizedPnL !== null);
}

function getHoldDays(trade: Trade) {
  const start = new Date(trade.entryDate).getTime();
  const end = new Date(trade.exitDate ?? new Date().toISOString()).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  return Math.max(1, Math.round((end - start) / MS_PER_DAY));
}

function getTradeTags(trade: Trade) {
  return (
    trade.tags
      ?.split(',')
      .map((tag) => tag.trim())
      .filter(Boolean) ?? []
  );
}

function topTagsForTrades(trades: Trade[], limit = 3) {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    for (const tag of getTradeTags(trade)) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
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
    if (trade.realizedPnL === null) return best;
    if (!best || (best.realizedPnL ?? -Infinity) < trade.realizedPnL) return trade;
    return best;
  }, null);
}

function worstTradeByPnL(trades: Trade[]) {
  return trades.reduce<Trade | null>((worst, trade) => {
    if (trade.realizedPnL === null) return worst;
    if (!worst || (worst.realizedPnL ?? Infinity) > trade.realizedPnL) return trade;
    return worst;
  }, null);
}

function buildTickerDossiers(trades: Trade[]): TickerDossier[] {
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
        avgPositionSizeUsd:
          tickerTrades.length > 0
            ? tickerTrades.reduce((sum, trade) => sum + trade.positionSizeUsd, 0) /
              tickerTrades.length
            : 0,
        largestWin: bestTradeByPnL(closedTrades),
        largestLoss: worstTradeByPnL(closedTrades),
        topTags: topTagsForTrades(tickerTrades),
      };
    })
    .sort(
      (a, b) => Math.abs(b.totalPnL) - Math.abs(a.totalPnL) || a.symbol.localeCompare(b.symbol)
    );
}

function buildMonthlyReviews(trades: Trade[]): MonthlyReview[] {
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
    .sort((a, b) => b.key.localeCompare(a.key));
}

export default function Trades() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'OPEN' | 'CLOSED'>('all');
  const [copiedAll, setCopiedAll] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);
  const [highlightTradeId, setHighlightTradeId] = useState<string | null>(null);
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [tickerPnlExpanded, setTickerPnlExpanded] = useState(false);

  const { currency } = useCurrencyStore();
  const { data: summary } = usePortfolioSummary();
  const { data: trades, isLoading } = useTrades();
  const { data: analytics } = useTradeAnalytics();
  const deleteAllMutation = useDeleteAllTrades();
  const deleteTradeMutation = useDeleteTrade();

  // Calculate FX rate from summary
  const fxRate =
    summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0
      ? summary.totalValueSgd / summary.totalValueUsd
      : 1.35;

  const allTrades = useMemo(() => trades ?? [], [trades]);
  const tickerDossiers = useMemo(() => buildTickerDossiers(allTrades), [allTrades]);
  const monthlyReviews = useMemo(() => buildMonthlyReviews(allTrades), [allTrades]);
  const tickerFilter = searchParams.get('ticker');
  const activeLens: TradeLens =
    searchParams.get('view') === 'monthly' ? 'monthly' : tickerFilter ? 'ticker' : 'review';
  const selectedTicker =
    tickerDossiers.find((ticker) => ticker.symbol === tickerFilter) ?? tickerDossiers[0] ?? null;
  const filteredTrades = tickerFilter
    ? allTrades.filter((trade) => trade.asset.symbol === tickerFilter)
    : allTrades;
  const openTrades = filteredTrades.filter((trade) => trade.status === 'OPEN');
  const closedTrades = filteredTrades.filter((trade) => trade.status === 'CLOSED');
  const visibleTrades =
    filter === 'OPEN' ? openTrades : filter === 'CLOSED' ? closedTrades : filteredTrades;

  const setLens = useCallback(
    (lens: TradeLens) => {
      const next = new URLSearchParams(searchParams);
      if (lens === 'monthly') {
        next.set('view', 'monthly');
        next.delete('ticker');
      } else if (lens === 'ticker') {
        next.delete('view');
        if (!next.get('ticker') && tickerDossiers[0]) {
          next.set('ticker', tickerDossiers[0].symbol);
        }
      } else {
        next.delete('view');
        next.delete('ticker');
      }
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams, tickerDossiers]
  );

  const setTickerLens = useCallback(
    (symbol: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.set('ticker', symbol);
      setSearchParams(next, { replace: false });
      setFilter('all');
    },
    [searchParams, setSearchParams]
  );

  const clearTickerLens = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('ticker');
    setSearchParams(next, { replace: false });
  }, [searchParams, setSearchParams]);

  const handleNotableTradeClick = useCallback(
    (tradeId: string) => {
      const next = new URLSearchParams(searchParams);
      next.delete('view');
      next.delete('ticker');
      setSearchParams(next, { replace: false });
      setFilter('all');
      setHighlightTradeId(tradeId);
    },
    [searchParams, setSearchParams]
  );

  return (
    <div className="space-y-6">
      <div className="animate-fade-in-up flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Trade Journal</h1>
          {analytics && (
            <p className="text-sm text-muted-foreground">
              {analytics.totalTrades} trades · {analytics.winRate?.toFixed(0) ?? 0}% win rate
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={async () => {
              if (trades && trades.length > 0) {
                const success = await copyTradesToClipboard(trades);
                if (success) {
                  setCopiedAll(true);
                  setTimeout(() => setCopiedAll(false), 2000);
                }
              }
            }}
            disabled={!trades || trades.length === 0}
          >
            {copiedAll ? (
              <Check className="h-4 w-4 mr-1 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 mr-1" />
            )}
            {copiedAll ? 'Copied!' : 'Copy All'}
          </Button>
          <Button size="sm" className="touch-manipulation" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Log Trade
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                aria-label="More options"
                className="touch-manipulation"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="sm:hidden"
                onClick={async () => {
                  if (trades && trades.length > 0) {
                    const success = await copyTradesToClipboard(trades);
                    if (success) {
                      setCopiedAll(true);
                      setTimeout(() => setCopiedAll(false), 2000);
                    }
                  }
                }}
                disabled={!trades || trades.length === 0}
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy All
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={!trades || trades.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete All
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportTradesCsv(), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export All Trades
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.open(api.exportTradesCsv({ status: 'OPEN' }), '_blank')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Open Trades
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => window.open(api.exportTradesCsv({ status: 'CLOSED' }), '_blank')}
              >
                <Download className="h-4 w-4 mr-2" />
                Export Closed Trades
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs value={activeLens} onValueChange={(value) => setLens(value as TradeLens)}>
        <div className="flex items-center gap-3 overflow-x-auto border-b pb-2">
          <TabsList>
            <TabsTrigger value="review">
              <FileText className="mr-1.5 h-3.5 w-3.5" />
              Review
            </TabsTrigger>
            <TabsTrigger value="ticker" disabled={tickerDossiers.length === 0}>
              <Target className="mr-1.5 h-3.5 w-3.5" />
              Ticker
            </TabsTrigger>
            <TabsTrigger value="monthly" disabled={monthlyReviews.length === 0}>
              <CalendarDays className="mr-1.5 h-3.5 w-3.5" />
              Monthly
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="review" className="mt-5 space-y-6">
          {analytics && (
            <TradeStatsCard
              analytics={analytics}
              currency={currency}
              fxRate={fxRate}
              onTradeClick={handleNotableTradeClick}
              isExpanded={statsExpanded}
              onToggle={() => setStatsExpanded(!statsExpanded)}
            />
          )}

          {allTrades.length > 0 && (
            <TickerPnLCard
              trades={allTrades}
              currency={currency}
              fxRate={fxRate}
              onTickerClick={setTickerLens}
              isExpanded={tickerPnlExpanded}
              onToggle={() => setTickerPnlExpanded(!tickerPnlExpanded)}
            />
          )}

          <TradeTapeSection
            trades={visibleTrades}
            isLoading={isLoading}
            filter={filter}
            onFilterChange={setFilter}
            filteredCount={filteredTrades.length}
            openCount={openTrades.length}
            closedCount={closedTrades.length}
            onEdit={setEditingTrade}
            onDelete={setDeletingTrade}
            highlightTradeId={highlightTradeId}
            onHighlightComplete={() => setHighlightTradeId(null)}
          />
        </TabsContent>

        <TabsContent value="ticker" className="mt-5 space-y-5">
          <TickerDossierLens
            selectedTicker={selectedTicker}
            tickerDossiers={tickerDossiers}
            currency={currency}
            fxRate={fxRate}
            onTickerClick={setTickerLens}
            onClear={clearTickerLens}
            onTradeClick={handleNotableTradeClick}
          />

          <TradeTapeSection
            title={tickerFilter ? `${tickerFilter} Trades` : 'Ticker Trades'}
            subtitle={`${visibleTrades.length} shown`}
            trades={visibleTrades}
            isLoading={isLoading}
            filter={filter}
            onFilterChange={setFilter}
            filteredCount={filteredTrades.length}
            openCount={openTrades.length}
            closedCount={closedTrades.length}
            tickerFilter={tickerFilter}
            onClearTicker={clearTickerLens}
            onEdit={setEditingTrade}
            onDelete={setDeletingTrade}
            highlightTradeId={highlightTradeId}
            onHighlightComplete={() => setHighlightTradeId(null)}
          />
        </TabsContent>

        <TabsContent value="monthly" className="mt-5">
          <MonthlyPostmortemLens
            monthlyReviews={monthlyReviews}
            openTrades={allTrades.filter((trade) => trade.status === 'OPEN')}
            currency={currency}
            fxRate={fxRate}
            onTradeClick={handleNotableTradeClick}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Log New Trade</DialogTitle>
          </DialogHeader>
          <TradeForm onSuccess={() => setShowAddForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Trades</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all{' '}
              <span className="font-semibold text-foreground">{trades?.length || 0}</span> trades?
              This will permanently remove all your trade history.
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDeleteAllConfirm(false)}
                disabled={deleteAllMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteAllMutation.mutate(undefined, {
                    onSuccess: () => {
                      setShowDeleteAllConfirm(false);
                    },
                  });
                }}
                disabled={deleteAllMutation.isPending}
              >
                {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTrade} onOpenChange={(open) => !open && setEditingTrade(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Trade</DialogTitle>
          </DialogHeader>
          {editingTrade && (
            <TradeForm trade={editingTrade} onSuccess={() => setEditingTrade(null)} />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingTrade} onOpenChange={(open) => !open && setDeletingTrade(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Trade</DialogTitle>
            <DialogDescription>This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete this{' '}
              <span className="font-semibold text-foreground">
                {deletingTrade?.asset.symbol} {deletingTrade?.direction}
              </span>{' '}
              trade?
            </p>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeletingTrade(null)}
                disabled={deleteTradeMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  if (deletingTrade) {
                    deleteTradeMutation.mutate(deletingTrade.id, {
                      onSuccess: () => {
                        setDeletingTrade(null);
                      },
                    });
                  }
                }}
                disabled={deleteTradeMutation.isPending}
              >
                {deleteTradeMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TradeTapeSection({
  title,
  subtitle,
  trades,
  isLoading,
  filter,
  onFilterChange,
  filteredCount,
  openCount,
  closedCount,
  tickerFilter,
  onClearTicker,
  onEdit,
  onDelete,
  highlightTradeId,
  onHighlightComplete,
}: {
  title?: string;
  subtitle?: string;
  trades: Trade[];
  isLoading: boolean;
  filter: 'all' | 'OPEN' | 'CLOSED';
  onFilterChange: (filter: 'all' | 'OPEN' | 'CLOSED') => void;
  filteredCount: number;
  openCount: number;
  closedCount: number;
  tickerFilter?: string | null;
  onClearTicker?: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  highlightTradeId?: string | null;
  onHighlightComplete?: () => void;
}) {
  return (
    <section className="space-y-3">
      <div
        className={
          title
            ? 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'
            : 'flex items-center gap-2 flex-wrap'
        }
      >
        {title && (
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as 'all' | 'OPEN' | 'CLOSED')}>
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList className="sm:w-auto">
              <TabsTrigger value="all">All ({filteredCount})</TabsTrigger>
              <TabsTrigger value="OPEN">Open ({openCount})</TabsTrigger>
              <TabsTrigger value="CLOSED">Closed ({closedCount})</TabsTrigger>
            </TabsList>
            {tickerFilter && onClearTicker && (
              <Button
                variant="secondary"
                size="sm"
                className="h-8 rounded-full text-xs gap-1"
                onClick={onClearTicker}
              >
                {tickerFilter}
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </Tabs>
      </div>

      <TradeTable
        trades={trades}
        isLoading={isLoading}
        onEdit={onEdit}
        onDelete={onDelete}
        highlightTradeId={highlightTradeId}
        onHighlightComplete={onHighlightComplete}
      />
    </section>
  );
}

function TickerDossierLens({
  selectedTicker,
  tickerDossiers,
  currency,
  fxRate,
  onTickerClick,
  onClear,
  onTradeClick,
}: {
  selectedTicker: TickerDossier | null;
  tickerDossiers: TickerDossier[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTickerClick: (symbol: string) => void;
  onClear: () => void;
  onTradeClick: (tradeId: string) => void;
}) {
  if (!selectedTicker) {
    return <LensEmpty icon={<Target className="h-8 w-8" />} title="No ticker dossier yet" />;
  }

  const recentClosed = [...selectedTicker.closedTrades].sort(
    (a, b) =>
      new Date(b.exitDate ?? b.entryDate).getTime() - new Date(a.exitDate ?? a.entryDate).getTime()
  );

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tickerDossiers.map((ticker) => (
          <button
            key={ticker.symbol}
            type="button"
            onClick={() => onTickerClick(ticker.symbol)}
            className={`shrink-0 rounded-md border px-3 py-2 text-left transition-colors ${
              ticker.symbol === selectedTicker.symbol
                ? 'border-primary bg-primary/10 text-primary'
                : 'bg-card/50 hover:bg-muted/50'
            }`}
          >
            <span className="block text-sm font-semibold">{ticker.symbol}</span>
            <span className={`block text-xs tabular-nums ${getPnLColorClass(ticker.totalPnL)}`}>
              {formatSignedCurrency(convertCurrency(ticker.totalPnL, currency, fxRate), currency)}
            </span>
          </button>
        ))}
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div className="rounded-md border bg-card/70 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Ticker Dossier
              </p>
              <div className="mt-1 flex items-center gap-2">
                <h2 className="text-3xl font-bold">{selectedTicker.symbol}</h2>
                <Button variant="ghost" size="sm" className="h-8 px-2 text-xs" onClick={onClear}>
                  Clear
                </Button>
              </div>
              <p className="mt-1 max-w-md truncate text-sm text-muted-foreground">
                {selectedTicker.name}
              </p>
            </div>
            <p
              className={`text-2xl font-bold tabular-nums ${getPnLColorClass(selectedTicker.totalPnL)}`}
            >
              {formatSignedCurrency(
                convertCurrency(selectedTicker.totalPnL, currency, fxRate),
                currency
              )}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 divide-x divide-y divide-border rounded-md border bg-background/40 sm:grid-cols-4 sm:divide-y-0">
            <MiniMetric label="Trades" value={String(selectedTicker.trades.length)} />
            <MiniMetric label="Win rate" value={`${formatNumber(selectedTicker.winRate, 0)}%`} />
            <MiniMetric
              label="Avg hold"
              value={selectedTicker.avgHoldDays ? `${selectedTicker.avgHoldDays}d` : '-'}
            />
            <MiniMetric
              label="Avg size"
              value={formatCurrency(
                convertCurrency(selectedTicker.avgPositionSizeUsd, currency, fxRate),
                currency,
                true
              )}
            />
          </div>

          <TagList tags={selectedTicker.topTags} className="mt-4" />
        </div>

        <div className="rounded-md border bg-card/70 p-4 sm:p-5">
          <p className="mb-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Extremes
          </p>
          <div className="divide-y divide-border">
            <TradeEdgeRow
              label="Largest win"
              trade={selectedTicker.largestWin}
              currency={currency}
              fxRate={fxRate}
              onTradeClick={onTradeClick}
            />
            <TradeEdgeRow
              label="Largest loss"
              trade={selectedTicker.largestLoss}
              currency={currency}
              fxRate={fxRate}
              onTradeClick={onTradeClick}
            />
            <InsightRow
              label="Open exposure"
              value={`${selectedTicker.openCount} open`}
              detail={`${selectedTicker.closedTrades.length} closed`}
              tone={selectedTicker.openCount > 0 ? 'info' : 'muted'}
            />
          </div>
        </div>
      </section>

      {recentClosed.length > 0 && (
        <section className="rounded-md border bg-card/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent closed trades</h3>
            <span className="text-xs text-muted-foreground">{recentClosed.length} total</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {recentClosed.slice(0, 6).map((trade) => (
              <TradeMiniButton
                key={trade.id}
                trade={trade}
                currency={currency}
                fxRate={fxRate}
                onClick={() => onTradeClick(trade.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MonthlyPostmortemLens({
  monthlyReviews,
  openTrades,
  currency,
  fxRate,
  onTradeClick,
}: {
  monthlyReviews: MonthlyReview[];
  openTrades: Trade[];
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTradeClick: (tradeId: string) => void;
}) {
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);

  if (monthlyReviews.length === 0) {
    return <LensEmpty icon={<CalendarDays className="h-8 w-8" />} title="No closed months yet" />;
  }

  const selectedMonth =
    monthlyReviews.find((month) => month.key === selectedMonthKey) ?? monthlyReviews[0];
  const winningTags = topTagsForTrades(
    selectedMonth.trades.filter((trade) => (trade.realizedPnL ?? 0) > 0)
  );
  const losingTrades = selectedMonth.trades
    .filter((trade) => (trade.realizedPnL ?? 0) < 0)
    .sort((a, b) => (a.realizedPnL ?? 0) - (b.realizedPnL ?? 0));

  return (
    <div className="space-y-5">
      <section className="rounded-md border bg-card/70 p-4 sm:p-5">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monthly Postmortem
            </p>
            <h2 className="mt-1 text-2xl font-bold">{selectedMonth.label}</h2>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {monthlyReviews.map((month) => (
              <button
                key={month.key}
                type="button"
                onClick={() => setSelectedMonthKey(month.key)}
                className={`shrink-0 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                  month.key === selectedMonth.key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'bg-background/40 hover:bg-muted/50'
                }`}
              >
                <span className="block font-medium">{month.label}</span>
                <span className={`block text-xs tabular-nums ${getPnLColorClass(month.totalPnL)}`}>
                  {formatSignedCurrency(
                    convertCurrency(month.totalPnL, currency, fxRate),
                    currency
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-y divide-border rounded-md border bg-background/40 sm:grid-cols-4 sm:divide-y-0">
          <MiniMetric
            label="P&L"
            value={formatSignedCurrency(
              convertCurrency(selectedMonth.totalPnL, currency, fxRate),
              currency
            )}
            valueClass={getPnLColorClass(selectedMonth.totalPnL)}
          />
          <MiniMetric label="Trades" value={String(selectedMonth.count)} />
          <MiniMetric label="Win rate" value={`${formatNumber(selectedMonth.winRate, 0)}%`} />
          <MiniMetric
            label="Win / Loss"
            value={`${selectedMonth.wins} / ${selectedMonth.losses}`}
          />
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
        <section className="rounded-md border bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Repeatable edge</h3>
          <TagList tags={winningTags.length > 0 ? winningTags : selectedMonth.topTags} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <TradeMiniButton
              trade={selectedMonth.largestWin}
              currency={currency}
              fxRate={fxRate}
              onClick={() => selectedMonth.largestWin && onTradeClick(selectedMonth.largestWin.id)}
              emptyLabel="No winning trade"
            />
            <TradeMiniButton
              trade={selectedMonth.largestLoss}
              currency={currency}
              fxRate={fxRate}
              onClick={() =>
                selectedMonth.largestLoss && onTradeClick(selectedMonth.largestLoss.id)
              }
              emptyLabel="No losing trade"
            />
          </div>
        </section>

        <section className="rounded-md border bg-card/70 p-4 sm:p-5">
          <h3 className="mb-3 text-sm font-semibold">Loss review</h3>
          {losingTrades.length > 0 ? (
            <div className="divide-y divide-border">
              {losingTrades.slice(0, 3).map((trade) => (
                <TradeEdgeRow
                  key={trade.id}
                  label={trade.asset.symbol}
                  trade={trade}
                  currency={currency}
                  fxRate={fxRate}
                  onTradeClick={onTradeClick}
                />
              ))}
            </div>
          ) : (
            <p className="rounded-md bg-muted/40 px-3 py-6 text-center text-sm text-muted-foreground">
              No losses in this month.
            </p>
          )}
        </section>
      </div>

      {openTrades.length > 0 && (
        <section className="rounded-md border bg-card/70 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Open trades watchlist</h3>
            <span className="text-xs text-muted-foreground">{openTrades.length} open</span>
          </div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {openTrades.slice(0, 6).map((trade) => (
              <TradeMiniButton
                key={trade.id}
                trade={trade}
                currency={currency}
                fxRate={fxRate}
                onClick={() => onTradeClick(trade.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniMetric({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="min-w-0 px-3 py-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-semibold tabular-nums ${valueClass ?? ''}`}>
        {value}
      </p>
    </div>
  );
}

function InsightRow({
  label,
  value,
  detail,
  tone = 'muted',
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  tone?: 'profit' | 'loss' | 'info' | 'muted';
  onClick?: () => void;
}) {
  const toneClass =
    tone === 'profit'
      ? 'text-profit'
      : tone === 'loss'
        ? 'text-loss'
        : tone === 'info'
          ? 'text-info'
          : 'text-foreground';
  const content = (
    <>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`truncate text-sm font-semibold ${toneClass}`}>{value}</p>
      </div>
      <p className="shrink-0 text-right text-xs text-muted-foreground">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-muted/50"
      >
        {content}
      </button>
    );
  }

  return (
    <div className="flex w-full items-center justify-between gap-3 py-3 text-left">{content}</div>
  );
}

function TradeEdgeRow({
  label,
  trade,
  currency,
  fxRate,
  onTradeClick,
}: {
  label: string;
  trade: Trade | null;
  currency: 'USD' | 'SGD';
  fxRate: number;
  onTradeClick: (tradeId: string) => void;
}) {
  if (!trade) {
    return <InsightRow label={label} value="-" detail="No trade" />;
  }

  return (
    <button
      type="button"
      className="flex w-full items-center justify-between gap-3 rounded-md py-3 text-left transition-colors hover:bg-muted/50 sm:px-2"
      onClick={() => onTradeClick(trade.id)}
    >
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{trade.asset.symbol}</p>
        <p className="truncate text-xs text-muted-foreground">
          {trade.notes || formatDate(trade.exitDate)}
        </p>
      </div>
      <p
        className={`shrink-0 text-right text-sm font-semibold tabular-nums ${getPnLColorClass(trade.realizedPnL)}`}
      >
        {formatSignedCurrency(convertCurrency(trade.realizedPnL ?? 0, currency, fxRate), currency)}
      </p>
    </button>
  );
}

function TradeMiniButton({
  trade,
  currency,
  fxRate,
  onClick,
  emptyLabel = 'No trade',
}: {
  trade: Trade | null;
  currency: 'USD' | 'SGD';
  fxRate: number;
  onClick: () => void;
  emptyLabel?: string;
}) {
  if (!trade) {
    return (
      <div className="rounded-md border border-dashed bg-background/30 p-3 text-sm text-muted-foreground">
        {emptyLabel}
      </div>
    );
  }

  return (
    <button
      type="button"
      className="rounded-md border bg-background/40 p-3 text-left transition-colors hover:bg-muted/50"
      onClick={onClick}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-sm font-semibold">{trade.asset.symbol}</span>
        <span
          className={`shrink-0 text-sm font-semibold tabular-nums ${getPnLColorClass(trade.realizedPnL)}`}
        >
          {trade.realizedPnL !== null
            ? formatSignedCurrency(convertCurrency(trade.realizedPnL, currency, fxRate), currency)
            : 'Open'}
        </span>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">
        {trade.direction} · {formatDate(trade.exitDate ?? trade.entryDate)}
      </p>
    </button>
  );
}

function TagList({
  tags,
  className = '',
}: {
  tags: Array<{ label: string; count: number }>;
  className?: string;
}) {
  if (tags.length === 0) {
    return <p className={`text-sm text-muted-foreground ${className}`}>No tags yet.</p>;
  }

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {tags.map((tag) => (
        <span
          key={tag.label}
          className="rounded-full border bg-background/40 px-2.5 py-1 text-xs text-muted-foreground"
        >
          {tag.label} · {tag.count}
        </span>
      ))}
    </div>
  );
}

function LensEmpty({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="rounded-md border border-dashed bg-card/40 py-12 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
    </div>
  );
}

// Format a single trade for clipboard (same format as bulk export)
function formatTradeForClipboard(trade: Trade) {
  return {
    asset: {
      coingeckoId: trade.asset.coingeckoId,
      symbol: trade.asset.symbol,
      name: trade.asset.name,
      category: trade.asset.category,
    },
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    status: trade.status,
    notes: trade.notes,
    tags: trade.tags,
  };
}

async function copyTradeToClipboard(trade: Trade): Promise<boolean> {
  try {
    const formatted = formatTradeForClipboard(trade);
    await navigator.clipboard.writeText(JSON.stringify(formatted, null, 2));
    return true;
  } catch {
    return false;
  }
}

const TRADE_COLUMNS: Record<string, ColumnConfig<Trade>> = {
  asset: { accessor: (t) => t.asset.symbol, type: 'string' },
  direction: { accessor: (t) => t.direction, type: 'string' },
  entryPrice: { accessor: (t) => t.entryPrice, type: 'number' },
  entryDate: { accessor: (t) => t.entryDate, type: 'date' },
  exitPrice: { accessor: (t) => t.exitPrice, type: 'number' },
  exitDate: { accessor: (t) => t.exitDate, type: 'date' },
  size: { accessor: (t) => t.positionSizeUsd, type: 'number' },
  pnl: { accessor: (t) => t.realizedPnL, type: 'number' },
  status: { accessor: (t) => t.status, type: 'string' },
};

interface TradeTableProps {
  trades: Trade[];
  isLoading: boolean;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  highlightTradeId?: string | null;
  onHighlightComplete?: () => void;
}

function TradeTable({
  trades,
  isLoading,
  onEdit,
  onDelete,
  highlightTradeId,
  onHighlightComplete,
}: TradeTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const { sortedItems, sortKey, sortDirection, onSort } = useTableSort(trades, TRADE_COLUMNS);

  // Scroll to and flash-highlight the target trade row
  useEffect(() => {
    if (!highlightTradeId) return;
    const hasTrade = trades.some((t) => t.id === highlightTradeId);
    if (!hasTrade) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const frame = requestAnimationFrame(() => {
      setFlashId(highlightTradeId);
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      timer = setTimeout(() => {
        setFlashId(null);
        onHighlightComplete?.();
      }, 2000);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [highlightTradeId, trades, onHighlightComplete]);

  // Dynamic column hiding: compact hides on mobile, expanded shows all
  const HIDDEN_MD = showAllColumns ? '' : 'hidden md:table-cell';
  const HIDDEN_SM = showAllColumns ? '' : 'hidden sm:table-cell';
  const HIDDEN_LG = showAllColumns ? '' : 'hidden lg:table-cell';

  const handleCopy = async (trade: Trade) => {
    const success = await copyTradeToClipboard(trade);
    if (success) {
      setCopiedId(trade.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="p-4 space-y-3">
          <div className="flex gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="py-16 text-center">
        <TrendingUp className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-1">No trades logged</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Start logging your trades to track performance, win rate, and P&L analytics.
        </p>
      </div>
    );
  }

  const tableClass = showAllColumns ? 'text-sm w-full min-w-[800px]' : 'text-sm';

  return (
    <>
      <div className="flex justify-end md:hidden mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs text-muted-foreground touch-manipulation"
          onClick={() => setShowAllColumns(!showAllColumns)}
        >
          {showAllColumns ? (
            <>
              <Columns2 className="h-3.5 w-3.5 mr-1" /> Compact
            </>
          ) : (
            <>
              <Columns3 className="h-3.5 w-3.5 mr-1" /> All columns
            </>
          )}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-x-auto">
            <Table className={tableClass}>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    label="Asset"
                    sortKey="asset"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Side"
                    sortKey="direction"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Entry Date"
                    sortKey="entryDate"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Exit Date"
                    sortKey="exitDate"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Entry"
                    sortKey="entryPrice"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Exit"
                    sortKey="exitPrice"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Size"
                    sortKey="size"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_SM}
                  />
                  <SortableHeader
                    label="P&L"
                    sortKey="pnl"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <TableHead className={HIDDEN_LG}>Notes</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((trade) => (
                  <TableRow
                    key={trade.id}
                    ref={trade.id === flashId ? highlightRef : undefined}
                    className={trade.id === flashId ? 'animate-highlight-flash' : ''}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {trade.asset.symbol}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`flex items-center gap-1 whitespace-nowrap ${trade.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}
                      >
                        {trade.direction === 'LONG' ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {trade.direction}
                      </span>
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} whitespace-nowrap`}>
                      {formatDate(trade.entryDate)}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} whitespace-nowrap`}>
                      {trade.exitDate ? (
                        formatDate(trade.exitDate)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} text-right font-mono whitespace-nowrap`}>
                      {formatPrice(trade.entryPrice)}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} text-right font-mono whitespace-nowrap`}>
                      {trade.exitPrice ? (
                        formatPrice(trade.exitPrice)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className={`${HIDDEN_SM} text-right font-mono whitespace-nowrap`}>
                      {formatCurrency(trade.positionSizeUsd, 'USD', 0)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {trade.realizedPnL !== null ? (
                        <div className={getPnLColorClass(trade.realizedPnL)}>
                          <p className="font-mono">{formatCurrency(trade.realizedPnL, 'USD', 0)}</p>
                          <p className="text-xs">{formatPercent(trade.realizedPnLPct)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          trade.status === 'OPEN'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {trade.status}
                      </span>
                    </TableCell>
                    <TableCell className={`${HIDDEN_LG} max-w-[140px] truncate`}>
                      {trade.notes || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 touch-manipulation"
                          onClick={() => handleCopy(trade)}
                          title="Copy trade"
                          aria-label="Copy trade"
                        >
                          {copiedId === trade.id ? (
                            <Check className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 touch-manipulation"
                          onClick={() => onEdit(trade)}
                          title="Edit trade"
                          aria-label="Edit trade"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive touch-manipulation"
                          onClick={() => onDelete(trade)}
                          title="Delete trade"
                          aria-label="Delete trade"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
