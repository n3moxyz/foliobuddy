import { formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Performer } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { AssetLabel } from '@/components/ui/asset-label';

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
  const { formatCurrency } = useMoneyFormatter();
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
        {/* Index suffix is required: the same asset can appear twice (multiple
            positions per asset) — see PerformersCard.test duplicate-keys case. */}
        {performers.map((performer, index) => (
          <div
            key={`${performer.assetId}-${index}`}
            className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <span className="w-4 shrink-0 text-xs tabular-nums text-muted-foreground">
                {index + 1}
              </span>
              <AssetLabel asset={performer} />
            </div>
            <div className="shrink-0 whitespace-nowrap text-right">
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
