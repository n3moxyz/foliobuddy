import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/api';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
}

export function NetWorthCard({ summary, currency, stakeMultiplier = 1 }: NetWorthCardProps) {
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

  // Alternate currency value with stake multiplier
  const altValue = currency === 'USD'
    ? summary.totalValueSgd * stakeMultiplier
    : summary.totalValueUsd * stakeMultiplier;

  return (
    <Card className="bg-gradient-to-br from-primary/10 to-primary/5">
      <CardHeader>
        <CardTitle className="text-lg font-medium text-muted-foreground">
          Net Worth
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-4">
          <span className="text-4xl font-bold tracking-tight">
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

        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
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
