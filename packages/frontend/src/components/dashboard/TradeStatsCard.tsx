import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatCurrency, formatNumber, formatDate, getPnLColorClass } from '@/lib/utils';
import type { TradeAnalytics } from '@/lib/types';
import { useTradeStatsStore, type SegmentId } from '@/stores/tradeStatsStore';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

function MetricLabel({ label, tip }: { label: string; tip: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <p className="text-xs text-muted-foreground uppercase tracking-wide cursor-help border-b border-dotted border-muted-foreground/40 w-fit">
          {label}
        </p>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 p-0 overflow-hidden">
        <div className="border-b border-border/50 bg-muted/50 px-3 py-1.5">
          <p className="text-xs font-semibold tracking-wide">{label}</p>
        </div>
        <div className="px-3 py-2 text-xs leading-relaxed text-muted-foreground">{tip}</div>
      </TooltipContent>
    </Tooltip>
  );
}

interface TradeStatsCardProps {
  analytics: TradeAnalytics;
  currency?: 'USD' | 'SGD';
  fxRate?: number;
  onTradeClick?: (tradeId: string) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
}

function ratingLabel(
  value: number,
  thresholds: [number, string][]
): { text: string; color: string } {
  for (const [min, text] of thresholds) {
    if (value >= min)
      return {
        text,
        color: min >= 1.5 ? 'text-profit' : min >= 1 ? 'text-warning' : 'text-loss',
      };
  }
  return { text: thresholds[thresholds.length - 1][1], color: 'text-loss' };
}

// --- Sortable segment wrapper ---

function SortableSegment({
  id,
  isFirst,
  children,
}: {
  id: string;
  isFirst: boolean;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.8 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`${!isFirst ? 'border-t pt-4' : ''} ${isDragging ? 'bg-muted/30 rounded-md' : ''}`}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          aria-label={`Reorder ${id} section`}
          className="mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/80 hover:text-muted-foreground transition-colors shrink-0 touch-manipulation md:min-h-0 md:min-w-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

// --- Segment render functions ---

function MetricsSegment({
  analytics,
  convert,
  currency,
  expectancy,
  pfRating,
  riskReward,
  rrRating,
}: {
  analytics: TradeAnalytics;
  convert: (v: number | null | undefined) => number | null | undefined;
  currency: 'USD' | 'SGD';
  expectancy: number;
  pfRating: { text: string; color: string };
  riskReward: number;
  rrRating: { text: string; color: string };
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <MetricLabel label="Total P&L" tip="Sum of all realized profits and losses" />
        <p className={`text-xl font-bold tabular-nums ${getPnLColorClass(analytics.totalPnL)}`}>
          {formatCurrency(convert(analytics.totalPnL), currency)}
        </p>
      </div>
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
      <div>
        <MetricLabel
          label="Profit Factor"
          tip={
            <>
              total gains &divide; total losses
              <br />
              Above 1.0 = profitable system
            </>
          }
        />
        <p className="text-xl font-bold tabular-nums">
          {analytics.profitFactor === Infinity ? '∞' : formatNumber(analytics.profitFactor)}
        </p>
        <p className={`text-[10px] ${pfRating.color}`}>{pfRating.text}</p>
      </div>
      <div>
        <MetricLabel
          label="Risk : Reward"
          tip={
            <>
              avg win &divide; avg loss
              <br />
              Higher = winners are bigger than losers
            </>
          }
        />
        <p className="text-xl font-bold tabular-nums">
          1 : {riskReward === Infinity ? '∞' : formatNumber(riskReward)}
        </p>
        <p className={`text-[10px] ${rrRating.color}`}>{rrRating.text}</p>
      </div>
    </div>
  );
}

function WinRateSegment({ analytics }: { analytics: TradeAnalytics }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <MetricLabel label="Win Rate" tip={<>winning trades &divide; total trades</>} />
        <p className="text-xl font-bold tabular-nums">{formatNumber(analytics.winRate)}%</p>
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden bg-muted">
        {analytics.totalTrades > 0 && (
          <div
            className="absolute inset-y-0 left-0 bg-profit transition-transform origin-left"
            style={{ width: '100%', transform: `scaleX(${analytics.winRate / 100})` }}
          />
        )}
      </div>
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="text-profit font-medium">{analytics.winningTrades} wins</span>
        <span className="text-muted-foreground font-medium">
          TOTAL: {analytics.totalTrades} trades
        </span>
        <span className="text-loss font-medium">{analytics.losingTrades} losses</span>
      </div>
    </div>
  );
}

