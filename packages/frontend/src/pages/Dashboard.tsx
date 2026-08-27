import { useMemo, useState } from 'react';
import {
  usePortfolioSummary,
  usePositions,
  useTopPerformers,
  useWorstPerformers,
  useInvestors,
  useDrawdownStats,
} from '@/hooks/usePortfolio';
import { useTradeAnalytics } from '@/hooks/useTrades';
import { useCurrencyStore } from '@/stores/currencyStore';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import { formatDateTime, isMarketExposureCategory } from '@/lib/utils';
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
import { usePageTitle } from '@/hooks/usePageTitle';
import { usePerpExposure } from '@/hooks/usePerpExposure';

export default function Dashboard() {
  usePageTitle('Dashboard');
  const { currency } = useCurrencyStore();
  const { data: summary, isLoading: summaryLoading } = usePortfolioSummary();
  const { data: positions, isLoading: positionsLoading } = usePositions();
  const { data: tradeAnalytics } = useTradeAnalytics();
  const { data: topPerformers } = useTopPerformers(5);
  const { data: worstPerformers } = useWorstPerformers(5);
  const { data: investors } = useInvestors();
  const { perpExposure } = usePerpExposure();
  const totalValueUsd = summary?.totalValueUsd ?? 0;
  const totalValueSgd = summary?.totalValueSgd ?? 0;
  const { ytdAthUsd, currentDrawdownPct, maxDrawdownPct, maxDailyDrawdownPct } =
    useDrawdownStats(totalValueUsd);

  // Investor filter state - lifted to Dashboard level. Defaults to owner until manually changed.
  const [manualSelectedInvestors, setManualSelectedInvestors] = useState<string[] | null>(null);
  const defaultSelectedInvestors = useMemo(() => {
    if (!investors || investors.length === 0) return [];
    const owner = investors.find((investor) => investor.isOwner);
    return owner ? [owner.id] : [];
  }, [investors]);
  const selectedInvestors = manualSelectedInvestors ?? defaultSelectedInvestors;

  const fxRate = useMemo(() => {
    if (totalValueUsd > 0 && totalValueSgd > 0) {
      return totalValueSgd / totalValueUsd;
    }
    return USD_SGD_FALLBACK_RATE;
  }, [totalValueUsd, totalValueSgd]);

  // Calculate stake multiplier based on selected investors
  const stakeMultiplier = useMemo(() => {
    if (selectedInvestors.length === 0 || !investors) return 1;
    const totalStake = investors
      .filter((inv) => selectedInvestors.includes(inv.id))
      .reduce((sum, inv) => sum + inv.stakePercentage, 0);
    return totalStake / 100;
  }, [selectedInvestors, investors]);

  const exposurePct = useMemo(() => {
    if (!positions || totalValueUsd <= 0) return 0;
    const ownedMarketExposureTotal = positions
      .filter((position) => !position.custodyOf)
      .filter((position) => isMarketExposureCategory(position.asset.category))
      .reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);

    return ((ownedMarketExposureTotal + perpExposure) / totalValueUsd) * 100;
  }, [positions, totalValueUsd, perpExposure]);

  const handleInvestorToggle = (investorId: string) => {
    setManualSelectedInvestors((prev) => {
      const current = prev ?? defaultSelectedInvestors;
      return current.includes(investorId)
        ? current.filter((id) => id !== investorId)
        : [...current, investorId];
    });
  };

  const handleSelectAll = () => {
    if (!investors) return;
    if (selectedInvestors.length === investors.length) {
      setManualSelectedInvestors([]);
    } else {
      setManualSelectedInvestors(investors.map((inv) => inv.id));
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
      <div className="space-y-6" role="status" aria-live="polite">
        <span className="sr-only">Loading dashboard…</span>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-4 w-48 mt-2" />
          </div>
          <Skeleton className="h-11 w-full sm:h-9 sm:w-32" />
        </div>

        <div className="pb-6 mb-2 border-b">
          <Skeleton className="h-4 w-20 mb-2" />
          <Skeleton className="h-12 w-48 mb-2" />
          {/* Mirrors NetWorthCard's single scroll rail. */}
          <div className="mt-4 overflow-hidden">
            <div className="grid min-w-max grid-flow-col auto-cols-[9rem] gap-4 xl:min-w-0 xl:grid-flow-row xl:grid-cols-9 xl:auto-cols-auto">
              {Array.from({ length: 9 }, (_, index) => (
                <Skeleton key={index} className="h-11 w-full" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <DbStatusBanner />
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="min-w-0 flex-1 justify-between sm:flex-none"
            >
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
                    className="h-8 text-xs"
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

      {summary && (
        <div>
          <NetWorthCard
            summary={summary}
            currency={currency}
            stakeMultiplier={stakeMultiplier}
            ytdAthUsd={ytdAthUsd}
            drawdownFromAthPct={currentDrawdownPct}
            maxDrawdownPct={maxDrawdownPct}
            maxDailyDrawdownPct={maxDailyDrawdownPct}
            exposurePct={exposurePct}
            positionCount={summary.positionCount ?? 0}
            closedTrades={tradeAnalytics?.totalTrades ?? 0}
            investorLabel={getInvestorLabel()}
          />
        </div>
      )}

      <div>
        <PortfolioChart
          currency={currency}
          fxRate={fxRate}
          stakeMultiplier={stakeMultiplier}
          liveValueUsd={summary?.totalValueUsd}
        />
      </div>

      <div>
        <BenchmarkComparisonChart />
      </div>

      {positions && (
        <div>
          <AllocationCharts
            positions={positions.filter((p) => !p.custodyOf)}
            perpExposure={perpExposure}
            isLoading={positionsLoading}
          />
        </div>
      )}

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

      <div className="text-center text-sm text-muted-foreground">
        Last updated: {formatDateTime(summary?.lastUpdated)}
      </div>
    </div>
  );
}
