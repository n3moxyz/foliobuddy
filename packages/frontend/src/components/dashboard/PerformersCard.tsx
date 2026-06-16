import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Performer } from '@/lib/types';

interface PerformersCardProps {
  title: string;
  performers: Performer[];
  type: 'top' | 'worst';
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  stakeMultiplier?: number;
}

export function PerformersCard({
  title,
  performers,
  type,
  currency = 'USD',
  fxRate = 1,
  stakeMultiplier = 1,
}: PerformersCardProps) {
  // Helper to convert values based on currency and apply stake multiplier
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    const converted = currency === 'SGD' ? usdValue * fxRate : usdValue;
    return converted * stakeMultiplier;
  };

  if (performers.length === 0) {
    return (
      <div className="pb-4">
        <h2 className="flex items-center gap-2 font-medium mb-3">
          {type === 'top' ? (
            <TrendingUp className="h-4 w-4 text-profit opacity-70" />
          ) : (
            <TrendingDown className="h-4 w-4 text-loss opacity-70" />
          )}
          {title}
        </h2>
        <p className="text-muted-foreground text-sm">No positions yet</p>
      </div>
    );
  }

  return (
    <div className="pb-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        {type === 'top' ? (
          <TrendingUp className="h-4 w-4 text-profit opacity-70" />
        ) : (
          <TrendingDown className="h-4 w-4 text-loss opacity-70" />
        )}
        {title}
      </h2>
      <div className="divide-y">
        {performers.map((performer, index) => (
          <div
            key={performer.assetId}
            className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
          >
            <div className="flex items-center gap-3">
              <span className="text-muted-foreground text-xs tabular-nums w-4">{index + 1}</span>
              <div>
                <p className="font-medium text-sm">{performer.symbol}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[160px] sm:max-w-[200px]">
                  {performer.name}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={`font-semibold tabular-nums ${getPnLColorClass(performer.unrealizedPnL)}`}
              >
                {formatCurrency(convert(performer.unrealizedPnL), currency, 0)}
              </p>
              <p className={`text-xs ${getPnLColorClass(performer.unrealizedPnLPct)}`}>
                {formatPercent(performer.unrealizedPnLPct)}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
