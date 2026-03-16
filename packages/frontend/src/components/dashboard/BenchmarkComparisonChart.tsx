import { useState, useMemo } from 'react';
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
import { Button } from '@/components/ui/button';
import { useQueries } from '@tanstack/react-query';
import { usePerformanceHistory, useBenchmarkHistory } from '@/hooks/usePortfolio';
import { api } from '@/lib/api';
import type { CoinSearchResult } from '@/lib/types';
import { useSearchCoins } from '@/hooks/useAssets';
import {
  normalizePerformanceHistory,
  mergeAdditionalBenchmark,
  getCurrentChange,
  DEFAULT_BENCHMARKS,
  ADDITIONAL_COLORS,
  type BenchmarkConfig,
  type NormalizedDataPoint,
} from '@/lib/benchmarkUtils';
import { Plus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

type TimePeriod = '7D' | '1M' | '3M' | '1Y' | 'YTD' | 'Max';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface BenchmarkComparisonChartProps {
  // liveValueUsd could be used for live updates in the future
}

function getDateRange(period: TimePeriod): { from?: string; to?: string; days?: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case '7D':
      return { days: 7 };
    case '1M':
      return { days: 30 };
    case '3M':
      return { days: 90 };
    case '1Y':
      return { days: 365 };
    case 'YTD': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear.toISOString(), to: today.toISOString() };
    }
    case 'Max':
      return {};
    default:
      return { days: 30 };
  }
}

