import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { USD_SGD_FALLBACK_RATE } from '@foliobuddy/shared';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import { useAnimatedNumbers } from '@/hooks/useAnimatedNumber';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { PortfolioSummary } from '@/lib/types';
import { cn, formatDrawdown, formatPercent, getPnLColorClass } from '@/lib/utils';
import { formatMilestoneDate } from '@/lib/portfolioHistory';

interface NetWorthCardProps {
  summary: PortfolioSummary;
  currency: 'USD' | 'SGD';
  stakeMultiplier?: number;
  ytdAthUsd?: number | null;
  ytdAthDate?: string | null;
  drawdownFromAthPct?: number | null;
  maxDrawdownPct?: number | null;
  maxDrawdownDate?: string | null;
  maxDailyDrawdownPct?: number | null;
  maxDailyDrawdownDate?: string | null;
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
  recordedAt?: string | null;
  isLive?: boolean;
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
  recordedAt,
  isLive,
}: NetWorthStatCellProps) {
  const dateLabel = formatMilestoneDate(recordedAt);
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
        // `relative` keeps the absolutely positioned sr-only text inside the scroll rail; without
        // a positioned ancestor in the rail it escapes and the whole page scrolls sideways.
        <Link to={to} className="relative block transition-colors hover:text-primary">
          {valueContent}
          <span className="sr-only"> {linkDescription}</span>
        </Link>
      ) : (
        <p>{valueContent}</p>
      )}
      {(dateLabel || isLive) && (
        <p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground 2xl:text-xs">
          {isLive ? (
            'Today (Live)'
          ) : (
            <>
              (<time dateTime={recordedAt!}>{dateLabel}</time>)
            </>
          )}
        </p>
      )}
    </div>
  );
}

export function NetWorthCard({
  summary,
  currency,
  stakeMultiplier = 1,
  ytdAthUsd,
  ytdAthDate,
  drawdownFromAthPct,
  maxDrawdownPct,
  maxDrawdownDate,
  maxDailyDrawdownPct,
  maxDailyDrawdownDate,
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
      help: 'First recorded portfolio value this year. The date below shows the actual starting snapshot.',
      value: formatCurrency(animatedCostBasis, currency, 0),
      recordedAt: summary.ytdStartDate,
    },
    {
      label: 'YTD ATH',
      help: 'Highest USD portfolio value this year, including the current value. Displayed in your selected currency.',
      value: ytdAthUsd == null ? 'N/A' : formatCurrency(animatedYtdAth, currency, 0),
      recordedAt: ytdAthDate,
    },
    {
      label: 'MDD',
      help: 'Largest peak-to-trough decline in USD this year. The date below marks the trough.',
      value: formatDrawdown(maxDrawdownPct),
      recordedAt: maxDrawdownDate,
      valueClassName: maxDrawdownPct && maxDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground',
    },
    {
      label: 'MDD (1D)',
      help: 'Largest USD decline between consecutive calendar-day closing values this year. Today uses the live value. The date below marks the lower close. Gaps are excluded.',
      value: formatDrawdown(maxDailyDrawdownPct),
      recordedAt: maxDailyDrawdownDate,
      valueClassName:
        maxDailyDrawdownPct && maxDailyDrawdownPct > 0 ? 'text-loss' : 'text-muted-foreground',
    },
    {
      label: 'Current ATH DD',
      help: 'How far your portfolio is currently below its year-to-date high',
      value: formatDrawdown(drawdownFromAthPct),
      isLive: true,
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

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-3">
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
        className="networth-rail -mx-4 mt-4 snap-x snap-proximity scroll-px-4 overflow-x-auto overscroll-x-contain px-4 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:mx-0 sm:scroll-px-0 sm:px-0"
        role="region"
        aria-label="Net worth statistics"
        aria-describedby="net-worth-stats-instructions"
        tabIndex={0}
        data-testid="net-worth-stat-grid"
      >
        <div className="networth-metrics grid min-w-max grid-flow-col auto-cols-[9rem]">
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
