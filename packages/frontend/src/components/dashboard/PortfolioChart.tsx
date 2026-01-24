import { useState, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePerformanceHistory } from '@/hooks/usePortfolio';
import { formatCurrency, formatDate } from '@/lib/utils';

type TimePeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | 'YTD' | 'ALL';

interface PortfolioChartProps {
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  stakeMultiplier?: number;
}

function getDateRange(period: TimePeriod): { from?: string; to?: string; days?: number } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case '1W':
      return { days: 7 };
    case '1M':
      return { days: 30 };
    case '3M':
      return { days: 90 };
    case '6M':
      return { days: 180 };
    case '1Y':
      return { days: 365 };
    case 'YTD': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear.toISOString(), to: today.toISOString() };
    }
    case 'ALL':
      return {}; // No date filter - get all data
    default:
      return { days: 30 };
  }
}

export function PortfolioChart({ currency = 'USD', fxRate = 1, stakeMultiplier = 1 }: PortfolioChartProps) {
  const [period, setPeriod] = useState<TimePeriod>('1M');

  const dateRange = useMemo(() => getDateRange(period), [period]);
  const { data: performanceData, isLoading } = usePerformanceHistory(dateRange);

  // Calculate chart data with stake multiplier from parent
  const chartData = useMemo(() => {
    if (!performanceData || performanceData.length === 0) return [];

    return performanceData.map((point) => {
      const baseValue = currency === 'SGD'
        ? (point.totalValueSgd ?? point.totalValueUsd * fxRate)
        : point.totalValueUsd;

      return {
        date: formatDate(point.timestamp),
        timestamp: point.timestamp,
        value: baseValue * stakeMultiplier,
        fullValue: baseValue,
      };
    });
  }, [performanceData, stakeMultiplier, currency, fxRate]);

  // Calculate change from first to last point
  const valueChange = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = chartData[0].value;
    const last = chartData[chartData.length - 1].value;
    const change = last - first;
    const changePercent = first > 0 ? ((last - first) / first) * 100 : 0;
    return { change, changePercent };
  }, [chartData]);

  const periods: TimePeriod[] = ['1W', '1M', '3M', '6M', '1Y', 'YTD', 'ALL'];

  return (
    <Card className="col-span-2">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle>Portfolio Value</CardTitle>
            {valueChange && (
              <div className={`text-sm ${valueChange.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
          {/* Time Period Selector */}
          <div className="flex rounded-md border">
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
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart data...</div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <p>No performance data available</p>
              <p className="text-xs mt-1">Create a snapshot to start tracking your portfolio</p>
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
              />
              <YAxis
                tickFormatter={(value) => formatCurrency(value, currency, true)}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                className="text-muted-foreground"
                width={80}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="rounded-lg border bg-background p-3 shadow-md">
                      <p className="text-xs text-muted-foreground mb-1">{data.date}</p>
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
              <Line
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
