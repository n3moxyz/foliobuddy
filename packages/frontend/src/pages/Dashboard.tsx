import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  usePortfolioSummary,
  usePositions,
  useTopPerformers,
  useWorstPerformers,
  useInvestors,
  usePerformanceHistory,
} from '@/hooks/usePortfolio';
import { useTradeAnalytics } from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { formatCurrency, formatPercent, getPnLColorClass, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { NetWorthCard } from '@/components/dashboard/NetWorthCard';
import { AllocationCharts } from '@/components/dashboard/AllocationCharts';
import { PerformersCard } from '@/components/dashboard/PerformersCard';
import { PortfolioChart } from '@/components/dashboard/PortfolioChart';
import { BenchmarkComparisonChart } from '@/components/dashboard/BenchmarkComparisonChart';
import { ChevronDown, Users } from 'lucide-react';
import { DbStatusBanner } from '@/components/dashboard/DbStatusBanner';

const PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';

export default function Dashboard() {
  const { currency } = useCurrencyStore();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: tradeAnalytics } = useTradeAnalytics();
  const { data: topPerformers } = useTopPerformers(5);
  const { data: worstPerformers } = useWorstPerformers(5);
  const { data: investors } = useInvestors();
  const { data: perfHistory30d } = usePerformanceHistory({ days: 30 });

  // Value from 30 days ago for period comparison
  const valueUsd30dAgo = useMemo(() => {
    if (!perfHistory30d || perfHistory30d.length === 0) return undefined;
    return perfHistory30d[0].totalValueUsd;
  }, [perfHistory30d]);

  // Investor filter state - lifted to Dashboard level
  const [selectedInvestors, setSelectedInvestors] = useState<string[]>([]);

  useEffect(() => {
    if (!investors || investors.length === 0) return;
    if (selectedInvestors.length > 0) return;

    const owner = investors.find((investor) => investor.isOwner);
    if (owner) {
      setSelectedInvestors([owner.id]);
    }
  }, [investors, selectedInvestors.length]);

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
      .filter((inv) => selectedInvestors.includes(inv.id))
      .reduce((sum, inv) => sum + inv.stakePercentage, 0);
    return totalStake / 100;
  }, [selectedInvestors, investors]);

  // Helper to convert values based on currency and apply stake multiplier
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    const converted = currency === 'SGD' ? usdValue * fxRate : usdValue;
    return converted * stakeMultiplier;
  };

  const perpExposure = useMemo(() => {
    const saved = localStorage.getItem(PERP_EXPOSURE_KEY);
    return saved ? parseFloat(saved) : 0;
  }, []);

  const exposurePct = useMemo(() => {
    if (!positions || !summary?.totalValueUsd || summary.totalValueUsd <= 0) return 0;
    const ownedCryptoTotal = positions
      .filter((position) => !position.custodyOf)
      .filter(
        (position) => position.asset.category !== 'STABLECOIN' && position.asset.category !== 'CASH'
      )
      .reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);

    return ((ownedCryptoTotal + perpExposure) / summary.totalValueUsd) * 100;
  }, [positions, summary?.totalValueUsd, perpExposure]);

  const handleInvestorToggle = (investorId: string) => {
    setSelectedInvestors((prev) =>
      prev.includes(investorId) ? prev.filter((id) => id !== investorId) : [...prev, investorId]
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
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
          <Skeleton className="h-9 w-full sm:w-32" />
        </div>

        {/* Net worth loading skeleton */}
        <div className="pb-6 mb-2 border-b">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-12 w-48 mb-2" />
          <div className="mt-4 flex gap-6">
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-20" />
          </div>
        </div>

        {/* Stats strip loading skeleton */}
        <div className="py-4 border-b flex items-baseline gap-6 flex-wrap">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <DbStatusBanner />
        </div>

        {/* Investor Filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 w-full justify-between sm:w-auto">
              <Users className="h-4 w-4 mr-2" />
              <span className="truncate">{getInvestorLabel()}</span>
              <ChevronDown className="h-3 w-3 ml-2" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[calc(100vw-2rem)] max-w-56">
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
      {summary && (
        <NetWorthCard
          summary={summary}
          currency={currency}
          stakeMultiplier={stakeMultiplier}
          valueUsd30dAgo={valueUsd30dAgo}
        />
      )}

      {/* Stats Strip */}
      <div className="py-4 border-b hidden sm:flex items-baseline gap-6 flex-wrap">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">YTD Start</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(convert(summary?.totalCostBasis), currency, 0)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">YTD P&L</p>
          <p
            className={`text-lg font-semibold tabular-nums ${getPnLColorClass(summary?.unrealizedPnL)}`}
          >
            {formatCurrency(convert(summary?.unrealizedPnL), currency, 0)}
            <span className={`text-xs ml-1.5 ${getPnLColorClass(summary?.unrealizedPnLPct)}`}>
              {formatPercent(summary?.unrealizedPnLPct)}
            </span>
          </p>
        </div>

        <Link to="/portfolio" className="hover:text-primary transition-colors cursor-pointer">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Exposure</p>
          <p className="text-lg font-semibold tabular-nums">{`${exposurePct.toFixed(1)}%`}</p>
        </Link>

        <Link to="/portfolio" className="hover:text-primary transition-colors cursor-pointer">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Live Positions</p>
          <p className="text-lg font-semibold tabular-nums">{summary?.positionCount ?? 0}</p>
        </Link>

        <Link to="/trades" className="hover:text-primary transition-colors cursor-pointer">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Closed Trades</p>
          <p className="text-lg font-semibold tabular-nums">{tradeAnalytics?.totalTrades ?? 0}</p>
        </Link>
      </div>

      {/* Mobile Stats Grid */}
      <div className="sm:hidden grid grid-cols-2 gap-4 py-4 border-b">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">YTD Start</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCurrency(convert(summary?.totalCostBasis), currency, 0)}
          </p>
        </div>

        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wider">YTD P&L</p>
          <p
            className={`text-lg font-semibold tabular-nums ${getPnLColorClass(summary?.unrealizedPnL)}`}
          >
            {formatCurrency(convert(summary?.unrealizedPnL), currency, 0)}
            <span
              className={`text-xs ml-1.5 block sm:inline ${getPnLColorClass(summary?.unrealizedPnLPct)}`}
            >
              {formatPercent(summary?.unrealizedPnLPct)}
            </span>
          </p>
        </div>

        <Link to="/portfolio" className="hover:text-primary transition-colors cursor-pointer">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Exposure</p>
          <p className="text-lg font-semibold tabular-nums">{`${exposurePct.toFixed(1)}%`}</p>
        </Link>

        <Link to="/portfolio" className="hover:text-primary transition-colors cursor-pointer">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Live Positions</p>
          <p className="text-lg font-semibold tabular-nums">{summary?.positionCount ?? 0}</p>
        </Link>

        <Link
          to="/trades"
          className="hover:text-primary transition-colors cursor-pointer col-span-2"
        >
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Closed Trades</p>
          <p className="text-lg font-semibold tabular-nums">{tradeAnalytics?.totalTrades ?? 0}</p>
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
      {positions && <AllocationCharts positions={positions} isLoading={positionsLoading} />}

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
