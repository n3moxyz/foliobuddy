import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Copy, Pencil, TrendingDown, TrendingUp, Trash2 } from 'lucide-react';
import { formatDate, formatNumber, formatPercent, getPnLColorClass } from '@/lib/utils';
import type { Trade } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';

export function formatTradeTags(tags: string | null): string | null {
  if (!tags) return null;
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) {
      return parsed.join(', ');
    }
  } catch {
    // Older demo/import data may store tags as a plain comma-separated string.
  }
  return tags;
}

export interface TradeDetailDialogProps {
  trade: Trade | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
  copiedId: string | null;
  onCopy: (trade: Trade) => void;
}

export function TradeDetailDialog({
  trade,
  open,
  onOpenChange,
  onEdit,
  onDelete,
  copiedId,
  onCopy,
}: TradeDetailDialogProps) {
  const { formatCurrency, formatPrice, formatSignedCurrency } = useMoneyFormatter();
  const tags = trade ? formatTradeTags(trade.tags) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!bottom-0 !left-0 !top-auto max-h-[85vh] w-full max-w-none !translate-x-0 !translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))] sm:!bottom-auto sm:!left-[50%] sm:!top-[50%] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-lg sm:pb-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{trade?.asset.symbol}</span>
            <span className="text-muted-foreground font-normal">Trade Details</span>
          </DialogTitle>
          <DialogDescription>{trade?.asset.name}</DialogDescription>
        </DialogHeader>
        {trade && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                  trade.direction === 'LONG' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                }`}
              >
                {trade.direction === 'LONG' ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {trade.direction}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs ${
                  trade.status === 'OPEN'
                    ? 'bg-info/10 text-info'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {trade.status}
              </span>
              {tags && (
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {tags}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Quantity</p>
                <p className="font-mono font-medium">{formatNumber(trade.quantity, 4)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Position Size</p>
                <p className="font-mono font-medium">
                  {formatCurrency(trade.positionSizeUsd, 'USD', 0)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Entry Price</p>
                <p className="font-mono">{formatPrice(trade.entryPrice)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Exit Price</p>
                <p className="font-mono">
                  {trade.exitPrice !== null ? (
                    formatPrice(trade.exitPrice)
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Entry Date</p>
                <p className="text-sm">{formatDate(trade.entryDate)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Exit Date</p>
                <p className="text-sm">
                  {trade.exitDate ? (
                    formatDate(trade.exitDate)
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Realized P&amp;L</p>
                {trade.realizedPnL !== null ? (
                  <p className={`font-mono font-medium ${getPnLColorClass(trade.realizedPnL)}`}>
                    {formatCurrency(trade.realizedPnL, 'USD', 0)}
                    <span className="ml-1 text-xs">({formatPercent(trade.realizedPnLPct)})</span>
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Open trade</p>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted-foreground">Funding Cost</p>
                <p
                  className={`font-mono font-medium ${
                    trade.fundingCost > 0
                      ? getPnLColorClass(-trade.fundingCost)
                      : 'text-muted-foreground'
                  }`}
                >
                  {trade.fundingCost > 0
                    ? formatSignedCurrency(-trade.fundingCost, 'USD', 2)
                    : formatCurrency(0, 'USD', 2)}
                </p>
              </div>
            </div>

            {trade.notes && (
              <div className="border-t pt-4">
                <p className="text-xs text-muted-foreground mb-1">Notes</p>
                <p className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3">
                  {trade.notes}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => onCopy(trade)}>
                {copiedId === trade.id ? (
                  <Check className="h-3.5 w-3.5 mr-1 text-profit" />
                ) : (
                  <Copy className="h-3.5 w-3.5 mr-1" />
                )}
                {copiedId === trade.id ? 'Copied!' : 'Copy'}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onEdit(trade);
                }}
              >
                <Pencil className="h-3.5 w-3.5 mr-1" />
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onDelete(trade);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Delete
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