function AvgWinLossSegment({
  analytics,
  convert,
  currency,
}: {
  analytics: TradeAnalytics;
  convert: (v: number | null | undefined) => number | null | undefined;
  currency: 'USD' | 'SGD';
}) {
  const maxAvg = Math.max(analytics.avgWin, analytics.avgLoss, 1);
  const winBarPct = (analytics.avgWin / maxAvg) * 100;
  const lossBarPct = (analytics.avgLoss / maxAvg) * 100;

  return (
    <div className="space-y-3">
      <MetricLabel
        label="Avg Win vs Avg Loss"
        tip="Average profit on winning trades vs average loss on losing trades"
      />
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Win</span>
          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-profit/70 rounded transition-transform origin-left"
              style={{
                width: '100%',
                transform: `scaleX(${winBarPct / 100})`,
                transformOrigin: 'left',
              }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-profit w-20 text-right">
            {formatCurrency(convert(analytics.avgWin), currency)}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-10 shrink-0">Loss</span>
          <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
            <div
              className="h-full bg-loss/70 rounded transition-transform origin-left"
              style={{
                width: '100%',
                transform: `scaleX(${lossBarPct / 100})`,
                transformOrigin: 'left',
              }}
            />
          </div>
          <span className="text-xs font-medium tabular-nums text-loss w-20 text-right">
            -{formatCurrency(convert(analytics.avgLoss), currency)}
          </span>
        </div>
      </div>
    </div>
  );
}

function ByDirectionSegment({
  analytics,
  convert,
  currency,
}: {
  analytics: TradeAnalytics;
  convert: (v: number | null | undefined) => number | null | undefined;
  currency: 'USD' | 'SGD';
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">By Direction</p>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div className="space-y-1 rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-profit font-medium">LONG</span>
            <span className="text-xs text-muted-foreground">
              ({analytics.breakdown.long.count})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Win rate: {formatNumber(analytics.breakdown.long.winRate)}%
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.long.pnl)}`}
          >
            {formatCurrency(convert(analytics.breakdown.long.pnl), currency)}
          </p>
        </div>
        <div className="space-y-1 rounded-md bg-muted/50 p-3">
          <div className="flex items-center gap-1.5">
            <span className="text-loss font-medium">SHORT</span>
            <span className="text-xs text-muted-foreground">
              ({analytics.breakdown.short.count})
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Win rate: {formatNumber(analytics.breakdown.short.winRate)}%
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.short.pnl)}`}
          >
            {formatCurrency(convert(analytics.breakdown.short.pnl), currency)}
          </p>
        </div>
      </div>
    </div>
  );
}

function NotableTradesSegment({
  analytics,
  convert,
  currency,
  onTradeClick,
}: {
  analytics: TradeAnalytics;
  convert: (v: number | null | undefined) => number | null | undefined;
  currency: 'USD' | 'SGD';
  onTradeClick?: (tradeId: string) => void;
}) {
  if (!analytics.bestTrade && !analytics.worstTrade) return null;

  const tradeItem = (trade: NonNullable<TradeAnalytics['bestTrade']>, type: 'best' | 'worst') => {
    const colorClass = type === 'best' ? 'text-profit' : 'text-loss';
    return (
      <button
        type="button"
        className="space-y-0.5 text-left rounded-md p-2 -m-2 transition-colors hover:bg-muted/50 cursor-pointer w-full"
        onClick={() => onTradeClick?.(trade.id)}
      >
        <p className="text-xs text-muted-foreground">{type === 'best' ? 'Best' : 'Worst'}</p>
        <p className={`font-medium ${colorClass} tabular-nums`}>
          {formatCurrency(convert(trade.pnl), currency)}
          <span className="text-xs ml-1">
            ({trade.pnlPct >= 0 ? '+' : ''}
            {formatNumber(trade.pnlPct)}%)
          </span>
        </p>
        <p className="text-xs text-muted-foreground underline decoration-dotted underline-offset-2">
          {trade.asset} · {formatDate(trade.date)}
        </p>
      </button>
    );
  };

  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">Notable Trades</p>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        {analytics.bestTrade && tradeItem(analytics.bestTrade, 'best')}
        {analytics.worstTrade && tradeItem(analytics.worstTrade, 'worst')}
      </div>
    </div>
  );
}