function getDaysFromPeriod(period: TimePeriod): number {
  switch (period) {
    case '7D':
      return 7;
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '1Y':
      return 365;
    case 'YTD': {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    case 'Max':
      return 365;
    default:
      return 30;
  }
}

function formatXAxisDate(timestamp: string, totalDays: number): string {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  if (totalDays <= 14) {
    return `${day} ${month}`;
  } else if (totalDays <= 60) {
    return `${day} ${month}`;
  } else {
    return `${month} ${year}`;
  }
}

function formatTooltipDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function BenchmarkComparisonChart(_props: BenchmarkComparisonChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('1M');
  const [benchmarks, setBenchmarks] = useState<BenchmarkConfig[]>(DEFAULT_BENCHMARKS);
  const [additionalBenchmarks, setAdditionalBenchmarks] = useState<BenchmarkConfig[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Use the same search hook as PositionForm
  const { data: rawSearchResults, isLoading: isSearching } = useSearchCoins(searchQuery);

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const days = useMemo(() => getDaysFromPeriod(period), [period]);

  const {
    data: performanceData,
    isLoading,
    isFetching: perfFetching,
  } = usePerformanceHistory(dateRange);

  // Fetch BTC/ETH historical data from CoinGecko API (more reliable than snapshot data)
  const btcEnabled = benchmarks.find((b) => b.id === 'btc')?.enabled ?? false;
  const ethEnabled = benchmarks.find((b) => b.id === 'eth')?.enabled ?? false;
  const { data: btcData, isFetching: btcFetching } = useBenchmarkHistory(
    'bitcoin',
    days,
    btcEnabled
  );
  const { data: ethData, isFetching: ethFetching } = useBenchmarkHistory(
    'ethereum',
    days,
    ethEnabled
  );
  const isBenchmarkFetching =
    perfFetching || (btcEnabled && btcFetching) || (ethEnabled && ethFetching);

  // Fetch additional benchmark data using useQueries (safe for dynamic arrays)
  const additionalQueries = useQueries({
    queries: additionalBenchmarks.map((b) => ({
      queryKey: ['benchmark', 'history', b.coingeckoId, days],
      queryFn: () => api.getBenchmarkHistory(b.coingeckoId, days),
      enabled: b.enabled,
      staleTime: 5 * 60 * 1000,
    })),
  });

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

    // Merge BTC from CoinGecko API
    if (btcData && btcEnabled) {
      normalized = mergeAdditionalBenchmark(normalized, btcData, 'btc');
    }

    // Merge ETH from CoinGecko API
    if (ethData && ethEnabled) {
      normalized = mergeAdditionalBenchmark(normalized, ethData, 'eth');
    }

    // Merge additional benchmarks
    additionalBenchmarks.forEach((benchmark, index) => {
      const queryResult = additionalQueries[index];
      if (queryResult?.data && benchmark.enabled) {
        normalized = mergeAdditionalBenchmark(normalized, queryResult.data, benchmark.id);
      }
    });

    // Add formatted dates for display
    return normalized.map((point) => ({
      ...point,
      displayDate: formatXAxisDate(point.timestamp, dataSpanDays),
      tooltipDate: formatTooltipDate(point.timestamp),
    }));
  }, [
    performanceData,
    btcData,
    ethData,
    btcEnabled,
    ethEnabled,
    additionalBenchmarks,
    additionalQueries,
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
    if (!rawSearchResults) return [];
    const existingIds = new Set([
      ...benchmarks.map((b) => b.coingeckoId),
      ...additionalBenchmarks.map((b) => b.coingeckoId),
    ]);
    return rawSearchResults.filter((r) => !existingIds.has(r.id)).slice(0, 5);
  }, [rawSearchResults, benchmarks, additionalBenchmarks]);

  const addBenchmark = (coin: CoinSearchResult) => {
    if (additionalBenchmarks.length >= 3) return;

    const colorIndex = additionalBenchmarks.length % ADDITIONAL_COLORS.length;
    setAdditionalBenchmarks((prev) => [
      ...prev,
      {
        id: coin.id,
        coingeckoId: coin.id,
        symbol: coin.symbol,
        color: ADDITIONAL_COLORS[colorIndex],
        enabled: true,
      },
    ]);
    setSearchOpen(false);
    setSearchQuery('');
  };

  const periods: TimePeriod[] = ['7D', '1M', '3M', '1Y', 'YTD', 'Max'];

  // Get all active benchmarks for legend
  const allBenchmarks = [
    { id: 'portfolio', symbol: 'Portfolio', color: 'hsl(var(--primary))', enabled: true },
    ...benchmarks,
    ...additionalBenchmarks,
  ];

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle>Portfolio % vs Benchmarks</CardTitle>

          {/* Time Period Selector */}
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex w-max rounded-md border">
              {periods.map((p) => (
                <Button
                  key={p}
                  variant={period === p ? 'secondary' : 'ghost'}
                  size="sm"
                  className={`h-8 px-3 rounded-none first:rounded-l-md last:rounded-r-md ${
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

        {/* Benchmark Toggles */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {benchmarks.map((benchmark) => (
            <Button
              key={benchmark.id}
              variant={benchmark.enabled ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              style={{
                backgroundColor: benchmark.enabled ? benchmark.color : undefined,
                borderColor: benchmark.color,
                color: benchmark.enabled ? 'white' : benchmark.color,
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
                variant={benchmark.enabled ? 'default' : 'outline'}
                size="sm"
                className="h-7 text-xs rounded-r-none"
                style={{
                  backgroundColor: benchmark.enabled ? benchmark.color : undefined,
                  borderColor: benchmark.color,
                  color: benchmark.enabled ? 'white' : benchmark.color,
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
                className="h-7 px-1 rounded-l-none border-l-0"
                style={{ borderColor: benchmark.color }}
                onClick={() => removeAdditionalBenchmark(benchmark.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}

          {additionalBenchmarks.length < 3 && (
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs">
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-64 p-2">
                <Input
                  placeholder="Search coins..."
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
                  {searchResults.map((coin) => (
                    <Button
                      key={coin.id}
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start h-8 text-xs"
                      onClick={() => addBenchmark(coin)}
                    >
                      <span className="font-medium">{coin.symbol}</span>
                      <span className="ml-2 text-muted-foreground truncate">{coin.name}</span>
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}

          {/* Portfolio Legend Item */}
          <div className="w-full text-sm sm:ml-auto sm:w-auto">
            <span className="text-primary font-medium">Portfolio</span>
            {chartData.length > 0 && (
              <span
                className={`ml-1 ${(getCurrentChange(chartData, 'portfolio') ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}
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
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart data...</div>
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
                                <span className={value >= 0 ? 'text-green-600' : 'text-red-600'}>
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
                {/* Portfolio line */}
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={(props: Record<string, unknown>) => {
                    const { cx, cy, index, value } = props as {
                      cx: number;
                      cy: number;
                      index: number;
                      value: number | undefined;
                    };
                    if (index !== chartData.length - 1 || value == null)
                      return <g key={`p-${index}`} />;
                    return (
                      <g key={`p-${index}`}>
                        <circle cx={cx} cy={cy} r={3} fill="hsl(var(--primary))" />
                        <text
                          x={cx + 8}
                          y={cy}
                          fontSize={11}
                          dominantBaseline="middle"
                          fontWeight={500}
                          fill="currentColor"
                          opacity={0.7}
                        >
                          {`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                        </text>
                      </g>
                    );
                  }}
                  connectNulls
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
                {/* BTC line */}
                {benchmarks.find((b) => b.id === 'btc')?.enabled && (
                  <Line
                    type="monotone"
                    dataKey="btc"
                    stroke="#F7931A"
                    strokeWidth={2}
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, index, value } = props as {
                        cx: number;
                        cy: number;
                        index: number;
                        value: number | undefined;
                      };
                      if (index !== chartData.length - 1 || value == null)
                        return <g key={`btc-${index}`} />;
                      return (
                        <g key={`btc-${index}`}>
                          <circle cx={cx} cy={cy} r={3} fill="#F7931A" />
                          <text
                            x={cx + 8}
                            y={cy}
                            fontSize={11}
                            dominantBaseline="middle"
                            fontWeight={500}
                            fill="#F7931A"
                          >
                            {`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                          </text>
                        </g>
                      );
                    }}
                    connectNulls
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                )}
                {/* ETH line */}
                {benchmarks.find((b) => b.id === 'eth')?.enabled && (
                  <Line
                    type="monotone"
                    dataKey="eth"
                    stroke="#627EEA"
                    strokeWidth={2}
                    dot={(props: Record<string, unknown>) => {
                      const { cx, cy, index, value } = props as {
                        cx: number;
                        cy: number;
                        index: number;
                        value: number | undefined;
                      };
                      if (index !== chartData.length - 1 || value == null)
                        return <g key={`eth-${index}`} />;
                      return (
                        <g key={`eth-${index}`}>
                          <circle cx={cx} cy={cy} r={3} fill="#627EEA" />
                          <text
                            x={cx + 8}
                            y={cy}
                            fontSize={11}
                            dominantBaseline="middle"
                            fontWeight={500}
                            fill="#627EEA"
                          >
                            {`${value >= 0 ? '+' : ''}${value.toFixed(1)}%`}
                          </text>
                        </g>
                      );
                    }}
                    connectNulls
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                )}
                {/* Additional benchmark lines */}
                {additionalBenchmarks
                  .filter((b) => b.enabled)
                  .map((benchmark) => (
                    <Line
                      key={benchmark.id}
                      type="monotone"
                      dataKey={benchmark.id}
                      stroke={benchmark.color}
                      strokeWidth={2}
                      dot={(props: Record<string, unknown>) => {
                        const { cx, cy, index, value } = props as {
                          cx: number;
                          cy: number;
                          index: number;
                          value: number | undefined;
                        };
                        if (index !== chartData.length - 1 || value == null)
                          return <g key={`${benchmark.id}-${index}`} />;
                        return (
                          <g key={`${benchmark.id}-${index}`}>
                            <circle cx={cx} cy={cy} r={3} fill={benchmark.color} />
                            <text
                              x={cx + 8}
                              y={cy}
                              fontSize={11}
                              dominantBaseline="middle"
                              fontWeight={500}
                              fill={benchmark.color}
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
