import { useState } from 'react';
import { useTrades, useTradeAnalytics } from '@/hooks/useTrades';
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TradeForm } from '@/components/trades/TradeForm';
import { TradeStatsCard } from '@/components/dashboard/TradeStatsCard';
import { Plus, TrendingUp, TrendingDown } from 'lucide-react';

export default function Trades() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [filter, setFilter] = useState<'all' | 'OPEN' | 'CLOSED'>('all');

  const { currency } = useCurrencyStore();
  const { data: summary } = usePortfolioSummary();
  const { data: trades, isLoading } = useTrades(
    filter === 'all' ? undefined : { status: filter }
  );
  const { data: analytics } = useTradeAnalytics();

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
        <Button onClick={() => setShowAddForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Log Trade
        </Button>
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
          <TradeTable trades={trades || []} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="OPEN" className="mt-4">
          <TradeTable trades={openTrades} isLoading={isLoading} />
        </TabsContent>

        <TabsContent value="CLOSED" className="mt-4">
          <TradeTable trades={closedTrades} isLoading={isLoading} />
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
    </div>
  );
}

function TradeTable({ trades, isLoading }: { trades: any[]; isLoading: boolean }) {
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
                <TableHead>Asset</TableHead>
                <TableHead>Direction</TableHead>
                <TableHead>Entry</TableHead>
                <TableHead>Exit</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">P&L</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => (
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
