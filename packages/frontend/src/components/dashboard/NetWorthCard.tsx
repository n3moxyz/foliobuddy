import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { PortfolioSummary } from '@/lib/api';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
}

export function NetWorthCard({ summary, currency }: NetWorthCardProps) {
  const value = currency === 'USD' ? summary.totalValueUsd : summary.totalValueSgd;
  const isPositive = summary.unrealizedPnL >= 0;

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
            {formatCurrency(value, currency)}
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
            <p className="text-muted-foreground">Unrealized P&L</p>
            <p className={`font-medium ${getPnLColorClass(summary.unrealizedPnL)}`}>
              {formatCurrency(summary.unrealizedPnL, 'USD')}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Cost Basis</p>
            <p className="font-medium">
              {formatCurrency(summary.totalCostBasis, 'USD')}
            </p>
          </div>
        </div>

        {currency === 'USD' && summary.totalValueSgd > 0 && (
          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              SGD Value: {formatCurrency(summary.totalValueSgd, 'SGD')}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
