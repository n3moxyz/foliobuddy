import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { formatCurrency, formatNumber, formatPercent, formatDateTime, getPnLColorClass } from '@/lib/utils';
import { useDeletePosition } from '@/hooks/usePortfolio';
import { PositionForm } from './PositionForm';
import { Pencil, Trash2 } from 'lucide-react';
import type { Position } from '@/lib/api';

const SKIP_DELETE_CONFIRM_KEY = 'pa-portfolio-skip-delete-confirm';

interface PositionTableProps {
  positions: Position[];
  currency?: 'USD' | 'SGD';
  fxRate?: number;
}

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Onchain',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
};

export function PositionTable({ positions, currency = 'USD', fxRate = 1 }: PositionTableProps) {
  const [viewPosition, setViewPosition] = useState<Position | null>(null);
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(() => {
    return localStorage.getItem(SKIP_DELETE_CONFIRM_KEY) === 'true';
  });
  const deletePositionMutation = useDeletePosition();

  // Helper to convert USD values to selected currency
  const convert = (usdValue: number | null | undefined) => {
    if (usdValue === null || usdValue === undefined) return usdValue;
    return currency === 'SGD' ? usdValue * fxRate : usdValue;
  };

  const handleDeleteClick = (position: Position) => {
    if (skipConfirm) {
      deletePositionMutation.mutate(position.id);
    } else {
      setDeletePosition(position);
    }
  };

  const handleDelete = async () => {
    if (!deletePosition) return;

    if (dontAskAgain) {
      localStorage.setItem(SKIP_DELETE_CONFIRM_KEY, 'true');
      setSkipConfirm(true);
    }

    await deletePositionMutation.mutateAsync(deletePosition.id);
    setDeletePosition(null);
    setDontAskAgain(false);
  };

  return (
    <>
      <div className="rounded-md border overflow-hidden">
        <Table className="table-fixed w-full">
          <TableHeader>
            <TableRow>
              <TableHead style={{width: '12%'}}>Asset</TableHead>
              <TableHead style={{width: '10%'}} className="text-right">Quantity</TableHead>
              <TableHead style={{width: '11%'}} className="text-right">Avg Cost</TableHead>
              <TableHead style={{width: '12%'}} className="text-right">Total Cost</TableHead>
              <TableHead style={{width: '11%'}} className="text-right">Price</TableHead>
              <TableHead style={{width: '12%'}} className="text-right">Value</TableHead>
              <TableHead style={{width: '12%'}} className="text-right">P&L</TableHead>
              <TableHead style={{width: '12%'}}>Storage</TableHead>
              <TableHead style={{width: '8%'}} className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => {
              const totalCost = position.quantity * position.avgCostUsd;
              const isStable = position.asset.category === 'STABLECOIN' || position.asset.category === 'CASH';
              return (
                <TableRow
                  key={position.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => setViewPosition(position)}
                >
                  <TableCell>
                    <div className="truncate">
                      <p className="font-medium text-sm">{position.asset.symbol}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {position.asset.name}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {isStable ? formatNumber(position.quantity, 0) : formatNumber(position.quantity, 4)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(convert(position.avgCostUsd), currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatCurrency(convert(totalCost), currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm text-slate-500 dark:text-slate-400">
                    {formatCurrency(convert(position.asset.currentPriceUsd), currency)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    {formatCurrency(convert(position.marketValueUsd), currency)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className={getPnLColorClass(position.unrealizedPnL)}>
                      <p className="font-mono text-sm">
                        {formatCurrency(convert(position.unrealizedPnL), currency)}
                      </p>
                      <p className="text-xs">
                        {formatPercent(position.unrealizedPnLPct)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="truncate">
                      <p className="text-sm">
                        {STORAGE_TYPE_LABELS[position.storageType] || position.storageType}
                      </p>
                      {position.storageLocation && (
                        <p className="text-xs text-muted-foreground italic truncate">
                          {position.storageLocation}
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setEditPosition(position)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleDeleteClick(position)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editPosition} onOpenChange={() => setEditPosition(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Position</DialogTitle>
          </DialogHeader>
          {editPosition && (
            <PositionForm
              position={editPosition}
              onSuccess={() => setEditPosition(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletePosition} onOpenChange={() => {
        setDeletePosition(null);
        setDontAskAgain(false);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your {deletePosition?.asset.symbol} position?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-2">
            <input
              type="checkbox"
              id="dontAskAgain"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            <label
              htmlFor="dontAskAgain"
              className="text-sm text-muted-foreground cursor-pointer"
            >
              Don't ask me again
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setDeletePosition(null);
              setDontAskAgain(false);
            }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deletePositionMutation.isPending}
            >
              {deletePositionMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Position Detail Dialog */}
      <Dialog open={!!viewPosition} onOpenChange={() => setViewPosition(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span>{viewPosition?.asset.symbol}</span>
              <span className="text-muted-foreground font-normal">
                {viewPosition?.asset.name}
              </span>
            </DialogTitle>
          </DialogHeader>
          {viewPosition && (
            <div className="space-y-4">
              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Quantity</p>
                  <p className="font-mono font-medium">
                    {viewPosition.asset.category === 'STABLECOIN' || viewPosition.asset.category === 'CASH'
                      ? formatNumber(viewPosition.quantity, 0)
                      : formatNumber(viewPosition.quantity, 4)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Current Price</p>
                  <p className="font-mono font-medium text-slate-500 dark:text-slate-400">
                    {formatCurrency(convert(viewPosition.asset.currentPriceUsd), currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Average Cost</p>
                  <p className="font-mono">
                    {formatCurrency(convert(viewPosition.avgCostUsd), currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                  <p className="font-mono">
                    {formatCurrency(convert(viewPosition.quantity * viewPosition.avgCostUsd), currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Market Value</p>
                  <p className="font-mono font-medium">
                    {formatCurrency(convert(viewPosition.marketValueUsd), currency)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Unrealized P&L</p>
                  <p className={`font-mono font-medium ${getPnLColorClass(viewPosition.unrealizedPnL)}`}>
                    {formatCurrency(convert(viewPosition.unrealizedPnL), currency)}
                    <span className="text-xs ml-1">({formatPercent(viewPosition.unrealizedPnLPct)})</span>
                  </p>
                </div>
              </div>

              {/* Storage Info */}
              <div className="border-t pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Storage Type</p>
                    <p className="text-sm">
                      {STORAGE_TYPE_LABELS[viewPosition.storageType] || viewPosition.storageType}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Storage Location</p>
                    <p className="text-sm">
                      {viewPosition.storageLocation || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {viewPosition.notes && (
                <div className="border-t pt-4">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap bg-muted/50 p-3 rounded-md">
                    {viewPosition.notes}
                  </p>
                </div>
              )}

              {/* Timestamps */}
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <p>Created: {formatDateTime(viewPosition.createdAt)}</p>
                <p>Updated: {formatDateTime(viewPosition.updatedAt)}</p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setViewPosition(null);
                    setEditPosition(viewPosition);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => {
                    setViewPosition(null);
                    handleDeleteClick(viewPosition);
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
    </>
  );
}
