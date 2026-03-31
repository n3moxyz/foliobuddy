import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { formatCurrency, formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useAnimatedNumber } from '@/hooks/useAnimatedNumber';
import type { PortfolioSummary } from '@/lib/types';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  valueUsd30dAgo?: number;
  exposurePct?: number;
  positionCount?: number;
  closedTrades?: number;
  investorLabel?: string;
}

export function NetWorthCard({
  summary,
  currency,
  stakeMultiplier = 1,
  valueUsd30dAgo,
  exposurePct,
  positionCount = 0,
  closedTrades = 0,
  investorLabel,
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
  const pnlValue = convert(summary.unrealizedPnL);
  const costBasisValue = convert(summary.totalCostBasis);
  const isPositive = summary.unrealizedPnL >= 0;

  // Animated numbers — smooth count on value changes
  const animatedValue = useAnimatedNumber(value);
  const animatedPnl = useAnimatedNumber(pnlValue);
  const animatedCostBasis = useAnimatedNumber(costBasisValue);

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
  const animatedAltValue = useAnimatedNumber(altValue);

  return (
    <div className="pb-6 mb-2 border-b">
      <p className="text-sm font-medium text-muted-foreground mb-2">
        Net Worth{investorLabel && ` (${investorLabel})`}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-4xl font-bold tracking-tight sm:text-5xl tabular-nums">
          {formatCurrency(animatedValue, currency, 0)}
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

      {/* Desktop: equal-width grid with dividers */}
      <div className="mt-4 hidden sm:grid sm:grid-cols-6 divide-x divide-border">
        <div className="pr-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">YTD P&L</p>
            <HelpTooltip content="Unrealized profit/loss since January 1st" />
          </div>
          <p className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}>
            {formatCurrency(animatedPnl, currency, 0)}
            <span className={`text-xs ml-1.5 ${getPnLColorClass(summary.unrealizedPnLPct)}`}>
              {formatPercent(summary.unrealizedPnLPct)}
            </span>
          </p>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">YTD Start</p>
            <HelpTooltip content="Total cost basis of your portfolio as of January 1st" />
          </div>
          <p className="font-medium tabular-nums">
            {formatCurrency(animatedCostBasis, currency, 0)}
          </p>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">vs 30D ago</p>
            <HelpTooltip content="Portfolio value change compared to 30 days ago" />
          </div>
          {change30d ? (
            <p className={`font-medium tabular-nums ${getPnLColorClass(change30d.diff)}`}>
              {formatPercent(change30d.pct)}
            </p>
          ) : (
            <p className="font-medium tabular-nums text-muted-foreground">—</p>
          )}
        </div>
        <Link to="/portfolio" className="px-4 hover:text-primary transition-colors">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Exposure</p>
            <HelpTooltip content="Percentage of portfolio in non-stablecoin crypto (including perps)" />
          </div>
          <p className="font-medium tabular-nums">
            {exposurePct !== undefined ? `${exposurePct.toFixed(1)}%` : '—'}
          </p>
        </Link>
        <Link to="/portfolio" className="px-4 hover:text-primary transition-colors">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Positions</p>
            <HelpTooltip content="Number of active positions in your portfolio" />
          </div>
          <p className="font-medium tabular-nums">{positionCount}</p>
        </Link>
        <Link to="/trades" className="pl-4 hover:text-primary transition-colors">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Trades</p>
            <HelpTooltip content="Total number of completed trades" />
          </div>
          <p className="font-medium tabular-nums">{closedTrades}</p>
        </Link>
      </div>

      {/* Mobile: 2-column grid */}
      <div className="mt-4 sm:hidden grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground text-sm">YTD P&L</p>
          <p className={`font-medium tabular-nums ${getPnLColorClass(summary.unrealizedPnL)}`}>
            {formatCurrency(animatedPnl, currency, 0)}
            <span className={`text-xs ml-1.5 block ${getPnLColorClass(summary.unrealizedPnLPct)}`}>
              {formatPercent(summary.unrealizedPnLPct)}
            </span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-sm">YTD Start</p>
          <p className="font-medium tabular-nums">
            {formatCurrency(animatedCostBasis, currency, 0)}
          </p>
        </div>
        {exposurePct !== undefined && (
          <Link to="/portfolio" className="hover:text-primary transition-colors">
            <p className="text-muted-foreground text-sm">Exposure</p>
            <p className="font-medium tabular-nums">{exposurePct.toFixed(1)}%</p>
          </Link>
        )}
        <Link to="/portfolio" className="hover:text-primary transition-colors">
          <p className="text-muted-foreground text-sm">Positions</p>
          <p className="font-medium tabular-nums">{positionCount}</p>
        </Link>
        {change30d && (
          <div>
            <p className="text-muted-foreground text-sm">vs 30D ago</p>
            <p className={`font-medium tabular-nums ${getPnLColorClass(change30d.diff)}`}>
              {formatPercent(change30d.pct)}
            </p>
          </div>
        )}
        <Link to="/trades" className="hover:text-primary transition-colors">
          <p className="text-muted-foreground text-sm">Trades</p>
          <p className="font-medium tabular-nums">{closedTrades}</p>
        </Link>
      </div>

      <p className="text-xs text-muted-foreground mt-4">
        {currency === 'USD' ? 'SGD' : 'USD'} Value:{' '}
        {formatCurrency(animatedAltValue, currency === 'USD' ? 'SGD' : 'USD', 0)}
      </p>
    </div>
  );
}
