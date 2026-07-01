import { useState, useMemo, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useQueries, type UseQueryResult } from '@tanstack/react-query';
import { usePerformanceHistory } from '@/hooks/usePortfolio';
import { api } from '@/lib/api';
import type { ProviderName, ProviderSearchResult, TimePeriod } from '@/lib/types';
import { useSearchAssets } from '@/hooks/useAssets';
import {
  normalizePerformanceHistory,
  mergeAdditionalBenchmark,
  getCurrentChange,
  DEFAULT_BENCHMARKS,
  SPX_PROVIDER_ASSET_ID,
  type BenchmarkConfig,
  type NormalizedDataPoint,
} from '@/lib/benchmarkUtils';
import {
  PORTFOLIO_LINE_COLOR,
  PORTFOLIO_FOREGROUND_COLOR,
  ADDITIONAL_BENCHMARK_COLORS,
  ADDITIONAL_BENCHMARK_FOREGROUND_COLORS,
} from '@/lib/chartColors';
import {
  getDateRange,
  getDaysFromPeriod,
  formatXAxisDate,
  formatTooltipDate,
  downsampleLTTB,
} from '@/lib/chartUtils';
import { Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

/** Recharts injects these at runtime into the dot render callback; the library types it as `any`. */
interface RechartsLineDotProps {
  cx: number;
  cy: number;
  index: number;
  value: number | undefined;
}

const CHART_SKELETON_TICKS = ['start', 'early', 'middle', 'late', 'end'] as const;

type BenchmarkSearchResult = Pick<
  ProviderSearchResult,
  'id' | 'provider' | 'providerAssetId' | 'symbol' | 'name' | 'exchange' | 'nativeCurrency' | 'rank'
>;

const TRADFI_BENCHMARK_PRESETS: BenchmarkSearchResult[] = [
  {
    id: '^GSPC',
    provider: 'yahoo',
    providerAssetId: SPX_PROVIDER_ASSET_ID,
    symbol: 'SPX',
    name: 'S&P 500 benchmark',
    exchange: 'Yahoo Finance',
    nativeCurrency: 'USD',
    rank: null,
  },
  {
    id: 'SPY',
    provider: 'yahoo',
    providerAssetId: 'SPY',
    symbol: 'SPY',
    name: 'SPDR S&P 500 ETF Trust',
    exchange: 'NYSEArca',
    nativeCurrency: 'USD',
    rank: null,
  },
  {
    id: 'QQQ',
    provider: 'yahoo',
    providerAssetId: 'QQQ',
    symbol: 'QQQ',
    name: 'Invesco QQQ Trust',
    exchange: 'NasdaqGM',
    nativeCurrency: 'USD',
    rank: null,
  },
];

function benchmarkBackground(color: string) {
  return `color-mix(in oklch, ${color} 16%, transparent)`;
}

function benchmarkIdentity(provider: ProviderName, providerAssetId: string) {
  if (provider === 'yahoo' && providerAssetId.toUpperCase() === '^GSPC') {
    return `${provider}:${SPX_PROVIDER_ASSET_ID}`;
  }
  return `${provider}:${providerAssetId.toUpperCase()}`;
}

function chartDataKey(provider: ProviderName, providerAssetId: string) {
  const safeId = providerAssetId.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `benchmark-${provider}-${safeId || 'asset'}`.toLowerCase();
}

export function BenchmarkComparisonChart() {
  const [period, setPeriod] = useState<TimePeriod>('YTD');
  const [benchmarks, setBenchmarks] = useState<BenchmarkConfig[]>(DEFAULT_BENCHMARKS);
  const [additionalBenchmarks, setAdditionalBenchmarks] = useState<BenchmarkConfig[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: cryptoSearchResults, isLoading: cryptoSearching } = useSearchAssets(searchQuery, {
    provider: 'coingecko',
  });
  const { data: tradfiSearchResults, isLoading: tradfiSearching } = useSearchAssets(searchQuery, {
    provider: 'yahoo',
  });
  const isSearching = cryptoSearching || tradfiSearching;

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const days = useMemo(() => getDaysFromPeriod(period), [period]);

  const {
    data: performanceData,
    isLoading,
    isFetching: perfFetching,
  } = usePerformanceHistory(dateRange);

  // Collapse each useQueries result into a data-only array + isFetching flag.
  // React Query memoizes the combined output (structural sharing), so `.data`
  // stays referentially stable across renders unless the benchmark data changes —
  // this is what keeps the expensive chartData useMemo below from re-running every render.
  const combineBenchmarkResults = useCallback(
    (results: UseQueryResult<Awaited<ReturnType<typeof api.getBenchmarkHistory>>>[]) => ({
      data: results.map((r) => r.data),
      isFetching: results.some((r) => r.isFetching),
    }),
    []
  );
  const benchmarkQueries = useQueries({
    queries: benchmarks.map((b) => ({
      queryKey: ['benchmark', 'history', b.provider, b.providerAssetId, days],
      queryFn: () =>
        api.getBenchmarkHistory({
          provider: b.provider,
          providerAssetId: b.providerAssetId,
          days,
        }),
      enabled: b.enabled,
      staleTime: 5 * 60 * 1000,
    })),
    combine: combineBenchmarkResults,
  });
  const additionalQueries = useQueries({
    queries: additionalBenchmarks.map((b) => ({
      queryKey: ['benchmark', 'history', b.provider, b.providerAssetId, days],
      queryFn: () =>
        api.getBenchmarkHistory({
          provider: b.provider,
          providerAssetId: b.providerAssetId,
          days,
        }),
      enabled: b.enabled,
      staleTime: 5 * 60 * 1000,
    })),
    combine: combineBenchmarkResults,
  });
  const isBenchmarkFetching =
    perfFetching || benchmarkQueries.isFetching || additionalQueries.isFetching;

  // Calculate the date range span in days
  const dataSpanDays = useMemo(() => {
    if (!performanceData || performanceData.length < 2) return 30;
    const firstDate = new Date(performanceData[0].timestamp);
    const lastDate = new Date(performanceData[performanceData.length - 1].timestamp);
    return Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  }, [performanceData]);

  // Normalize and merge data
  const chartData = useMemo(() => {
    if (!performanceData || performanceData.length === 0) return [];

    // Start with portfolio data only (ignore btcPrice/ethPrice from snapshots)
    let normalized = normalizePerformanceHistory(performanceData);

    // Merge default benchmarks
    benchmarks.forEach((benchmark, index) => {
      const benchmarkData = benchmarkQueries.data[index];
      if (benchmarkData && benchmark.enabled) {
        normalized = mergeAdditionalBenchmark(normalized, benchmarkData, benchmark.id);
      }
    });

    // Merge custom benchmarks
    additionalBenchmarks.forEach((benchmark, index) => {
      const benchmarkData = additionalQueries.data[index];
      if (benchmarkData && benchmark.enabled) {
        normalized = mergeAdditionalBenchmark(normalized, benchmarkData, benchmark.id);
      }
    });

    // Downsample for very long (Max) periods only — keeps 1Y (365 pts) untouched
    const displayData =
      normalized.length > 400
        ? downsampleLTTB(
            normalized,
            300,
            (d) => new Date(d.timestamp).getTime(),
            (d) => (typeof d.portfolio === 'number' ? d.portfolio : 0)
          )
        : normalized;

    // Add formatted dates for display
    return displayData.map((point) => ({
      ...point,
      displayDate: formatXAxisDate(point.timestamp, dataSpanDays),
      tooltipDate: formatTooltipDate(point.timestamp),
    }));
  }, [
    performanceData,
    benchmarks,
    benchmarkQueries.data,
    additionalBenchmarks,
    additionalQueries.data,
    dataSpanDays,
  ]);

  // Calculate tick interval
  const tickInterval = useMemo(() => {
    const dataLength = chartData.length;
    if (dataLength <= 6) return 0;
    const targetTicks = 5;
    return Math.max(1, Math.floor((dataLength - 1) / targetTicks));
  }, [chartData.length]);

  const toggleBenchmark = (id: string) => {
    setBenchmarks((prev) => prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b)));
  };

  const toggleAdditionalBenchmark = (id: string) => {
    setAdditionalBenchmarks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, enabled: !b.enabled } : b))
    );
  };

  const removeAdditionalBenchmark = (id: string) => {
    setAdditionalBenchmarks((prev) => prev.filter((b) => b.id !== id));
  };

  // Filter out already added benchmarks from search results
  const searchResults = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();
    if (trimmedQuery.length < 1) return [];
    const existingIds = new Set([
      ...benchmarks.map((b) => benchmarkIdentity(b.provider, b.providerAssetId)),
      ...additionalBenchmarks.map((b) => benchmarkIdentity(b.provider, b.providerAssetId)),
    ]);
    const presetMatches = TRADFI_BENCHMARK_PRESETS.filter((benchmark) => {
      const haystack = `${benchmark.symbol} ${benchmark.name} ${benchmark.providerAssetId}`;
      return haystack.toLowerCase().includes(trimmedQuery);
    });
    const seen = new Set<string>();
    return [...presetMatches, ...(tradfiSearchResults ?? []), ...(cryptoSearchResults ?? [])]
      .filter((result) => {
        const identity = benchmarkIdentity(result.provider, result.providerAssetId);
        if (existingIds.has(identity) || seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .slice(0, 8);
  }, [searchQuery, cryptoSearchResults, tradfiSearchResults, benchmarks, additionalBenchmarks]);

  const addBenchmark = (candidate: BenchmarkSearchResult) => {
    if (additionalBenchmarks.length >= 3) return;

    const providerAssetId =
      candidate.provider === 'yahoo' && candidate.providerAssetId.toUpperCase() === '^GSPC'
        ? SPX_PROVIDER_ASSET_ID
        : candidate.providerAssetId;
    const symbol =
      candidate.provider === 'yahoo' && candidate.providerAssetId.toUpperCase() === '^GSPC'
        ? 'SPX'
        : candidate.symbol.toUpperCase();
    const colorIndex = (additionalBenchmarks.length + 1) % ADDITIONAL_BENCHMARK_COLORS.length;
    setAdditionalBenchmarks((prev) => [
      ...prev,
      {
        id: chartDataKey(candidate.provider, providerAssetId),
        provider: candidate.provider,
        providerAssetId,
        symbol,
        color: ADDITIONAL_BENCHMARK_COLORS[colorIndex],
        foregroundColor: ADDITIONAL_BENCHMARK_FOREGROUND_COLORS[colorIndex],
        enabled: true,
      },
    ]);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const periods: TimePeriod[] = ['7D', '1M', '3M', '1Y', 'YTD', 'Max'];

  const allBenchmarks = [
    {
      id: 'portfolio',
      symbol: 'Portfolio',
      color: PORTFOLIO_LINE_COLOR,
      foregroundColor: PORTFOLIO_FOREGROUND_COLOR,
      enabled: true,
    },
    ...benchmarks,
    ...additionalBenchmarks,
  ];

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="text-base">Portfolio % vs Benchmarks</CardTitle>

          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex w-max rounded-md border">
              {periods.map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-11 px-3 rounded-none first:rounded-l-md last:rounded-r-md sm:h-8 ${
                    period === p ? '' : 'hover:bg-muted'
                  }`}
                  onClick={() => setPeriod(p)}
                >
                  {p}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {benchmarks.map((benchmark) => (
            <Button
              key={benchmark.id}
              variant="outline"
              size="sm"
              className="h-11 text-xs sm:h-8"
              style={{
                backgroundColor: benchmark.enabled
                  ? benchmarkBackground(benchmark.color)
                  : undefined,
                borderColor: benchmark.color,
                color: benchmark.foregroundColor ?? benchmark.color,
              }}
              onClick={() => toggleBenchmark(benchmark.id)}
            >
              {benchmark.symbol}
              {benchmark.enabled && chartData.length > 0 && (
                <span className="ml-1">
                  {(() => {
                    const change = getCurrentChange(chartData, benchmark.id);
                    if (change === undefined) return '';
                    return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
                  })()}
                </span>
              )}
            </Button>
          ))}

          {additionalBenchmarks.map((benchmark) => (
            <div key={benchmark.id} className="flex items-center">
              <Button
                variant="outline"
                size="sm"
                className="h-11 text-xs rounded-r-none sm:h-8"
                style={{
                  backgroundColor: benchmark.enabled
                    ? benchmarkBackground(benchmark.color)
                    : undefined,
                  borderColor: benchmark.color,
                  color: benchmark.foregroundColor ?? benchmark.color,
                }}
                onClick={() => toggleAdditionalBenchmark(benchmark.id)}
              >
                {benchmark.symbol}
                {benchmark.enabled && chartData.length > 0 && (
                  <span className="ml-1">
                    {(() => {
                      const change = getCurrentChange(chartData, benchmark.id);
                      if (change === undefined) return '';
                      return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
                    })()}
                  </span>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-11 w-11 px-0 rounded-l-none border-l-0 touch-manipulation sm:h-8 sm:w-8"
                style={{
                  borderColor: benchmark.color,
                  color: benchmark.foregroundColor ?? benchmark.color,
                }}
                onClick={() => removeAdditionalBenchmark(benchmark.id)}
                aria-label={`Remove ${benchmark.symbol} benchmark`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {additionalBenchmarks.length < 3 && (
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-11 text-xs sm:h-8">
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-64 p-2">
                <Input
                  placeholder="Search coins, ETFs, indexes..."
                  aria-label="Search for a benchmark"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8"
                />
                <div className="mt-2 max-h-40 overflow-y-auto">
                  {isSearching && (
                    <div className="text-sm text-muted-foreground p-2">Searching...</div>
                  )}
                  {!isSearching && searchResults.length === 0 && searchQuery.length >= 1 && (
                    <div className="text-sm text-muted-foreground p-2">No results</div>
                  )}
                  {searchResults.map((candidate) => (
                    <Button
                      key={benchmarkIdentity(candidate.provider, candidate.providerAssetId)}
                      variant="ghost"
                      size="sm"
                      className="min-h-10 w-full justify-start gap-2 text-xs"
                      onClick={() => addBenchmark(candidate)}
                    >
                      <span className="font-medium">{candidate.symbol.toUpperCase()}</span>
                      <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
                        {candidate.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {candidate.provider === 'yahoo' ? 'TradFi' : 'Crypto'}
                      </span>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          <div className="w-full text-sm sm:ml-auto sm:w-auto flex items-center gap-1.5">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: PORTFOLIO_LINE_COLOR }}
            />
            <span className="font-medium text-muted-foreground">Portfolio</span>
            {chartData.length > 0 && (
              <span
                className={`ml-0.5 ${(getCurrentChange(chartData, 'portfolio') ?? 0) >= 0 ? 'text-profit' : 'text-loss'}`}
              >
                {(() => {
                  const change = getCurrentChange(chartData, 'portfolio');
                  if (change === undefined) return '';
                  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
                })()}
              </span>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex flex-col justify-between py-4">
            <div className="flex items-end justify-between px-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-[200px] w-full mx-4 rounded-none opacity-50" />
              <Skeleton className="h-3 w-10" />
            </div>
            <div className="flex justify-between px-2 mt-2">
              {CHART_SKELETON_TICKS.map((tick) => (
                <Skeleton key={tick} className="h-3 w-12" />
              ))}
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p>No data for {period} period</p>
              <p className="text-xs mt-1">Create snapshots to track performance vs benchmarks</p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {isBenchmarkFetching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 5, right: 56, left: 0, bottom: 5 }}>
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  interval={tickInterval}
                />
                <YAxis
                  tickFormatter={(value) => `${value >= 0 ? '+' : ''}${value.toFixed(0)}%`}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  width={42}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as NormalizedDataPoint & {
                      tooltipDate: string;
                    };
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-md">
                        <p className="text-xs text-muted-foreground mb-2">{data.tooltipDate}</p>
                        {allBenchmarks
                          .filter((b) => b.enabled)
                          .map((benchmark) => {
                            const value = data[benchmark.id];
                            if (typeof value !== 'number') return null;
                            return (
                              <div key={benchmark.id} className="flex items-center gap-2 text-sm">
                                <div
                                  className="w-2 h-2 rounded-full"
                                  style={{ backgroundColor: benchmark.color }}
                                />
                                <span>{benchmark.symbol}:</span>
                                <span className={value >= 0 ? 'text-profit' : 'text-loss'}>
                                  {value >= 0 ? '+' : ''}
                                  {value.toFixed(2)}%
                                </span>
                              </div>
                            );
                          })}
                      </div>
                    );
                  }}
                />
                <ReferenceLine
                  y={0}
                  stroke="currentColor"
                  strokeOpacity={0.15}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke={PORTFOLIO_LINE_COLOR}
                  strokeWidth={2}
                  dot={(props: RechartsLineDotProps) => {
                    const { cx, cy, index, value } = props;
                    const dotKey = chartData[index]?.timestamp ?? `${cx}-${cy}`;
                    if (index !== chartData.length - 1 || value == null) {
                      return <g key={`portfolio-dot-${dotKey}`} />;
                    }
                    return (
                      <g key={`portfolio-dot-${dotKey}`}>
                        <circle cx={cx} cy={cy} r={3} fill={PORTFOLIO_LINE_COLOR} />
                        <text
                          x={cx + 8}
                          y={cy}
                          fontSize={11}
                          dominantBaseline="middle"
                          fontWeight={500}
                          fill={PORTFOLIO_FOREGROUND_COLOR}
                        >
                          {`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                        </text>
                      </g>
                    );
                  }}
                  connectNulls
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                {[...benchmarks, ...additionalBenchmarks]
                  .filter((b) => b.enabled)
                  .map((benchmark) => (
                    <Line
                      key={benchmark.id}
                      type="monotone"
                      dataKey={benchmark.id}
                      stroke={benchmark.color}
                      strokeWidth={2}
                      dot={(props: RechartsLineDotProps) => {
                        const { cx, cy, index, value } = props;
                        const dotKey = chartData[index]?.timestamp ?? `${cx}-${cy}`;
                        if (index !== chartData.length - 1 || value == null) {
                          return <g key={`${benchmark.id}-dot-${dotKey}`} />;
                        }
                        return (
                          <g key={`${benchmark.id}-dot-${dotKey}`}>
                            <circle cx={cx} cy={cy} r={3} fill={benchmark.color} />
                            <text
                              x={cx + 8}
                              y={cy}
                              fontSize={11}
                              dominantBaseline="middle"
                              fontWeight={500}
                              fill={benchmark.foregroundColor ?? benchmark.color}
                            >
                              {`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                            </text>
                          </g>
                        );
                      }}
                      connectNulls
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
