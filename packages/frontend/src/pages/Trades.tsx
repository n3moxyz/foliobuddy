import { useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  useTrades,
  useTradeAnalytics,
  useDeleteAllTrades,
  useDeleteTrade,
} from '@/hooks/useTrades';
import { toast } from 'sonner';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { TradeTapeSection } from '@/components/trades/TradeTapeSection';
import { copyTradesToClipboard } from '@/components/trades/tradeClipboard';
import { PageActionHeader } from '@/components/layout/PageActionHeader';
import {
  buildMonthlyReviews,
  buildTickerDossiers,
  type TradeLens,
} from '@/components/trades/tradeLensModels';
import {
  Plus,
  Download,
  Copy,
  Check,
  Trash2,
  MoreVertical,
  CalendarDays,
  FileText,
  Target,
} from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/hooks/usePageTitle';
import type { Trade } from '@/lib/types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function Trades() {
  usePageTitle('Trade Journal');
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
  const { filteredTrades, openTrades, closedTrades, visibleTrades } = useMemo(() => {
    const filtered = tickerFilter
      ? allTrades.filter((trade) => trade.asset.symbol === tickerFilter)
      : allTrades;
    const open = filtered.filter((trade) => trade.status === 'OPEN');
    const closed = filtered.filter((trade) => trade.status === 'CLOSED');
    const visible = filter === 'OPEN' ? open : filter === 'CLOSED' ? closed : filtered;
    return {
      filteredTrades: filtered,
      openTrades: open,
      closedTrades: closed,
      visibleTrades: visible,
    };
  }, [allTrades, tickerFilter, filter]);

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

  const allOpenTrades = useMemo(() => allTrades.filter((t) => t.status === 'OPEN'), [allTrades]);

  return (
    <div className="space-y-6">
      <Tabs value={activeLens} onValueChange={(value) => setLens(value as TradeLens)}>
        <PageActionHeader
          title="Trade Journal"
          subtitle={
            analytics
              ? `${analytics.totalTrades} trades · ${analytics.winRate?.toFixed(0) ?? 0}% win rate`
              : undefined
          }
          actions={
            <>
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
                    } else {
                      toast.error('Copy failed', { description: 'Clipboard access was denied.' });
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
                    className="sm:hidden min-h-11"
                    onClick={async () => {
                      if (trades && trades.length > 0) {
                        const success = await copyTradesToClipboard(trades);
                        if (success) {
                          setCopiedAll(true);
                          setTimeout(() => setCopiedAll(false), 2000);
                        } else {
                          toast.error('Copy failed', {
                            description: 'Clipboard access was denied.',
                          });
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
            </>
          }
        >
          <div className="flex items-center gap-3 overflow-x-auto pb-1">
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
        </PageActionHeader>

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
            openTrades={allOpenTrades}
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
            <DialogDescription className="sr-only">
              Record a trade manually or import trades from JSON.
            </DialogDescription>
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
                {deleteAllMutation.isPending ? 'Deleting...' : 'Delete All Trades'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTrade} onOpenChange={(open) => !open && setEditingTrade(null)}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Trade</DialogTitle>
            <DialogDescription className="sr-only">
              Update the selected trade details.
            </DialogDescription>
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
