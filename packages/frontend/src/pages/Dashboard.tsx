import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { usePortfolioSummary, usePositions, useTopPerformers, useWorstPerformers, useInvestors } from '@/hooks/usePortfolio';
import { useTradeAnalytics } from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass, formatDateTime } from '@/lib/utils';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { NetWorthCard } from '@/components/dashboard/NetWorthCard';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { PerformersCard } from '@/components/dashboard/PerformersCard';
import { PortfolioChart } from '@/components/dashboard/PortfolioChart';
import { BenchmarkComparisonChart } from '@/components/dashboard/BenchmarkComparisonChart';
import { ChevronDown, Users } from 'lucide-react';
import { DbStatusBanner } from '@/components/dashboard/DbStatusBanner';

export default function Dashboard() {
  const { currency } = useCurrencyStore();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: tradeAnalytics } = useTradeAnalytics();
  const { data: topPerformers } = useTopPerformers(5);
  const { data: worstPerformers } = useWorstPerformers(5);
  const { data: investors } = useInvestors();

  // Investor filter state - lifted to Dashboard level
  const [selectedInvestors, setSelectedInvestors] = useState<string[]>([]);

  // Calculate FX rate from summary
  const fxRate = useMemo(() => {
    if (summary && summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return 1.35; // Default fallback rate
  }, [summary]);

  // Calculate stake multiplier based on selected investors
  const stakeMultiplier = useMemo(() => {
    if (selectedInvestors.length === 0 || !investors) return 1;
    const totalStake = investors
      .filter(inv => selectedInvestors.includes(inv.id))
      .reduce((sum, inv) => sum + inv.stakePercentage, 0);
    return totalStake / 100;
  }, [selectedInvestors, investors]);

  // Helper to convert values based on currency and apply stake multiplier
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    const converted = currency === 'SGD' ? usdValue * fxRate : usdValue;
    return converted * stakeMultiplier;
  };

  const handleInvestorToggle = (investorId: string) => {
    setSelectedInvestors((prev) =>
      prev.includes(investorId)
        ? prev.filter((id) => id !== investorId)
        : [...prev, investorId]
    );
  };

  const handleSelectAll = () => {
    if (!investors) return;
    if (selectedInvestors.length === investors.length) {
      setSelectedInvestors([]);
    } else {
      setSelectedInvestors(investors.map((inv) => inv.id));
    }
  };

  const getInvestorLabel = () => {
    if (!investors || investors.length === 0) return 'No investors';
    if (selectedInvestors.length === 0) return 'All investors';
    if (selectedInvestors.length === investors.length) return 'All investors';
    if (selectedInvestors.length === 1) {
      const inv = investors.find((i) => i.id === selectedInvestors[0]);
      return inv?.name || 'Selected';
    }
    return `${selectedInvestors.length} investors`;
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Dashboard</h1>
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground sm:text-base">
              Overview of your portfolio performance
            </p>
            <DbStatusBanner />
          </div>
        </div>

        {/* Investor Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9">
              <Users className="h-4 w-4 mr-2" />
              {getInvestorLabel()}
              <ChevronDown className="h-3 w-3 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56">
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b">
                <span className="text-sm font-medium">Filter by Investor</span>
                {investors && investors.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs"
                    onClick={handleSelectAll}
                  >
                    {selectedInvestors.length === investors.length ? 'Clear' : 'All'}
                  </Button>
                )}
              </div>
              {investors && investors.length > 0 ? (
                <div className="space-y-2">
                  {investors.map((investor) => (
                    <div key={investor.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`dash-${investor.id}`}
                        checked={selectedInvestors.includes(investor.id)}
                        onCheckedChange={() => handleInvestorToggle(investor.id)}
                      />
                      <Label
                        htmlFor={`dash-${investor.id}`}
                        className="text-sm cursor-pointer flex-1 flex items-center justify-between"
                      >
                        <span>{investor.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {investor.stakePercentage}%
                        </span>
                      </Label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-2 text-sm text-muted-foreground text-center">
                  All (no investors added)
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Net Worth Card */}
      {summary && <NetWorthCard summary={summary} currency={currency} stakeMultiplier={stakeMultiplier} />}

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 sm:gap-4">
        <Card className="py-3">
          <CardHeader className="py-0">
            <CardDescription>YTD Start</CardDescription>
            <CardTitle className="text-2xl">
              {formatCurrency(convert(summary?.totalCostBasis), currency, 0)}
            </CardTitle>
          </CardHeader>
        </Card>

        <Card className="py-3">
          <CardHeader className="py-0">
            <CardDescription>YTD P&L</CardDescription>
            <CardTitle className={`text-2xl ${getPnLColorClass(summary?.unrealizedPnL)}`}>
              {formatCurrency(convert(summary?.unrealizedPnL), currency, 0)}
              <span className={`text-sm font-normal ml-1.5 ${getPnLColorClass(summary?.unrealizedPnLPct)}`}>
                {formatPercent(summary?.unrealizedPnLPct)}
              </span>
            </CardTitle>
          </CardHeader>
        </Card>

        <Link to="/portfolio" className="block">
          <Card className="py-3 hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="py-0">
              <CardDescription>Live Positions</CardDescription>
              <CardTitle className="text-2xl">{summary?.positionCount ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>

        <Link to="/trades" className="block">
          <Card className="py-3 hover:bg-muted/50 transition-colors cursor-pointer">
            <CardHeader className="py-0">
              <CardDescription>Closed Trades</CardDescription>
              <CardTitle className="text-2xl">{tradeAnalytics?.totalTrades ?? 0}</CardTitle>
            </CardHeader>
          </Card>
        </Link>
      </div>

      {/* Portfolio Value Chart */}
      <PortfolioChart
        currency={currency}
        fxRate={fxRate}
        stakeMultiplier={stakeMultiplier}
        liveValueUsd={summary?.totalValueUsd}
      />

      {/* Benchmark Comparison Chart */}
      <BenchmarkComparisonChart />

      {/* Allocation Charts */}
      {positions && (
        <AllocationCharts
          positions={positions}
          isLoading={positionsLoading}
        />
      )}

      {/* Performers */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {topPerformers && (
          <PerformersCard
            title="Top Performers"
            performers={topPerformers}
            type="top"
            currency={currency}
            fxRate={fxRate}
            stakeMultiplier={stakeMultiplier}
          />
        )}
        {worstPerformers && (
          <PerformersCard
            title="Worst Performers"
            performers={worstPerformers}
            type="worst"
            currency={currency}
            fxRate={fxRate}
            stakeMultiplier={stakeMultiplier}
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
