import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useTrades,
  useTradeAnalytics,
  useDeleteAllTrades,
  useDeleteTrade,
} from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import {
  formatCurrency,
  formatPrice,
  formatPercent,
  formatDate,
  formatNumber,
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
import { MonthlyPostmortemLens, TickerDossierLens } from '@/components/trades/TradeLensViews';
import {
  buildMonthlyReviews,
  buildTickerDossiers,
  type TradeLens,
} from '@/components/trades/tradeLensModels';
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

async function copyTradesToClipboard(trades: Trade[]): Promise<boolean> {
  try {
    const text = JSON.stringify(trades.map(formatTradeForClipboard), null, 2);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

async function copyTradeToClipboard(trade: Trade): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(formatTradeForClipboard(trade), null, 2));
    return true;
  } catch {
    return false;
  }
}

const TRADE_TABLE_HEADER_SKELETON_KEYS = ['asset', 'side', 'entry', 'exit', 'pnl'] as const;
const TRADE_TABLE_ROW_SKELETON_KEYS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

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

  const fxRate =
    summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0
      ? summary.totalValueSgd / summary.totalValueUsd
      : USD_SGD_FALLBACK_RATE;

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
              <Check className="h-4 w-4 mr-1 text-profit" />
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
                className="min-h-11 rounded-full text-xs gap-1 sm:h-8 sm:min-h-8"
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

function formatTradeTags(tags: string | null): string | null {
  if (!tags) return null;
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.join(', ');
    }
  } catch {
    // Older demo/import data may store tags as a plain comma-separated string.
  }
  return tags;
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
  const [viewTrade, setViewTrade] = useState<Trade | null>(null);
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

  const handleView = useCallback((trade: Trade) => {
    setViewTrade(trade);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="p-4 space-y-3">
          <div className="flex gap-4">
            {TRADE_TABLE_HEADER_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-4 w-20" />
            ))}
          </div>
          {TRADE_TABLE_ROW_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
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
  const viewTradeTags = viewTrade ? formatTradeTags(viewTrade.tags) : null;

  return (
    <>
      <div className="flex justify-end md:hidden mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-xs text-muted-foreground touch-manipulation"
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
                    className={`cursor-pointer hover:bg-muted/50 ${
                      trade.id === flashId ? 'animate-highlight-flash' : ''
                    }`}
                    onClick={() => handleView(trade)}
                    tabIndex={0}
                    aria-label={`View ${trade.asset.symbol} ${trade.direction} trade`}
                    onKeyDown={(e) => {
                      if (e.currentTarget === e.target && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleView(trade);
                      }
                    }}
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
                            ? 'bg-info/10 text-info'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {trade.status}
                      </span>
                    </TableCell>
                    <TableCell className={`${HIDDEN_LG} max-w-[140px] truncate`}>
                      {trade.notes || '-'}
                    </TableCell>
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
                          onClick={() => handleCopy(trade)}
                          title="Copy trade"
                          aria-label="Copy trade"
                        >
                          {copiedId === trade.id ? (
                            <Check className="h-3.5 w-3.5 text-profit" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
                          onClick={() => onEdit(trade)}
                          title="Edit trade"
                          aria-label="Edit trade"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 text-destructive touch-manipulation hover:text-destructive md:mx-0 md:h-8 md:w-8"
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

      <Dialog open={!!viewTrade} onOpenChange={(open) => !open && setViewTrade(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{viewTrade?.asset.symbol}</span>
              <span className="text-muted-foreground font-normal">Trade Details</span>
            </DialogTitle>
            <DialogDescription>{viewTrade?.asset.name}</DialogDescription>
          </DialogHeader>
          {viewTrade && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                    viewTrade.direction === 'LONG'
                      ? 'bg-profit/10 text-profit'
                      : 'bg-loss/10 text-loss'
                  }`}
                >
                  {viewTrade.direction === 'LONG' ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {viewTrade.direction}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs ${
                    viewTrade.status === 'OPEN'
                      ? 'bg-info/10 text-info'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {viewTrade.status}
                </span>
                {viewTradeTags && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {viewTradeTags}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-mono font-medium">{formatNumber(viewTrade.quantity, 4)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Position Size</p>
                  <p className="font-mono font-medium">
                    {formatCurrency(viewTrade.positionSizeUsd, 'USD', 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Entry Price</p>
                  <p className="font-mono">{formatPrice(viewTrade.entryPrice)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Exit Price</p>
                  <p className="font-mono">
                    {viewTrade.exitPrice !== null ? (
                      formatPrice(viewTrade.exitPrice)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Entry Date</p>
                  <p className="text-sm">{formatDate(viewTrade.entryDate)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Exit Date</p>
                  <p className="text-sm">
                    {viewTrade.exitDate ? (
                      formatDate(viewTrade.exitDate)
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-1">Realized P&L</p>
                {viewTrade.realizedPnL !== null ? (
                  <p className={`font-mono font-medium ${getPnLColorClass(viewTrade.realizedPnL)}`}>
                    {formatCurrency(viewTrade.realizedPnL, 'USD', 0)}
                    <span className="text-xs ml-1">
                      ({formatPercent(viewTrade.realizedPnLPct)})
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Open trade</p>
                )}
              </div>

              {viewTrade.notes && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                    {viewTrade.notes}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => handleCopy(viewTrade)}>
                  {copiedId === viewTrade.id ? (
                    <Check className="h-3.5 w-3.5 mr-1 text-profit" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 mr-1" />
                  )}
                  {copiedId === viewTrade.id ? 'Copied!' : 'Copy'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewTrade(null);
                    onEdit(viewTrade);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setViewTrade(null);
                    onDelete(viewTrade);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
