import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  TrendingDown,
  Copy,
  Check,
  Trash2,
  Pencil,
  Columns2,
  Columns3,
} from 'lucide-react';
import {
  formatCurrency,
  formatPrice,
  formatPercent,
  formatDate,
  getPnLColorClass,
} from '@/lib/utils';
import type { Trade } from '@/lib/types';
import { useTableSort } from '@/hooks/useTableSort';
import type { ColumnConfig } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { copyTradeToClipboard } from '@/components/trades/tradeClipboard';
import { TradeDetailDialog } from '@/components/trades/TradeDetailDialog';

const TRADE_TABLE_HEADER_SKELETON_KEYS = ['asset', 'side', 'entry', 'exit', 'pnl'] as const;
const TRADE_TABLE_ROW_SKELETON_KEYS = ['first', 'second', 'third', 'fourth', 'fifth'] as const;

const TRADE_COLUMNS: Record<string, ColumnConfig<Trade>> = {
  asset: { accessor: (t) => t.asset.symbol, type: 'string' },
  direction: { accessor: (t) => t.direction, type: 'string' },
  entryPrice: { accessor: (t) => t.entryPrice, type: 'number' },
  entryDate: { accessor: (t) => t.entryDate, type: 'date' },
  exitPrice: { accessor: (t) => t.exitPrice, type: 'number' },
  exitDate: { accessor: (t) => t.exitDate, type: 'date' },
  size: { accessor: (t) => t.positionSizeUsd, type: 'number' },
  pnl: { accessor: (t) => t.realizedPnL, type: 'number' },
  status: { accessor: (t) => t.status, type: 'string' },
};

interface TradeTableProps {
  trades: Trade[];
  isLoading: boolean;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  highlightTradeId?: string | null;
  onHighlightComplete?: () => void;
}

