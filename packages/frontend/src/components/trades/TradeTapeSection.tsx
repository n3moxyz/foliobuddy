import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X } from 'lucide-react';
import type { Trade } from '@/lib/types';
import { TradeTable } from '@/components/trades/TradeTable';

interface TradeTapeSectionProps {
  title?: string;
  subtitle?: string;
  trades: Trade[];
  isLoading: boolean;
  filter: 'all' | 'OPEN' | 'CLOSED';
  onFilterChange: (filter: 'all' | 'OPEN' | 'CLOSED') => void;
  filteredCount: number;
  openCount: number;
  closedCount: number;
  tickerFilter?: string | null;
  onClearTicker?: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  highlightTradeId?: string | null;
  onHighlightComplete?: () => void;
}

export function TradeTapeSection({
  title,
  subtitle,
  trades,
  isLoading,
  filter,
  onFilterChange,
  filteredCount,
  openCount,
  closedCount,
  tickerFilter,
  onClearTicker,
  onEdit,
  onDelete,
  highlightTradeId,
  onHighlightComplete,
}: TradeTapeSectionProps) {
  return (
    <section className="space-y-3">
      <div
        className={
          title
            ? 'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'
            : 'flex items-center gap-2 flex-wrap'
        }
      >
        {title && (
          <div>
            <h2 className="text-base font-semibold">{title}</h2>
            {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        <Tabs value={filter} onValueChange={(v) => onFilterChange(v as 'all' | 'OPEN' | 'CLOSED')}>
          <div className="flex items-center gap-2 flex-wrap">
            <TabsList className="sm:w-auto">
              <TabsTrigger value="all">All ({filteredCount})</TabsTrigger>
              <TabsTrigger value="OPEN">Open ({openCount})</TabsTrigger>
              <TabsTrigger value="CLOSED">Closed ({closedCount})</TabsTrigger>
            </TabsList>
            {tickerFilter && onClearTicker && (
              <Button
                variant="secondary"
                size="sm"
                className="min-h-11 rounded-full text-xs gap-1 sm:h-8 sm:min-h-8"
                onClick={onClearTicker}
                aria-label={`Clear ${tickerFilter} filter`}
              >
                {tickerFilter}
                <X className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
          </div>
        </Tabs>
      </div>

      <TradeTable
        trades={trades}
        isLoading={isLoading}
        onEdit={onEdit}
        onDelete={onDelete}
        highlightTradeId={highlightTradeId}
        onHighlightComplete={onHighlightComplete}
      />
    </section>
  );
}
