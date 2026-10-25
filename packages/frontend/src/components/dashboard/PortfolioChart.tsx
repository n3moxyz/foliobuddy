import { useState, useMemo, useCallback, useRef } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ChartCopyButton } from '@/components/dashboard/ChartCopyButton';
import { usePerformanceHistory } from '@/hooks/usePortfolio';
import { formatPercent } from '@/lib/utils';
import { formatPercentAxisTick, getDateRange } from '@/lib/chartUtils';
import { PORTFOLIO_LINE_COLOR } from '@/lib/chartColors';
import type { TimePeriod } from '@/lib/types';
import {
  buildPortfolioChartData,
  PORTFOLIO_MILESTONE_LABELS,
  PORTFOLIO_MILESTONE_EXPLANATIONS,
  type PortfolioMilestone,
} from '@/lib/portfolioHistory';
import { PortfolioMilestoneGlyph } from './PortfolioMilestoneGlyph';
import { PortfolioMilestoneDetails, PortfolioMilestoneLegend } from './PortfolioMilestoneLegend';
import { DollarSign, Percent } from 'lucide-react';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

interface PortfolioChartProps {
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  stakeMultiplier?: number;
  liveValueUsd?: number;
  liveTimestamp?: string;
  milestones?: PortfolioMilestone[];
}

/** Recharts injects these at runtime into the dot render callback; the library types it as `any`. */
interface RechartsAreaDotProps {
  cx: number;
  cy: number;
  index: number;
}

const EMPTY_MILESTONES: PortfolioMilestone[] = [];
const CHART_SKELETON_TICKS = ['start', 'early', 'middle', 'late', 'end'] as const;
type ChartMode = 'value' | 'percent';

