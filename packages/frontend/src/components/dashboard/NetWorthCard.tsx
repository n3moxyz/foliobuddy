import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/api';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  valueUsd30dAgo?: number;
}

export function NetWorthCard({ summary, currency, stakeMultiplier = 1, valueUsd30dAgo }: NetWorthCardProps) {
  // Calculate FX rate from summary
  const fxRate = useMemo(() => {
    if (summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return 1.35;
  }, [summary]);

  // Helper to convert values based on currency and apply stake multiplier
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    const converted = currency === 'SGD' ? usdValue * fxRate : usdValue;
    return converted * stakeMultiplier;
  };

  const value = convert(summary.totalValueUsd);
  const isPositive = summary.unrealizedPnL >= 0;

  // 30-day period comparison
  const change30d = useMemo(() => {
    if (valueUsd30dAgo === undefined || valueUsd30dAgo === 0) return null;
    const currentUsd = summary.totalValueUsd * stakeMultiplier;
    const previousUsd = valueUsd30dAgo * stakeMultiplier;
    const diff = currentUsd - previousUsd;
    const pct = (diff / previousUsd) * 100;
    return { diff, pct };
  }, [summary.totalValueUsd, valueUsd30dAgo, stakeMultiplier]);

  // Alternate currency value with stake multiplier
  const altValue = currency === 'USD'
    ? summary.totalValueSgd * stakeMultiplier
    : summary.totalValueUsd * stakeMultiplier;

  return (
    <Card className="bg-gradient-to-br from-primary/15 via-primary/8 to-background border-primary/20">
      <CardHeader>
        <CardTitle className="text-lg font-medium text-muted-foreground">
          Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
          <span className="text-3xl font-bold tracking-tight sm:text-4xl">
            {formatCurrency(value, currency, 0)}
          </span>
          <div className={`flex items-center gap-1 ${getPnLColorClass(summary.unrealizedPnL)}`}>
            {isPositive ? (
              <TrendingUp className="h-5 w-5" />
            ) : (
              <TrendingDown className="h-5 w-5" />
            )}
            <span className="font-semibold">
              {formatPercent(summary.unrealizedPnLPct)}
            </span>
          </div>
        </div>

        <div
          className={`mt-4 grid gap-3 text-sm ${
            change30d ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          <div>
            <p className="text-muted-foreground">YTD P&L</p>
            <p className={`font-medium ${getPnLColorClass(summary.unrealizedPnL)}`}>
              {formatCurrency(convert(summary.unrealizedPnL), currency, 0)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">YTD Start</p>
            <p className="font-medium">
              {formatCurrency(convert(summary.totalCostBasis), currency, 0)}
            </p>
          </div>
          {change30d && (
            <div>
              <p className="text-muted-foreground">vs 30D ago</p>
              <p className={`font-medium ${getPnLColorClass(change30d.diff)}`}>
                {change30d.diff >= 0 ? '+' : ''}{formatPercent(change30d.pct)}
              </p>
            </div>
          )}
        </div>

        {/* Show alternate currency value */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground">
            {currency === 'USD' ? 'SGD' : 'USD'} Value:{' '}
            {formatCurrency(
              altValue,
              currency === 'USD' ? 'SGD' : 'USD',
              0
            )}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
