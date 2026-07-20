import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import { formatPercent, getPnLColorClass } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useAnimatedNumbers } from '@/hooks/useAnimatedNumber';
import type { PortfolioSummary } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  maxDrawdownPct?: number | null;
  maxDailyDrawdownPct?: number | null;
  exposurePct?: number;
  positionCount?: number;
  closedTrades?: number;
  investorLabel?: string;
}

export function NetWorthCard({
  summary,
  currency,
  stakeMultiplier = 1,
  maxDrawdownPct,
  maxDailyDrawdownPct,
  exposurePct,
  positionCount = 0,
  closedTrades = 0,
  investorLabel,
}: NetWorthCardProps) {
  const { formatCurrency } = useMoneyFormatter();
  const fxRate = useMemo(() => {
    if (summary.totalValueUsd > 0 && summary.totalValueSgd > 0) {
      return summary.totalValueSgd / summary.totalValueUsd;
    }
    return USD_SGD_FALLBACK_RATE;
  }, [summary]);

  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    const converted = currency === 'SGD' ? usdValue * fxRate : usdValue;
    return converted * stakeMultiplier;
  };

  const value = convert(summary.totalValueUsd);
  const pnlValue = convert(summary.unrealizedPnL);
  const costBasisValue = convert(summary.totalCostBasis);
  const isPositive = summary.unrealizedPnL >= 0;

  const altValue =
    currency === 'USD'
      ? summary.totalValueSgd * stakeMultiplier
      : summary.totalValueUsd * stakeMultiplier;

  // One shared rAF loop for all four headline figures (previously four separate loops)
  const [animatedValue, animatedPnl, animatedCostBasis, animatedAltValue] = useAnimatedNumbers([
    value,
    pnlValue,
    costBasisValue,
    altValue,
  ]);

  const formatDrawdown = (drawdownPct: number | null | undefined) =>
    drawdownPct === null || drawdownPct === undefined
      ? 'N/A'
      : drawdownPct === 0
        ? '0.00%'
        : `-${drawdownPct.toFixed(2)}%`;

  return (
    <div className="pb-6 mb-2 border-b">
      <h2 className="text-sm font-medium text-muted-foreground mb-2">
        Net Worth{investorLabel && ` (${investorLabel})`}
      </h2>

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

      <div className="mt-4 hidden sm:grid sm:grid-cols-7 divide-x divide-border">
        <div className="pr-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">YTD P&L</p>
            <HelpTooltip label="YTD P&L" content="Unrealized profit/loss since January 1st" />
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
            <HelpTooltip
              label="YTD Start"
              content="Total cost basis of your portfolio as of January 1st"
            />
          </div>
          <p className="font-medium tabular-nums">
            {formatCurrency(animatedCostBasis, currency, 0)}
          </p>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">MDD</p>
            <HelpTooltip
              label="MDD"
              content="Maximum drawdown: the largest peak-to-trough decline in your portfolio since January 1st"
            />
          </div>
          <p
            className={`font-medium tabular-nums ${
              maxDrawdownPct && maxDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground'
            }`}
          >
            {formatDrawdown(maxDrawdownPct)}
          </p>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">MDD (1D)</p>
            <HelpTooltip
              label="MDD (1D)"
              content="Largest day-over-day decline in your portfolio since January 1st"
            />
          </div>
          <p
            className={`font-medium tabular-nums ${
              maxDailyDrawdownPct && maxDailyDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground'
            }`}
          >
            {formatDrawdown(maxDailyDrawdownPct)}
          </p>
        </div>
        {/* Tooltip buttons sit OUTSIDE the links — interactive content nested
            inside an <a> is invalid HTML and confuses assistive tech. */}
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Exposure</p>
            <HelpTooltip
              label="Exposure"
              content="Percentage of portfolio in market-risk assets, excluding stablecoins and cash, including perps"
            />
          </div>
          <Link
            to="/portfolio"
            className="block font-medium tabular-nums transition-colors hover:text-primary"
          >
            {exposurePct !== undefined ? `${exposurePct.toFixed(1)}%` : 'N/A'}
            <span className="sr-only"> — view portfolio</span>
          </Link>
        </div>
        <div className="px-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Positions</p>
            <HelpTooltip label="Positions" content="Number of active positions in your portfolio" />
          </div>
          <Link
            to="/portfolio"
            className="block font-medium tabular-nums transition-colors hover:text-primary"
          >
            {positionCount}
            <span className="sr-only"> positions — view portfolio</span>
          </Link>
        </div>
        <div className="pl-4">
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">Trades</p>
            <HelpTooltip label="Trades" content="Total number of completed trades" />
          </div>
          <Link
            to="/trades"
            className="block font-medium tabular-nums transition-colors hover:text-primary"
          >
            {closedTrades}
            <span className="sr-only"> trades — view trade journal</span>
          </Link>
        </div>
      </div>

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
        <div>
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">MDD</p>
            <HelpTooltip
              label="MDD"
              content="Maximum drawdown: the largest peak-to-trough decline in your portfolio since January 1st"
            />
          </div>
          <p
            className={`font-medium tabular-nums ${
              maxDrawdownPct && maxDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground'
            }`}
          >
            {formatDrawdown(maxDrawdownPct)}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1">
            <p className="text-muted-foreground text-sm">MDD (1D)</p>
            <HelpTooltip
              label="MDD (1D)"
              content="Largest day-over-day decline in your portfolio since January 1st"
            />
          </div>
          <p
            className={`font-medium tabular-nums ${
              maxDailyDrawdownPct && maxDailyDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground'
            }`}
          >
            {formatDrawdown(maxDailyDrawdownPct)}
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