export function TradeTable({
  trades,
  isLoading,
  onEdit,
  onDelete,
  highlightTradeId,
  onHighlightComplete,
}: TradeTableProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewTrade, setViewTrade] = useState<Trade | null>(null);
  const [showAllColumns, setShowAllColumns] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement>(null);
  const { sortedItems, sortKey, sortDirection, onSort } = useTableSort(trades, TRADE_COLUMNS);

  // Scroll to and flash-highlight the target trade row
  useEffect(() => {
    if (!highlightTradeId) return;
    const hasTrade = trades.some((t) => t.id === highlightTradeId);
    if (!hasTrade) return;

    let timer: ReturnType<typeof setTimeout> | undefined;

    const frame = requestAnimationFrame(() => {
      setFlashId(highlightTradeId);
      highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

      timer = setTimeout(() => {
        setFlashId(null);
        onHighlightComplete?.();
      }, 2000);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
    };
  }, [highlightTradeId, trades, onHighlightComplete]);

  // Dynamic column hiding: compact hides on mobile, expanded shows all
  const HIDDEN_MD = showAllColumns ? '' : 'hidden md:table-cell';
  const HIDDEN_SM = showAllColumns ? '' : 'hidden sm:table-cell';
  const HIDDEN_LG = showAllColumns ? '' : 'hidden lg:table-cell';

  const handleCopy = async (trade: Trade) => {
    const success = await copyTradeToClipboard(trade);
    if (success) {
      setCopiedId(trade.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleView = useCallback((trade: Trade) => {
    setViewTrade(trade);
  }, []);

  if (isLoading) {
    return (
      <div className="rounded-md border">
        <div className="p-4 space-y-3">
          <div className="flex gap-4">
            {TRADE_TABLE_HEADER_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-4 w-20" />
            ))}
          </div>
          {TRADE_TABLE_ROW_SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="py-16 text-center">
        <TrendingUp className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h3 className="text-lg font-semibold mb-1">No trades logged</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Start logging your trades to track performance, win rate, and P&L analytics.
        </p>
      </div>
    );
  }

  const tableClass = showAllColumns ? 'text-sm w-full min-w-[800px]' : 'text-sm';

  return (
    <>
      <div className="flex justify-end md:hidden mb-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-11 text-xs text-muted-foreground touch-manipulation"
          onClick={() => setShowAllColumns(!showAllColumns)}
        >
          {showAllColumns ? (
            <>
              <Columns2 className="h-3.5 w-3.5 mr-1" /> Compact
            </>
          ) : (
            <>
              <Columns3 className="h-3.5 w-3.5 mr-1" /> All columns
            </>
          )}
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="rounded-md border overflow-x-auto">
            <Table className={tableClass}>
              <TableHeader>
                <TableRow>
                  <SortableHeader
                    label="Asset"
                    sortKey="asset"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Side"
                    sortKey="direction"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <SortableHeader
                    label="Entry Date"
                    sortKey="entryDate"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Exit Date"
                    sortKey="exitDate"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Entry"
                    sortKey="entryPrice"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Exit"
                    sortKey="exitPrice"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_MD}
                  />
                  <SortableHeader
                    label="Size"
                    sortKey="size"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                    className={HIDDEN_SM}
                  />
                  <SortableHeader
                    label="P&L"
                    sortKey="pnl"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                    align="right"
                  />
                  <SortableHeader
                    label="Status"
                    sortKey="status"
                    activeSortKey={sortKey}
                    sortDirection={sortDirection}
                    onSort={onSort}
                  />
                  <TableHead className={HIDDEN_LG}>Notes</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedItems.map((trade) => (
                  <TableRow
                    key={trade.id}
                    ref={trade.id === flashId ? highlightRef : undefined}
                    className={`cursor-pointer hover:bg-muted/50 ${
                      trade.id === flashId ? 'animate-highlight-flash' : ''
                    }`}
                    onClick={() => handleView(trade)}
                    tabIndex={0}
                    aria-label={`View ${trade.asset.symbol} ${trade.direction} trade`}
                    onKeyDown={(e) => {
                      if (e.currentTarget === e.target && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        handleView(trade);
                      }
                    }}
                  >
                    <TableCell className="font-medium whitespace-nowrap">
                      {trade.asset.symbol}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`flex items-center gap-1 whitespace-nowrap ${trade.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}
                      >
                        {trade.direction === 'LONG' ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                        {trade.direction}
                      </span>
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} whitespace-nowrap`}>
                      {formatDate(trade.entryDate)}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} whitespace-nowrap`}>
                      {trade.exitDate ? (
                        formatDate(trade.exitDate)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} text-right font-mono whitespace-nowrap`}>
                      {formatPrice(trade.entryPrice)}
                    </TableCell>
                    <TableCell className={`${HIDDEN_MD} text-right font-mono whitespace-nowrap`}>
                      {trade.exitPrice ? (
                        formatPrice(trade.exitPrice)
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className={`${HIDDEN_SM} text-right font-mono whitespace-nowrap`}>
                      {formatCurrency(trade.positionSizeUsd, 'USD', 0)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {trade.realizedPnL !== null ? (
                        <div className={getPnLColorClass(trade.realizedPnL)}>
                          <p className="font-mono">{formatCurrency(trade.realizedPnL, 'USD', 0)}</p>
                          <p className="text-xs">{formatPercent(trade.realizedPnLPct)}</p>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
                          trade.status === 'OPEN'
                            ? 'bg-info/10 text-info'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {trade.status}
                      </span>
                    </TableCell>
                    <TableCell className={`${HIDDEN_LG} max-w-[140px] truncate`}>
                      {trade.notes || '-'}
                    </TableCell>
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-center gap-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
                          onClick={() => handleCopy(trade)}
                          title="Copy trade"
                          aria-label="Copy trade"
                        >
                          {copiedId === trade.id ? (
                            <Check className="h-3.5 w-3.5 text-profit" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 touch-manipulation md:mx-0 md:h-8 md:w-8"
                          onClick={() => onEdit(trade)}
                          title="Edit trade"
                          aria-label="Edit trade"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="-mx-1 h-11 w-11 shrink-0 text-destructive touch-manipulation hover:text-destructive md:mx-0 md:h-8 md:w-8"
                          onClick={() => onDelete(trade)}
                          title="Delete trade"
                          aria-label="Delete trade"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <TradeDetailDialog
        trade={viewTrade}
        open={!!viewTrade}
        onOpenChange={(open) => !open && setViewTrade(null)}
        onEdit={onEdit}
        onDelete={onDelete}
        copiedId={copiedId}
        onCopy={handleCopy}
      />
    </>
  );
}