export function PortfolioChart({
  currency = 'USD',
  fxRate = 1,
  stakeMultiplier = 1,
  liveValueUsd,
  liveTimestamp,
  milestones = EMPTY_MILESTONES,
}: PortfolioChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('YTD');
  const [chartMode, setChartMode] = useState<ChartMode>('value');
  const [chartWidth, setChartWidth] = useState(0);
  const [activeMilestone, setActiveMilestone] = useState<PortfolioMilestone['kind'] | null>(null);
  const handleMilestoneActiveChange = useCallback(
    (kind: PortfolioMilestone['kind'], active: boolean) => {
      setActiveMilestone((current) => (active ? kind : current === kind ? null : current));
    },
    []
  );
  const chartRef = useRef<HTMLDivElement>(null);
  const { formatCurrency, formatSignedCurrency } = useMoneyFormatter();

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const { data: performanceData, isLoading, isFetching } = usePerformanceHistory(dateRange);

  // Stable tooltip renderer — an inline arrow here would change identity every render
  // and defeat Recharts' internal memoization on mouse-move.
  const renderTooltip = useCallback(
    ({ active, payload }: TooltipProps<number, string>) => {
      if (!active || !payload?.length) return null;
      const data = payload[0].payload;
      return (
        <div className="max-w-[280px] rounded-lg border bg-background p-3 shadow-md">
          <p className="text-xs text-muted-foreground mb-1">
            {data.tooltipDate}
            {data.isLive && <span className="ml-1 text-profit">(Live)</span>}
          </p>
          <p className="font-mono font-medium">
            {chartMode === 'percent'
              ? formatPercent(data.percentChange)
              : formatCurrency(data.value, currency, 0)}
          </p>
          {chartMode === 'percent' && (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatCurrency(data.value, currency, 0)}
            </p>
          )}
          {data.milestones.length > 0 && (
            <div className="mt-2 border-t pt-2">
              <PortfolioMilestoneDetails events={data.milestones} showDate={false} />
            </div>
          )}
          {currency === 'SGD' && data.milestones.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">Milestones use USD history.</p>
          )}
          {stakeMultiplier < 1 && (
            <p className="text-xs text-muted-foreground mt-1">
              Full portfolio: {formatCurrency(data.fullValue, currency, 0)}
            </p>
          )}
        </div>
      );
    },
    [chartMode, currency, formatCurrency, stakeMultiplier]
  );

  const chartData = useMemo(
    () =>
      buildPortfolioChartData({
        history: performanceData ?? [],
        liveValueUsd,
        asOf: liveTimestamp ?? new Date().toISOString(),
        milestones,
        currency,
        fxRate,
        stakeMultiplier,
      }),
    [performanceData, liveValueUsd, liveTimestamp, milestones, currency, fxRate, stakeMultiplier]
  );
  const visibleMilestones = useMemo(() => {
    const visible = new Set(
      chartData.flatMap((point) => point.milestones.map((event) => event.kind))
    );
    const groups = new Map<number, PortfolioMilestone[]>();
    for (const event of milestones.filter((item) => visible.has(item.kind))) {
      const time = Date.parse(event.timestamp);
      const group = groups.get(time) ?? [];
      group.push(event);
      groups.set(time, group);
    }
    return [...groups.values()];
  }, [chartData, milestones]);

  // A live-only drawdown can disappear on recovery. Do not retain its selection.
  if (
    activeMilestone !== null &&
    !visibleMilestones.some((events) => events.some((event) => event.kind === activeMilestone))
  ) {
    setActiveMilestone(null);
  }

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

    const values = chartData.map((d) => (chartMode === 'percent' ? d.percentChange : d.value));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;

    // Add 10% padding on each side, but don't go below 0
    const padding =
      range > 0 ? range * 0.1 : chartMode === 'percent' ? 1 : Math.max(Math.abs(max) * 0.05, 1);
    const domainMin = chartMode === 'percent' ? min - padding : Math.max(0, min - padding);
    const domainMax = max + padding;

    return [domainMin, domainMax];
  }, [chartData, chartMode]);

  // Determine tick interval - always aim for ~5-6 evenly spaced ticks (CoinGecko style)
  // This ensures consistent visual density regardless of data granularity
  const tickInterval = useMemo(() => {
    const dataLength = chartData.length;
    if (dataLength <= 6) return 0; // Show all ticks for very short data
    // Calculate interval to show approximately 5-6 ticks
    const targetTicks = Math.max(1, Math.min(5, Math.floor((chartWidth - 112) / 80)));
    return Math.max(1, Math.floor((dataLength - 1) / targetTicks));
  }, [chartData.length, chartWidth]);

  const periods: TimePeriod[] = ['7D', '1M', '3M', '1Y', 'YTD', 'Max'];
  const lastChartPoint = chartData[chartData.length - 1];
  const chartAnimationKey = `${period}-${chartMode}-${chartData[0]?.timestamp ?? 'empty'}-${
    lastChartPoint?.timestamp ?? 'empty'
  }`;
  const chartDataKey = chartMode === 'percent' ? 'percentChange' : 'value';
  const formattedCurrencyChange = valueChange
    ? formatSignedCurrency(valueChange.change, currency, 0)
    : '';

  return (
    <Card ref={chartRef} className="chart-card col-span-2">
      <CardHeader className="pb-4">
        <div className="chart-toolbar-layout flex flex-col gap-3">
          <div className="chart-title-layout flex min-w-0 flex-col gap-1">
            <CardTitle className="text-base">Portfolio Value</CardTitle>
            {valueChange && (
              <div className={`text-sm ${valueChange.change >= 0 ? 'text-profit' : 'text-loss'}`}>
                <span className="font-medium">
                  {chartMode === 'percent'
                    ? formatPercent(valueChange.changePercent)
                    : formattedCurrencyChange}
                </span>
                <span className="ml-1 text-xs">
                  (
                  {chartMode === 'percent'
                    ? formattedCurrencyChange
                    : formatPercent(valueChange.changePercent)}
                  )
                </span>
              </div>
            )}
          </div>
          <div className="-mx-1 overflow-x-auto pb-1">
            <div className="flex w-max items-center gap-2 px-1">
              <div className="flex rounded-md border" aria-label="Chart value mode">
                <Button
                  type="button"
                  variant={chartMode === 'value' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-r-none sm:h-8 sm:w-8"
                  onClick={() => {
                    setActiveMilestone(null);
                    setChartMode('value');
                  }}
                  aria-label="Show portfolio value in currency"
                  aria-pressed={chartMode === 'value'}
                  title="Currency value"
                >
                  <DollarSign className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant={chartMode === 'percent' ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-11 w-11 rounded-l-none sm:h-8 sm:w-8"
                  onClick={() => {
                    setActiveMilestone(null);
                    setChartMode('percent');
                  }}
                  aria-label="Show portfolio value as percentage change"
                  aria-pressed={chartMode === 'percent'}
                  title="Percentage change"
                >
                  <Percent className="h-4 w-4" />
                </Button>
              </div>
              <ChartCopyButton targetRef={chartRef} chartName="Portfolio value" />
              <div className="flex rounded-md border">
                {periods.map((p) => (
                  <Button
                    key={p}
                    variant={period === p ? 'secondary' : 'ghost'}
                    size="sm"
                    className={`h-11 px-3 rounded-none transition-colors duration-200 first:rounded-l-md last:rounded-r-md sm:h-8 ${
                      period === p ? '' : 'hover:bg-muted'
                    }`}
                    onClick={() => {
                      setActiveMilestone(null);
                      setPeriod(p);
                    }}
                    aria-pressed={period === p}
                  >
                    {p}
                  </Button>
                ))}
              </div>
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
          <div
            key={chartAnimationKey}
            className="relative animate-chart-period-change"
            onMouseDown={(event) => {
              // Recharts resets the tooltip to its first date on SVG focus.
              // Preserve pointer selection, including clicks on its active-dot overlay.
              if (
                event.target instanceof Element &&
                event.target.closest('svg[role="application"]')
              ) {
                event.preventDefault();
              }
            }}
          >
            {isFetching && (
              <div className="absolute inset-0 z-10 flex items-center justify-center">
                <span className="text-sm text-muted-foreground animate-pulse">Loading...</span>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300} onResize={setChartWidth}>
              <AreaChart
                accessibilityLayer
                aria-label="Portfolio value history. Use arrow keys to inspect dates and milestones."
                data={chartData}
                margin={{ top: 5, right: 56, left: 0, bottom: 5 }}
              >
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
                  tickFormatter={(value) =>
                    chartMode === 'percent'
                      ? formatPercentAxisTick(value, yAxisDomain[1] - yAxisDomain[0])
                      : formatCurrency(value, currency, true)
                  }
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                  width={56}
                />
                <Tooltip
                  content={renderTooltip}
                  active={activeMilestone ? false : undefined}
                  cursor={activeMilestone ? false : undefined}
                />
                {chartData.length > 0 && (
                  <ReferenceLine
                    y={chartMode === 'percent' ? 0 : chartData[0].value}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                    strokeDasharray="4 4"
                  />
                )}
                <Area
                  type="monotone"
                  dataKey={chartDataKey}
                  isAnimationActive={false}
                  stroke={PORTFOLIO_LINE_COLOR}
                  strokeWidth={2}
                  fill="url(#portfolioGradient)"
                  dot={(props: RechartsAreaDotProps) => {
                    const { cx, cy, index } = props;
                    const dotKey = chartData[index]?.timestamp ?? `${cx}-${cy}`;
                    const point = chartData[index];
                    const isLast = index === chartData.length - 1;
                    if (!point || (!isLast && point.milestones.length === 0))
                      return <g key={`portfolio-dot-${dotKey}`} />;
                    const event =
                      point.milestones.find((item) => item.kind === 'mdd') ?? point.milestones[0];
                    const highlighted = point.milestones.some(
                      (item) => item.kind === activeMilestone
                    );
                    return (
                      <g key={`portfolio-dot-${dotKey}`}>
                        <g
                          transform={`translate(${cx}, ${cy})`}
                          className="cursor-help"
                          data-portfolio-milestone={point.milestones
                            .map((item) => item.kind)
                            .join(' ')}
                          data-highlighted={highlighted ? 'true' : undefined}
                        >
                          <title>
                            {point.milestones
                              .map(
                                (item) =>
                                  `${PORTFOLIO_MILESTONE_LABELS[item.kind]}: ${PORTFOLIO_MILESTONE_EXPLANATIONS[item.kind]}`
                              )
                              .join(' ')}{' '}
                            — {point.tooltipDate}
                          </title>
                          <PortfolioMilestoneGlyph
                            kind={event?.kind ?? 'live'}
                            highlighted={highlighted}
                          />
                        </g>
                        {isLast && (
                          <>
                            <text
                              x={cx + 8}
                              y={cy}
                              fontSize={11}
                              dominantBaseline="middle"
                              fontWeight={500}
                              fill="currentColor"
                              opacity={0.7}
                            >
                              {chartMode === 'percent'
                                ? formatPercent(chartData[index].percentChange)
                                : formatCurrency(chartData[index].value, currency, true)}
                            </text>
                            {point.isLive && (
                              <text
                                x={cx + 8}
                                y={cy + 15}
                                fontSize={10}
                                fill="currentColor"
                                className="text-muted-foreground"
                              >
                                Live
                              </text>
                            )}
                          </>
                        )}
                      </g>
                    );
                  }}
                  activeDot={activeMilestone ? false : { r: 4, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
            {visibleMilestones.length > 0 && (
              <PortfolioMilestoneLegend
                groups={visibleMilestones}
                activeKind={activeMilestone}
                onActiveChange={handleMilestoneActiveChange}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
