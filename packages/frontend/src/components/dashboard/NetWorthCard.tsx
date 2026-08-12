import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useAnimatedNumbers } from '@/hooks/useAnimatedNumber';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { PortfolioSummary } from '@/lib/types';
import { cn, formatDrawdown, formatPercent, getPnLColorClass } from '@/lib/utils';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  ytdAthUsd?: number | null;
  drawdownFromAthPct?: number | null;
  maxDrawdownPct?: number | null;
  maxDailyDrawdownPct?: number | null;
  exposurePct?: number;
  positionCount?: number;
  closedTrades?: number;
  investorLabel?: string;
}

interface NetWorthStat {
  label: string;
  help: string;
  value: ReactNode;
  valueClassName?: string;
  to?: string;
  linkDescription?: string;
}

interface NetWorthStatCellProps extends NetWorthStat {
  index: number;
}

function statCellClassName(index: number) {
  return cn(
    'min-w-0 snap-start px-3 pb-4',
    index > 0 && 'border-l',
    index === 0 && 'pl-0 pr-3',
    index === 8 && 'pl-3 pr-0'
  );
}

function NetWorthStatCell({
  index,
  label,
  help,
  value,
  valueClassName,
  to,
  linkDescription,
}: NetWorthStatCellProps) {
  const valueContent = (
    <span
      className={cn(
        'whitespace-nowrap text-sm font-medium tabular-nums 2xl:text-base',
        valueClassName
      )}
    >
      {value}
    </span>
  );

  return (
    <div className={statCellClassName(index)} data-testid="net-worth-stat">
      <div className="flex items-center gap-1 whitespace-nowrap">
        <p className="text-xs text-muted-foreground 2xl:text-sm">{label}</p>
        <HelpTooltip label={label} content={help} />
      </div>
      {to ? (
        <Link to={to} className="block transition-colors hover:text-primary">
          {valueContent}
          <span className="sr-only"> {linkDescription}</span>
        </Link>
      ) : (
        <p>{valueContent}</p>
      )}
    </div>
  );
}

export function NetWorthCard({
  summary,
  currency,
  stakeMultiplier = 1,
  ytdAthUsd,
  drawdownFromAthPct,
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
  const ytdAthValue = convert(ytdAthUsd);
  const isPositive = summary.unrealizedPnL >= 0;

  const altValue =
    currency === 'USD'
      ? summary.totalValueSgd * stakeMultiplier
      : summary.totalValueUsd * stakeMultiplier;

  // One shared rAF loop for every animated monetary figure in the hero.
  const [animatedValue, animatedPnl, animatedCostBasis, animatedYtdAth, animatedAltValue] =
    useAnimatedNumbers([value, pnlValue, costBasisValue, ytdAthValue, altValue]);

  const stats: NetWorthStat[] = [
    {
      label: 'YTD P&L',
      help: 'Unrealized profit or loss since January 1',
      value: (
        <>
          {formatCurrency(animatedPnl, currency, 0)}
          <span className="mt-0.5 block text-xs 2xl:ml-1.5 2xl:mt-0 2xl:inline">
            {formatPercent(summary.unrealizedPnLPct)}
          </span>
        </>
      ),
      valueClassName: getPnLColorClass(summary.unrealizedPnL),
    },
    {
      label: 'YTD Start',
      help: 'Total cost basis of your portfolio as of January 1',
      value: formatCurrency(animatedCostBasis, currency, 0),
    },
    {
      label: 'YTD ATH',
      help: 'Highest portfolio value in the year-to-date history, including the current value',
      value: ytdAthUsd == null ? 'N/A' : formatCurrency(animatedYtdAth, currency, 0),
    },
    {
      label: 'MDD',
      help: 'Largest peak-to-trough decline in your portfolio since January 1',
      value: formatDrawdown(maxDrawdownPct),
      valueClassName: maxDrawdownPct && maxDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground',
    },
    {
      label: 'MDD (1D)',
      help: 'Largest day-over-day decline in your portfolio since January 1',
      value: formatDrawdown(maxDailyDrawdownPct),
      valueClassName:
        maxDailyDrawdownPct && maxDailyDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground',
    },
    {
      label: 'DD from ATH',
      help: 'How far your portfolio is currently below its year-to-date high',
      value: formatDrawdown(drawdownFromAthPct),
      valueClassName:
        drawdownFromAthPct && drawdownFromAthPct > 0 ? 'text-loss' : 'text-muted-foreground',
    },
    {
      label: 'Exposure',
      help: 'Percentage of portfolio in market-risk assets, excluding stablecoins and cash, including perps',
      value: exposurePct === undefined ? 'N/A' : `${exposurePct.toFixed(1)}%`,
      to: '/portfolio',
      linkDescription: '— view portfolio',
    },
    {
      label: 'Positions',
      help: 'Number of active positions in your portfolio',
      value: positionCount,
      to: '/portfolio',
      linkDescription: 'positions — view portfolio',
    },
    {
      label: 'Trades',
      help: 'Total number of completed trades',
      value: closedTrades,
      to: '/trades',
      linkDescription: 'trades — view trade journal',
    },
  ];

  return (
    <div className="mb-2 border-b pb-2">
      <h2 className="mb-2 text-sm font-medium text-muted-foreground">
        Net Worth{investorLabel && ` (${investorLabel})`}
      </h2>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:gap-3">
        <span className="text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
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

      <p id="net-worth-stats-instructions" className="sr-only">
        Scroll horizontally to view all portfolio statistics on narrower screens.
      </p>
      <div
        className="-mx-4 mt-4 overflow-x-auto overscroll-x-contain px-4 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:mx-0 sm:px-0 xl:overflow-visible"
        role="region"
        aria-label="Net worth statistics"
        aria-describedby="net-worth-stats-instructions"
        tabIndex={0}
        data-testid="net-worth-stat-grid"
      >
        <div className="grid min-w-max snap-x snap-proximity grid-flow-col auto-cols-[9rem] xl:min-w-0 xl:snap-none xl:grid-flow-row xl:grid-cols-9 xl:auto-cols-auto">
          {stats.map((stat, index) => (
            <NetWorthStatCell key={stat.label} {...stat} index={index} />
          ))}
        </div>
      </div>

      <p className="mt-1 pb-2 text-xs text-muted-foreground">
        {currency === 'USD' ? 'SGD' : 'USD'} Value:{' '}
        {formatCurrency(animatedAltValue, currency === 'USD' ? 'SGD' : 'USD', 0)}
      </p>
    </div>
  );
}
