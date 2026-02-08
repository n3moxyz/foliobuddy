import { useState } from 'react';
import { useTrades, useTradeAnalytics, useDeleteAllTrades, useDeleteTrade } from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { usePortfolioSummary } from '@/hooks/usePortfolio';
import { formatCurrency, formatPercent, formatDate, getPnLColorClass } from '@/lib/utils';
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
import { Plus, TrendingUp, TrendingDown, Download, Copy, Check, Trash2, MoreVertical, Pencil } from 'lucide-react';
import { api, Trade } from '@/lib/api';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { ColumnConfig } from '@/hooks/useTableSort';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Format trades for clipboard - includes asset info for recreating
function formatTradesForClipboard(trades: Trade[]) {
  const formatted = trades.map(t => ({
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

export default function Trades() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'OPEN' | 'CLOSED'>('all');
  const [copiedAll, setCopiedAll] = useState(false);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [deletingTrade, setDeletingTrade] = useState<Trade | null>(null);

  const { currency } = useCurrencyStore();
  const { data: summary } = usePortfolioSummary();
  const { data: trades, isLoading } = useTrades(
    filter === 'all' ? undefined : { status: filter }
  );
  const { data: analytics } = useTradeAnalytics();
  const deleteAllMutation = useDeleteAllTrades();
  const deleteTradeMutation = useDeleteTrade();

  // Calculate FX rate from summary
  const fxRate = summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0
    ? summary.totalValueSgd / summary.totalValueUsd
    : 1.35;

  const openTrades = trades?.filter((t) => t.status === 'OPEN') || [];
  const closedTrades = trades?.filter((t) => t.status === 'CLOSED') || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Trade Journal</h1>
          <p className="text-muted-foreground">
            Track and analyze your trading performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
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
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteAllConfirm(true)}
            disabled={!trades || trades.length === 0}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete All
          </Button>
          <Button size="sm" onClick={() => setShowAddForm(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Log Trade
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => window.open(api.exportTradesCsv(), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export All Trades
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportTradesCsv({ status: 'OPEN' }), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export Open Trades
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(api.exportTradesCsv({ status: 'CLOSED' }), '_blank')}>
                <Download className="h-4 w-4 mr-2" />
                Export Closed Trades
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Trade Statistics */}
      {analytics && (
        <TradeStatsCard analytics={analytics} currency={currency} fxRate={fxRate} />
      )}

      {/* Trade Tables */}
      <Tabs defaultValue="all" onValueChange={(v) => setFilter(v as any)}>
        <TabsList>
          <TabsTrigger value="all">All Trades ({trades?.length || 0})</TabsTrigger>
          <TabsTrigger value="OPEN">Open ({openTrades.length})</TabsTrigger>
          <TabsTrigger value="CLOSED">Closed ({closedTrades.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          <TradeTable
            trades={trades || []}
            isLoading={isLoading}
            onEdit={setEditingTrade}
            onDelete={setDeletingTrade}
          />
        </TabsContent>

        <TabsContent value="OPEN" className="mt-4">
          <TradeTable
            trades={openTrades}
            isLoading={isLoading}
            onEdit={setEditingTrade}
            onDelete={setDeletingTrade}
          />
        </TabsContent>

        <TabsContent value="CLOSED" className="mt-4">
          <TradeTable
            trades={closedTrades}
            isLoading={isLoading}
            onEdit={setEditingTrade}
            onDelete={setDeletingTrade}
          />
        </TabsContent>
      </Tabs>

      {/* Add Trade Dialog */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log New Trade</DialogTitle>
          </DialogHeader>
          <TradeForm onSuccess={() => setShowAddForm(false)} />
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={showDeleteAllConfirm} onOpenChange={setShowDeleteAllConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete All Trades</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to delete all <span className="font-semibold text-foreground">{trades?.length || 0}</span> trades?
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

      {/* Edit Trade Dialog */}
      <Dialog open={!!editingTrade} onOpenChange={(open) => !open && setEditingTrade(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Trade</DialogTitle>
          </DialogHeader>
          {editingTrade && (
            <TradeForm
              trade={editingTrade}
              onSuccess={() => setEditingTrade(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Trade Confirmation Dialog */}
      <Dialog open={!!deletingTrade} onOpenChange={(open) => !open && setDeletingTrade(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Trade</DialogTitle>
            <DialogDescription>
              This action cannot be undone.
            </DialogDescription>
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
  entryDate: { accessor: (t) => t.entryDate, type: 'date' },
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
}

function TradeTable({ trades, isLoading, onEdit, onDelete }: TradeTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { sortedItems, sortKey, sortDirection, onSort } = useTableSort(trades, TRADE_COLUMNS);

  const handleCopy = async (trade: Trade) => {
    const success = await copyTradeToClipboard(trade);
    if (success) {
      setCopiedId(trade.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="animate-pulse text-muted-foreground">Loading trades...</div>
        </CardContent>
      </Card>
    );
  }

  if (trades.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-12">
          <p className="text-muted-foreground">No trades yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHeader label="Asset" sortKey="asset" activeSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
                <SortableHeader label="Direction" sortKey="direction" activeSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <SortableHeader label="Size" sortKey="size" activeSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} align="right" />
                <SortableHeader label="P&L" sortKey="pnl" activeSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} align="right" />
                <SortableHeader label="Status" sortKey="status" activeSortKey={sortKey} sortDirection={sortDirection} onSort={onSort} />
                <TableHead>Notes</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedItems.map((trade) => (
                <TableRow key={trade.id}>
                  <TableCell className="font-medium">{trade.asset.symbol}</TableCell>
                  <TableCell>
                    <span className={`flex items-center gap-1 ${trade.direction === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>
                      {trade.direction === 'LONG' ? (
                        <TrendingUp className="h-4 w-4" />
                      ) : (
                        <TrendingDown className="h-4 w-4" />
                      )}
                      {trade.direction}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-mono">{formatCurrency(trade.entryPrice, 'USD')}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(trade.entryDate)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    {trade.exitPrice ? (
                      <div>
                        <p className="font-mono">{formatCurrency(trade.exitPrice, 'USD')}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(trade.exitDate)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(trade.positionSizeUsd, 'USD')}
                  </TableCell>
                  <TableCell className="text-right">
                    {trade.realizedPnL !== null ? (
                      <div className={getPnLColorClass(trade.realizedPnL)}>
                        <p className="font-mono">
                          {formatCurrency(trade.realizedPnL, 'USD')}
                        </p>
                        <p className="text-xs">
                          {formatPercent(trade.realizedPnLPct)}
                        </p>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      trade.status === 'OPEN'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400'
                    }`}>
                      {trade.status}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[150px] truncate">
                    {trade.notes || '-'}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleCopy(trade)}
                        title="Copy trade"
                      >
                        {copiedId === trade.id ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onEdit(trade)}
                        title="Edit trade"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => onDelete(trade)}
                        title="Delete trade"
                      >
                        <Trash2 className="h-4 w-4" />
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
  );
}
