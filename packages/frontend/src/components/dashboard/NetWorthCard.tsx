import { useMemo } from 'react';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/types';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  valueUsd30dAgo?: number;
}

export function NetWorthCard({
  summary,
  currency,
  stakeMultiplier = 1,
  valueUsd30dAgo,
}: NetWorthCardProps) {
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
  const altValue =
    currency === 'USD'
      ? summary.totalValueSgd * stakeMultiplier
      : summary.totalValueUsd * stakeMultiplier;

  return (
    <div className="pb-6 mb-2 border-b">
      <p className="text-sm font-medium text-muted-foreground mb-2">Net Worth</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-4xl font-bold tracking-tight sm:text-5xl tabular-nums">
          {formatCurrency(value, currency, 0)}
        </span>
        <div
          className={`flex items-center gap-1 text-lg ${getPnLColorClass(summary.unrealizedPnL)}`}
        >
          {isPositive ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
          <span className="font-semibold tabular-nums">
            {formatPercent(summary.unrealizedPnLPct)}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-6 flex-wrap">
        <div>
          <p className="text-muted-foreground text-sm">YTD P&L</p>
          <p className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}>
            {formatCurrency(convert(summary.unrealizedPnL), currency, 0)}
          </p>
        </div>
        <div className="border-r pr-6"></div>
        <div>
          <p className="text-muted-foreground text-sm">YTD Start</p>
          <p className="font-medium tabular-nums">
            {formatCurrency(convert(summary.totalCostBasis), currency, 0)}
          </p>
        </div>
        {change30d && (
          <>
            <div className="border-r pr-6"></div>
            <div>
              <p className="text-muted-foreground text-sm">vs 30D ago</p>
              <p className={`font-medium tabular-nums ${getPnLColorClass(change30d.diff)}`}>
                {formatPercent(change30d.pct)}
              </p>
            </div>
          </>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        {currency === 'USD' ? 'SGD' : 'USD'} Value:{' '}
        {formatCurrency(altValue, currency === 'USD' ? 'SGD' : 'USD', 0)}
      </p>
    </div>
  );
}
