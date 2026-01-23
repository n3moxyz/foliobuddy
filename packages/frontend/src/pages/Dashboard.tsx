import { useMemo } from 'react';
import { usePortfolioSummary, useAllocationByCategory, useTopPerformers, useWorstPerformers } from '@/hooks/usePortfolio';
import { useTradeAnalytics } from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass, formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NetWorthCard } from '@/components/dashboard/NetWorthCard';
import { AllocationChart } from '@/components/dashboard/AllocationChart';
import { PerformersCard } from '@/components/dashboard/PerformersCard';
import { TradeStatsCard } from '@/components/dashboard/TradeStatsCard';

export default function Dashboard() {
  const { currency } = useCurrencyStore();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: allocation, isLoading: allocationLoading } = useAllocationByCategory();
  const { data: topPerformers } = useTopPerformers(5);
  const { data: worstPerformers } = useWorstPerformers(5);
  const { data: analytics } = useTradeAnalytics();

  // Calculate FX rate from summary
  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return 1.35; // Default fallback rate
  }, [summary]);

  // Helper to convert values based on currency
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your portfolio performance
        </p>
      </div>

      {/* Net Worth Card */}
      {summary && <NetWorthCard summary={summary} currency={currency} />}

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Cost Basis</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(convert(summary?.totalCostBasis), currency)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unrealized P&L</CardDescription>
            <CardTitle className={`text-2xl ${getPnLColorClass(summary?.unrealizedPnL)}`}>
              {formatCurrency(convert(summary?.unrealizedPnL), currency)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-sm ${getPnLColorClass(summary?.unrealizedPnLPct)}`}>
              {formatPercent(summary?.unrealizedPnLPct)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Positions</CardDescription>
            <CardTitle className="text-2xl">{summary?.positionCount ?? 0}</CardTitle>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Win Rate</CardDescription>
            <CardTitle className="text-2xl">
              {analytics?.winRate ? `${analytics.winRate.toFixed(1)}%` : '-'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {analytics?.totalTrades ?? 0} trades
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Allocation Chart */}
        {allocation && (
          <AllocationChart
            data={allocation}
            title="Allocation by Category"
            isLoading={allocationLoading}
          />
        )}

        {/* Trade Stats */}
        {analytics && <TradeStatsCard analytics={analytics} currency={currency} fxRate={fxRate} />}
      </div>

      {/* Performers */}
      <div className="grid gap-6 md:grid-cols-2">
        {topPerformers && (
          <PerformersCard
            title="Top Performers"
            performers={topPerformers}
            type="top"
            currency={currency}
            fxRate={fxRate}
          />
        )}
        {worstPerformers && (
          <PerformersCard
            title="Worst Performers"
            performers={worstPerformers}
            type="worst"
            currency={currency}
            fxRate={fxRate}
          />
        )}
      </div>

      {/* Last Updated */}
      <div className="text-center text-sm text-muted-foreground">
        Last updated: {formatDateTime(summary?.lastUpdated)}
      </div>
    </div>
  );
}
