import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatNumber, getPnLColorClass } from '@/lib/utils';
import type { TradeAnalytics } from '@/lib/api';

interface TradeStatsCardProps {
  analytics: TradeAnalytics;
  currency?: 'USD' | 'SGD';
  fxRate?: number;
}

export function TradeStatsCard({ analytics, currency = 'USD', fxRate = 1 }: TradeStatsCardProps) {
  // Helper to convert values based on currency
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trade Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Stats */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-bold">{analytics.totalTrades}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Win Rate</p>
            <p className="text-2xl font-bold">
              {formatNumber(analytics.winRate)}%
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Profit Factor</p>
            <p className="text-2xl font-bold">
              {analytics.profitFactor === Infinity ? 'N/A' : formatNumber(analytics.profitFactor)}
            </p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Total P&L</p>
            <p className={`text-2xl font-bold ${getPnLColorClass(analytics.totalPnL)}`}>
              {formatCurrency(convert(analytics.totalPnL), currency)}
            </p>
          </div>
        </div>

        {/* Breakdown */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Breakdown</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1">
              <p className="text-muted-foreground">Long Trades</p>
              <p>Count: {analytics.breakdown.long.count}</p>
              <p>Win Rate: {formatNumber(analytics.breakdown.long.winRate)}%</p>
              <p className={getPnLColorClass(analytics.breakdown.long.pnl)}>
                P&L: {formatCurrency(convert(analytics.breakdown.long.pnl), currency)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-muted-foreground">Short Trades</p>
              <p>Count: {analytics.breakdown.short.count}</p>
              <p>Win Rate: {formatNumber(analytics.breakdown.short.winRate)}%</p>
              <p className={getPnLColorClass(analytics.breakdown.short.pnl)}>
                P&L: {formatCurrency(convert(analytics.breakdown.short.pnl), currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Averages */}
        <div className="grid grid-cols-3 gap-4 text-sm border-t pt-4">
          <div>
            <p className="text-muted-foreground">Avg P&L</p>
            <p className={`font-medium ${getPnLColorClass(analytics.avgPnL)}`}>
              {formatCurrency(convert(analytics.avgPnL), currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Win</p>
            <p className="font-medium text-profit">
              {formatCurrency(convert(analytics.avgWin), currency)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Avg Loss</p>
            <p className="font-medium text-loss">
              -{formatCurrency(convert(analytics.avgLoss), currency)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
