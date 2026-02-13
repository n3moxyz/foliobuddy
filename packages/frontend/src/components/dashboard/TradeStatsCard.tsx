import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatNumber, formatDate, getPnLColorClass } from '@/lib/utils';
import type { TradeAnalytics } from '@/lib/api';

function MetricLabel({ label, tip }: { label: string; tip: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="text-xs text-muted-foreground uppercase tracking-wide cursor-help border-b border-dotted border-muted-foreground/40 w-fit">
          {label}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-56 text-xs leading-relaxed">
        {tip}
      </TooltipContent>
    </Tooltip>
  );
}

interface TradeStatsCardProps {
  analytics: TradeAnalytics;
  currency?: 'USD' | 'SGD';
  fxRate?: number;
}

function ratingLabel(value: number, thresholds: [number, string][]): { text: string; color: string } {
  for (const [min, text] of thresholds) {
    if (value >= min) return { text, color: min >= 1.5 ? 'text-profit' : min >= 1 ? 'text-yellow-600 dark:text-yellow-400' : 'text-loss' };
  }
  return { text: thresholds[thresholds.length - 1][1], color: 'text-loss' };
}

export function TradeStatsCard({ analytics, currency = 'USD', fxRate = 1 }: TradeStatsCardProps) {
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Derived metrics
  const lossRate = analytics.totalTrades > 0
    ? (analytics.losingTrades / analytics.totalTrades) * 100
    : 0;
  const expectancy = analytics.totalTrades > 0
    ? ((analytics.winRate / 100) * analytics.avgWin) - ((lossRate / 100) * analytics.avgLoss)
    : 0;
  const riskReward = analytics.avgLoss > 0
    ? analytics.avgWin / analytics.avgLoss
    : analytics.avgWin > 0 ? Infinity : 0;

  // Rating helpers
  const pfRating = analytics.profitFactor === Infinity
    ? { text: 'No losses', color: 'text-profit' }
    : ratingLabel(analytics.profitFactor, [[2, 'Excellent'], [1.5, 'Strong'], [1, 'Marginal'], [0, 'Negative']]);
  const rrRating = riskReward === Infinity
    ? { text: 'No losses', color: 'text-profit' }
    : ratingLabel(riskReward, [[3, 'Excellent'], [2, 'Good'], [1, 'Below 1:1'], [0, 'Poor']]);

  // Avg win/loss bar proportions
  const maxAvg = Math.max(analytics.avgWin, analytics.avgLoss, 1);
  const winBarPct = (analytics.avgWin / maxAvg) * 100;
  const lossBarPct = (analytics.avgLoss / maxAvg) * 100;

  return (
    <TooltipProvider delayDuration={200}>
    <Card>
      <CardHeader className="pb-4">
        <CardTitle>Trade Statistics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">

        {/* Row 1: Key Numbers */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {/* Total P&L */}
          <div>
            <MetricLabel label="Total P&L" tip="Sum of all realized profits and losses" />
            <p className={`text-xl font-bold tabular-nums ${getPnLColorClass(analytics.totalPnL)}`}>
              {formatCurrency(convert(analytics.totalPnL), currency)}
            </p>
          </div>

          {/* Expectancy */}
          <div>
            <MetricLabel
              label="Per Trade Avg"
              tip={<>(win rate &times; avg win) &minus; (loss rate &times; avg loss)</>}
            />
            <p className={`text-xl font-bold tabular-nums ${getPnLColorClass(expectancy)}`}>
              {formatCurrency(convert(expectancy), currency)}
            </p>
            <p className="text-[10px] text-muted-foreground">expected per trade</p>
          </div>

          {/* Profit Factor */}
          <div>
            <MetricLabel
              label="Profit Factor"
              tip={<>total gains &divide; total losses<br />Above 1.0 = profitable system</>}
            />
            <p className="text-xl font-bold tabular-nums">
              {analytics.profitFactor === Infinity ? '∞' : formatNumber(analytics.profitFactor)}
            </p>
            <p className={`text-[10px] ${pfRating.color}`}>{pfRating.text}</p>
          </div>

          {/* R:R */}
          <div>
            <MetricLabel
              label="Risk : Reward"
              tip={<>avg win &divide; avg loss<br />Higher = winners are bigger than losers</>}
            />
            <p className="text-xl font-bold tabular-nums">
              1 : {riskReward === Infinity ? '∞' : formatNumber(riskReward)}
            </p>
            <p className={`text-[10px] ${rrRating.color}`}>{rrRating.text}</p>
          </div>
        </div>

        {/* Row 2: Win Rate Visual */}
        <div className="border-t pt-4 space-y-2">
          <div className="flex items-baseline justify-between">
            <MetricLabel
              label="Win Rate"
              tip={<>winning trades &divide; total trades</>}
            />
            <p className="text-sm font-semibold tabular-nums">
              {formatNumber(analytics.winRate)}%
              <span className="text-xs text-muted-foreground font-normal ml-1.5">
                {analytics.winningTrades}W – {analytics.losingTrades}L
              </span>
            </p>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
            {analytics.totalTrades > 0 && (
              <>
                <div
                  className="bg-profit transition-all"
                  style={{ width: `${analytics.winRate}%` }}
                />
                <div
                  className="bg-loss transition-all"
                  style={{ width: `${100 - analytics.winRate}%` }}
                />
              </>
            )}
          </div>
        </div>

        {/* Row 3: Avg Win vs Avg Loss bars */}
        <div className="border-t pt-4 space-y-3">
          <MetricLabel
            label="Avg Win vs Avg Loss"
            tip="Average profit on winning trades vs average loss on losing trades"
          />
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 shrink-0">Win</span>
              <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                <div className="h-full bg-profit/70 rounded" style={{ width: `${winBarPct}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-profit w-20 text-right">
                {formatCurrency(convert(analytics.avgWin), currency)}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-10 shrink-0">Loss</span>
              <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                <div className="h-full bg-loss/70 rounded" style={{ width: `${lossBarPct}%` }} />
              </div>
              <span className="text-xs font-medium tabular-nums text-loss w-20 text-right">
                -{formatCurrency(convert(analytics.avgLoss), currency)}
              </span>
            </div>
          </div>
        </div>

        {/* Row 4: Long vs Short */}
        <div className="border-t pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">By Direction</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="space-y-1 rounded-md bg-muted/50 p-3">
              <div className="flex items-center gap-1.5">
                <span className="text-green-600 font-medium">LONG</span>
                <span className="text-xs text-muted-foreground">({analytics.breakdown.long.count})</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Win rate: {formatNumber(analytics.breakdown.long.winRate)}%
              </p>
              <p className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.long.pnl)}`}>
                {formatCurrency(convert(analytics.breakdown.long.pnl), currency)}
              </p>
            </div>
            <div className="space-y-1 rounded-md bg-muted/50 p-3">
              <div className="flex items-center gap-1.5">
                <span className="text-red-600 font-medium">SHORT</span>
                <span className="text-xs text-muted-foreground">({analytics.breakdown.short.count})</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Win rate: {formatNumber(analytics.breakdown.short.winRate)}%
              </p>
              <p className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.short.pnl)}`}>
                {formatCurrency(convert(analytics.breakdown.short.pnl), currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Row 5: Best & Worst */}
        {(analytics.bestTrade || analytics.worstTrade) && (
          <div className="border-t pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Notable Trades</p>
            <div className="grid grid-cols-2 gap-4 text-sm">
              {analytics.bestTrade && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Best</p>
                  <p className="font-medium text-profit tabular-nums">
                    {formatCurrency(convert(analytics.bestTrade.pnl), currency)}
                    <span className="text-xs ml-1">({analytics.bestTrade.pnlPct >= 0 ? '+' : ''}{formatNumber(analytics.bestTrade.pnlPct)}%)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analytics.bestTrade.asset} · {formatDate(analytics.bestTrade.date)}
                  </p>
                </div>
              )}
              {analytics.worstTrade && (
                <div className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">Worst</p>
                  <p className="font-medium text-loss tabular-nums">
                    {formatCurrency(convert(analytics.worstTrade.pnl), currency)}
                    <span className="text-xs ml-1">({analytics.worstTrade.pnlPct >= 0 ? '+' : ''}{formatNumber(analytics.worstTrade.pnlPct)}%)</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {analytics.worstTrade.asset} · {formatDate(analytics.worstTrade.date)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </TooltipProvider>
  );
}
