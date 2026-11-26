import { useRef, useState } from 'react';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { HelpTooltip } from '@/components/ui/HelpTooltip';
import {
  formatCount,
  formatNumber,
  formatDate,
  formatTrimmedNumber,
  getPnLColorClass,
} from '@/lib/utils';
import type { TradeAnalytics } from '@/lib/types';
import { useTradeStatsStore, type SegmentId } from '@/stores/tradeStatsStore';
import {
  SEGMENT_SCREEN_READER_INSTRUCTIONS,
  segmentAnnouncements,
  segmentKeyboardCoordinates,
  segmentLabel,
} from './tradeStatsSegments';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

// Definitions use HelpTooltip, which opens on hover, focus or tap. A hover-only tooltip on the
// label itself never opened for keyboard or touch users.
function MetricLabel({ label, help }: { label: string; help: string }) {
  return (
    <div className="flex items-center gap-1">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <HelpTooltip label={label} content={help} />
    </div>
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

// Arrow buttons give a single-pointer way to reorder (WCAG 2.5.7): dragging the grip is not
// the only path. They use aria-disabled, not disabled, so focus stays on a button that
// reaches the first or last position.
const MOVE_BUTTON_CLASS =
  'inline-flex min-h-8 min-w-11 items-center justify-center rounded-sm text-muted-foreground/80 transition-colors hover:text-muted-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-40 md:h-6 md:min-h-0 md:w-6 md:min-w-0';

function SortableSegment({
  id,
  isFirst,
  isLast,
  onMove,
  children,
}: {
  id: SegmentId;
  isFirst: boolean;
  isLast: boolean;
  onMove: (id: SegmentId, direction: -1 | 1) => void;
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
          aria-label={`Reorder ${segmentLabel(id)} section`}
          className="mt-0.5 inline-flex min-h-11 min-w-11 items-center justify-center cursor-grab active:cursor-grabbing text-muted-foreground/80 hover:text-muted-foreground transition-colors shrink-0 touch-manipulation md:min-h-0 md:min-w-0"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex-1 min-w-0">{children}</div>
        <div className="flex shrink-0 flex-col items-center">
          <button
            type="button"
            aria-label={`Move ${segmentLabel(id)} section up`}
            aria-disabled={isFirst}
            className={MOVE_BUTTON_CLASS}
            onClick={() => {
              if (!isFirst) onMove(id, -1);
            }}
          >
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Move ${segmentLabel(id)} section down`}
            aria-disabled={isLast}
            className={MOVE_BUTTON_CLASS}
            onClick={() => {
              if (!isLast) onMove(id, 1);
            }}
          >
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
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
  const { formatCurrency } = useMoneyFormatter();
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div>
        <MetricLabel label="Total P&L" help="Sum of all realised profits and losses." />
        <p className={`text-xl font-bold tabular-nums ${getPnLColorClass(analytics.totalPnL)}`}>
          {formatCurrency(convert(analytics.totalPnL), currency, 0)}
        </p>
      </div>
      <div>
        <MetricLabel
          label="Per Trade Avg"
          help="Expected result per trade: (win rate × average win) − (loss rate × average loss)."
        />
        <p className={`text-xl font-bold tabular-nums ${getPnLColorClass(expectancy)}`}>
          {formatCurrency(convert(expectancy), currency, 0)}
        </p>
        <p className="text-[10px] text-muted-foreground">expected per trade</p>
      </div>
      <div>
        <MetricLabel
          label="Profit Factor"
          help="Total profit on winning trades ÷ total loss on losing trades. Above 1.0 means your closed trades made money overall."
        />
        <p className="text-xl font-bold tabular-nums">
          {analytics.profitFactor === null ? '∞' : formatTrimmedNumber(analytics.profitFactor, 1)}
        </p>
        <p className={`text-[10px] ${pfRating.color}`}>{pfRating.text}</p>
      </div>
      <div>
        <MetricLabel
          label="Risk : Reward"
          help="Average win ÷ average loss. Above 1.0 means your average win is bigger than your average loss."
        />
        <p className="text-xl font-bold tabular-nums">
          1 : {riskReward === Infinity ? '∞' : formatTrimmedNumber(riskReward, 1)}
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
        <MetricLabel label="Win Rate" help="Winning trades ÷ closed trades." />
        <p className="text-xl font-bold tabular-nums">
          {formatTrimmedNumber(analytics.winRate, 1)}%
        </p>
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
        <span className="text-profit font-medium">
          {formatCount(analytics.winningTrades, 'win')}
        </span>
        <span className="text-muted-foreground font-medium">
          Total: {formatCount(analytics.totalTrades, 'trade')}
        </span>
        <span className="text-loss font-medium">
          {formatCount(analytics.losingTrades, 'loss', 'losses')}
        </span>
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
  const { formatCurrency, formatSignedCurrency } = useMoneyFormatter();
  const maxAvg = Math.max(analytics.avgWin, analytics.avgLoss, 1);
  const winBarPct = (analytics.avgWin / maxAvg) * 100;
  const lossBarPct = (analytics.avgLoss / maxAvg) * 100;

  return (
    <div className="space-y-3">
      <MetricLabel
        label="Avg Win vs Avg Loss"
        help="Average profit on winning trades vs average loss on losing trades."
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
            {formatCurrency(convert(analytics.avgWin), currency, 0)}
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
            {formatSignedCurrency(-Math.abs(convert(analytics.avgLoss) ?? 0), currency)}
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
  const { formatCurrency } = useMoneyFormatter();
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
            Win rate: {formatTrimmedNumber(analytics.breakdown.long.winRate, 1)}%
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.long.pnl)}`}
          >
            {formatCurrency(convert(analytics.breakdown.long.pnl), currency, 0)}
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
            Win rate: {formatTrimmedNumber(analytics.breakdown.short.winRate, 1)}%
          </p>
          <p
            className={`text-sm font-semibold tabular-nums ${getPnLColorClass(analytics.breakdown.short.pnl)}`}
          >
            {formatCurrency(convert(analytics.breakdown.short.pnl), currency, 0)}
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
  const { formatCurrency } = useMoneyFormatter();
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
          {formatCurrency(convert(trade.pnl), currency, 0)}
          <span className="text-xs ml-1">
            ({trade.pnlPct >= 0 ? '+' : ''}
            {formatTrimmedNumber(trade.pnlPct, 1)}%)
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
  const { formatCurrency } = useMoneyFormatter();
  const pickedUpRef = useRef<UniqueIdentifier | null>(null);
  const [moveAnnouncement, setMoveAnnouncement] = useState('');

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
    analytics.profitFactor === null
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
          [1, 'Fair'],
          [0, 'Poor'],
        ]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: segmentKeyboardCoordinates })
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

  // Swap with the visible neighbour. A hidden section keeps its saved slot.
  function moveSegment(id: SegmentId, direction: -1 | 1) {
    const visibleIndex = visibleOrder.indexOf(id);
    const neighbour = visibleOrder[visibleIndex + direction];
    if (!neighbour) return;
    setOrder(arrayMove(segmentOrder, segmentOrder.indexOf(id), segmentOrder.indexOf(neighbour)));
    setMoveAnnouncement(
      `${segmentLabel(id)} section moved to position ${visibleIndex + direction + 1} of ${visibleOrder.length}.`
    );
  }

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
    <CollapsibleCard
      title="Trade Analytics"
      isExpanded={isExpanded}
      onToggle={onToggle ?? (() => {})}
      headerRight={
        !isExpanded ? (
          // Phones stack P&L over the win rate so the summary never runs into the title; the
          // trade count returns from sm, and the page subtitle above the card shows it too.
          <div className="flex flex-col items-end text-xs tabular-nums sm:flex-row sm:items-center sm:gap-3">
            <span className={`font-medium ${getPnLColorClass(analytics.totalPnL)}`}>
              {formatCurrency(convert(analytics.totalPnL), currency, 0)}
            </span>
            <span className="text-muted-foreground">{`${formatNumber(analytics.winRate, 0)}% win\u00a0rate`}</span>
            <span className="hidden text-muted-foreground sm:inline">
              {formatCount(analytics.totalTrades, 'trade')}
            </span>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements: segmentAnnouncements(visibleOrder, pickedUpRef),
            screenReaderInstructions: SEGMENT_SCREEN_READER_INSTRUCTIONS,
          }}
        >
          <SortableContext items={visibleOrder} strategy={verticalListSortingStrategy}>
            {visibleOrder.map((id, index) => (
              <SortableSegment
                key={id}
                id={id}
                isFirst={index === 0}
                isLast={index === visibleOrder.length - 1}
                onMove={moveSegment}
              >
                {renderSegment(id)}
              </SortableSegment>
            ))}
          </SortableContext>
        </DndContext>
        <p role="status" className="sr-only">
          {moveAnnouncement}
        </p>
      </div>
    </CollapsibleCard>
  );
}
