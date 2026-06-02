import { useState, useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { usePerformanceHistory } from '@/hooks/usePortfolio';
import { formatCurrency } from '@/lib/utils';
import { getDateRange, formatXAxisDate, formatTooltipDate } from '@/lib/chartUtils';
import { PORTFOLIO_LINE_COLOR } from '@/lib/chartColors';
import type { TimePeriod } from '@/lib/types';

interface PortfolioChartProps {
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  stakeMultiplier?: number;
  liveValueUsd?: number;
}

/** Recharts injects these at runtime into the dot render callback; the library types it as `any`. */
interface RechartsAreaDotProps {
  cx: number;
  cy: number;
  index: number;
}

const CHART_SKELETON_TICKS = ['start', 'early', 'middle', 'late', 'end'] as const;

export function PortfolioChart({
  currency = 'USD',
  fxRate = 1,
  stakeMultiplier = 1,
  liveValueUsd,
}: PortfolioChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('YTD');

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const { data: performanceData, isLoading, isFetching } = usePerformanceHistory(dateRange);

  // Calculate the date range span in days
  const dataSpanDays = useMemo(() => {
    if (!performanceData || performanceData.length < 2) return 30;
    const firstDate = new Date(performanceData[0].timestamp);
    const lastDate = new Date(performanceData[performanceData.length - 1].timestamp);
    return Math.ceil((lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24));
  }, [performanceData]);

  // Calculate chart data with stake multiplier from parent
  const chartData = useMemo(() => {
    if (!performanceData || performanceData.length === 0) return [];

    const data = performanceData.map((point) => {
      const baseValue =
        currency === 'SGD'
          ? (point.totalValueSgd ?? point.totalValueUsd * fxRate)
          : point.totalValueUsd;

      return {
        date: formatXAxisDate(point.timestamp, dataSpanDays),
        tooltipDate: formatTooltipDate(point.timestamp),
        timestamp: point.timestamp,
        value: baseValue * stakeMultiplier,
        fullValue: baseValue,
        isLive: false,
      };
    });

    // Handle live data: either append or replace today's $0 snapshot
    if (liveValueUsd && data.length > 0) {
      const lastPoint = data[data.length - 1];
      const lastDate = new Date(lastPoint.timestamp);
      const today = new Date();
      const isSameDay = lastDate.toDateString() === today.toDateString();
      const liveBaseValue = currency === 'SGD' ? liveValueUsd * fxRate : liveValueUsd;

      if (isSameDay && lastPoint.value === 0) {
        // Replace today's $0 snapshot with live value
        data[data.length - 1] = {
          date: formatXAxisDate(today.toISOString(), dataSpanDays),
          tooltipDate: formatTooltipDate(today.toISOString()),
          timestamp: today.toISOString(),
          value: liveBaseValue * stakeMultiplier,
          fullValue: liveBaseValue,
          isLive: true,
        };
      } else if (!isSameDay) {
        // Append live data point if no snapshot for today
        data.push({
          date: formatXAxisDate(today.toISOString(), dataSpanDays),
          tooltipDate: formatTooltipDate(today.toISOString()),
          timestamp: today.toISOString(),
          value: liveBaseValue * stakeMultiplier,
          fullValue: liveBaseValue,
          isLive: true,
        });
      }
    }

    return data;
  }, [performanceData, stakeMultiplier, currency, fxRate, liveValueUsd, dataSpanDays]);

  // Calculate change from first to last point
  const valueChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].value;
    const last = chartData[chartData.length - 1].value;
    const change = last - first;
    const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;
    return { change, changePercent };
  }, [chartData]);

  // Calculate Y-axis domain with padding to show fluctuations
  const yAxisDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    const values = chartData.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Add 10% padding on each side, but don't go below 0
    const padding = range > 0 ? range * 0.1 : max * 0.05;
    const domainMin = Math.max(0, min - padding);
    const domainMax = max + padding;

    return [domainMin, domainMax];
  }, [chartData]);

  // Determine tick interval - always aim for ~5-6 evenly spaced ticks (CoinGecko style)
  // This ensures consistent visual density regardless of data granularity
  const tickInterval = useMemo(() => {
    const dataLength = chartData.length;
    if (dataLength <= 6) return 0; // Show all ticks for very short data
    // Calculate interval to show approximately 5-6 ticks
    const targetTicks = 5;
    return Math.max(1, Math.floor((dataLength - 1) / targetTicks));
  }, [chartData.length]);

  const periods: TimePeriod[] = ['7D', '1M', '3M', '1Y', 'YTD', 'Max'];

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <CardTitle>Portfolio $ Value</CardTitle>
            {valueChange && (
              <div className={`text-sm ${valueChange.change >= 0 ? 'text-profit' : 'text-loss'}`}>
                <span className="font-medium">
                  {valueChange.change >= 0 ? '+' : ''}
                  {formatCurrency(valueChange.change, currency, 0)}
                </span>
                <span className="ml-1 text-xs">
                  ({valueChange.changePercent >= 0 ? '+' : ''}
                  {valueChange.changePercent.toFixed(2)}%)
                </span>
              </div>
            )}
          </div>
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
              <p className="text-xs mt-1">
                {period === 'Max'
                  ? 'Create a snapshot to start tracking your portfolio'
                  : 'Try selecting a longer time period'}
              </p>
            </div>
          </div>
        ) : (
          <div className="relative">
            {isFetching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 56, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={PORTFOLIO_LINE_COLOR} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={PORTFOLIO_LINE_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  interval={tickInterval}
                />
                <YAxis
                  domain={yAxisDomain}
                  tickFormatter={(value) => formatCurrency(value, currency, true)}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  width={56}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-background p-3 shadow-md">
                        <p className="text-xs text-muted-foreground mb-1">
                          {data.tooltipDate}
                          {data.isLive && <span className="ml-1 text-profit">(Live)</span>}
                        </p>
                        <p className="font-mono font-medium">
                          {formatCurrency(data.value, currency, 0)}
                        </p>
                        {stakeMultiplier < 1 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Full portfolio: {formatCurrency(data.fullValue, currency, 0)}
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {chartData.length > 0 && (
                  <ReferenceLine
                    y={chartData[0].value}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeDasharray="4 4"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={PORTFOLIO_LINE_COLOR}
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                  dot={(props: RechartsAreaDotProps) => {
                    const { cx, cy, index } = props;
                    const dotKey = chartData[index]?.timestamp ?? `${cx}-${cy}`;
                    if (index !== chartData.length - 1)
                      return <g key={`portfolio-dot-${dotKey}`} />;
                    return (
                      <g key={`portfolio-dot-${dotKey}`}>
                        <circle cx={cx} cy={cy} r={3} fill={PORTFOLIO_LINE_COLOR} />
                        <text
                          x={cx + 8}
                          y={cy}
                          fontSize={11}
                          dominantBaseline="middle"
                          fontWeight={500}
                          fill="currentColor"
                          opacity={0.7}
                        >
                          {formatCurrency(chartData[index].value, currency, true)}
                        </text>
                      </g>
                    );
                  }}
                  activeDot={{ r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