// --- Main component ---

export function TradeStatsCard({
  analytics,
  currency = 'USD',
  fxRate = 1,
  onTradeClick,
  isExpanded = true,
  onToggle,
}: TradeStatsCardProps) {
  const { segmentOrder, setOrder } = useTradeStatsStore();

  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  // Derived metrics
  const lossRate =
    analytics.totalTrades > 0 ? (analytics.losingTrades / analytics.totalTrades) * 100 : 0;
  const expectancy =
    analytics.totalTrades > 0
      ? (analytics.winRate / 100) * analytics.avgWin - (lossRate / 100) * analytics.avgLoss
      : 0;
  const riskReward =
    analytics.avgLoss > 0
      ? analytics.avgWin / analytics.avgLoss
      : analytics.avgWin > 0
        ? Infinity
        : 0;

  // Rating helpers
  const pfRating =
    analytics.profitFactor === Infinity
      ? { text: 'No losses', color: 'text-profit' }
      : ratingLabel(analytics.profitFactor, [
          [2, 'Excellent'],
          [1.5, 'Strong'],
          [1, 'Marginal'],
          [0, 'Negative'],
        ]);
  const rrRating =
    riskReward === Infinity
      ? { text: 'No losses', color: 'text-profit' }
      : ratingLabel(riskReward, [
          [3, 'Excellent'],
          [2, 'Good'],
          [1, 'Below 1:1'],
          [0, 'Poor'],
        ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = segmentOrder.indexOf(active.id as SegmentId);
      const newIndex = segmentOrder.indexOf(over.id as SegmentId);
      setOrder(arrayMove(segmentOrder, oldIndex, newIndex));
    }
  }

  // Filter out notableTrades if no data
  const hasNotableTrades = !!(analytics.bestTrade || analytics.worstTrade);
  const visibleOrder = segmentOrder.filter((id) => id !== 'notableTrades' || hasNotableTrades);

  function renderSegment(id: SegmentId) {
    switch (id) {
      case 'metrics':
        return (
          <MetricsSegment
            analytics={analytics}
            convert={convert}
            currency={currency}
            expectancy={expectancy}
            pfRating={pfRating}
            riskReward={riskReward}
            rrRating={rrRating}
          />
        );
      case 'winRate':
        return <WinRateSegment analytics={analytics} />;
      case 'avgWinLoss':
        return <AvgWinLossSegment analytics={analytics} convert={convert} currency={currency} />;
      case 'byDirection':
        return <ByDirectionSegment analytics={analytics} convert={convert} currency={currency} />;
      case 'notableTrades':
        return (
          <NotableTradesSegment
            analytics={analytics}
            convert={convert}
            currency={currency}
            onTradeClick={onTradeClick}
          />
        );
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <CollapsibleCard
        title="Trade Analytics"
        isExpanded={isExpanded}
        onToggle={onToggle ?? (() => {})}
        headerRight={
          !isExpanded ? (
            <div className="flex items-center gap-3 text-xs tabular-nums">
              <span className={`font-medium ${getPnLColorClass(analytics.totalPnL)}`}>
                {formatCurrency(convert(analytics.totalPnL), currency, 0)}
              </span>
              <span className="text-muted-foreground">{formatNumber(analytics.winRate)}% WR</span>
              <span className="text-muted-foreground">{analytics.totalTrades} trades</span>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-5">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
              {visibleOrder.map((id, index) => (
                <SortableSegment key={id} id={id} isFirst={index === 0}>
                  {renderSegment(id)}
                </SortableSegment>
              ))}
            </SortableContext>
          </DndContext>
        </div>
      </CollapsibleCard>
    </TooltipProvider>
  );
}
