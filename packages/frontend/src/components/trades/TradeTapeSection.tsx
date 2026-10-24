import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X } from 'lucide-react';
import type { Trade } from '@/lib/types';
import { TradeTable } from '@/components/trades/TradeTable';
import { TradeSortSelect } from '@/components/trades/TradeSortSelect';
import { Label } from '@/components/ui/label';
import { useTradeSortStore } from '@/stores/tradeSortStore';
import { useId } from 'react';

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
  const defaultSort = useTradeSortStore((state) => state.defaultSort);
  const sortSelectId = useId();
  return (
    <Tabs value={filter} onValueChange={(v) => onFilterChange(v as 'all' | 'OPEN' | 'CLOSED')}>
      <section className="space-y-3">
        <div
          className={
            title
              ? 'flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
              : 'flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'
          }
        >
          {title && (
            <div>
              <h2 className="text-base font-semibold">{title}</h2>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          )}
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
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={sortSelectId} className="text-xs text-muted-foreground">
              Default trade order
            </Label>
            <TradeSortSelect id={sortSelectId} />
          </div>
        </div>

        <TabsContent value={filter}>
          <TradeTable
            key={defaultSort}
            trades={trades}
            defaultSort={defaultSort}
            isLoading={isLoading}
            onEdit={onEdit}
            onDelete={onDelete}
            highlightTradeId={highlightTradeId}
            onHighlightComplete={onHighlightComplete}
          />
        </TabsContent>
      </section>
    </Tabs>
  );
}
