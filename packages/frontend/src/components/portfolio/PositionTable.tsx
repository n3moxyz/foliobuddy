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
import { formatCurrency, formatNumber, formatPercent, getPnLColorClass } from '@/lib/utils';
import { useDeletePosition } from '@/hooks/usePortfolio';
import { PositionForm } from './PositionForm';
import { Pencil, Trash2 } from 'lucide-react';
import type { Position } from '@/lib/api';

interface PositionTableProps {
  positions: Position[];
}

const STORAGE_TYPE_LABELS: Record<string, string> = {
  WALLET: 'Wallet',
  CEX: 'CEX',
  DEFI: 'DeFi',
  BANK: 'Bank',
};

const CATEGORY_LABELS: Record<string, string> = {
  LIQUID_CRYPTO: 'Crypto',
  STABLECOIN: 'Stable',
  NFT: 'NFT',
  ANGEL: 'Angel',
  CASH: 'Cash',
};

export function PositionTable({ positions }: PositionTableProps) {
  const [editPosition, setEditPosition] = useState<Position | null>(null);
  const [deletePosition, setDeletePosition] = useState<Position | null>(null);
  const deletePositionMutation = useDeletePosition();

  const handleDelete = async () => {
    if (!deletePosition) return;

    await deletePositionMutation.mutateAsync(deletePosition.id);
    setDeletePosition(null);
  };

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="text-right">Avg Cost</TableHead>
              <TableHead className="text-right">Price</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P&L</TableHead>
              <TableHead>Storage</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{position.asset.symbol}</p>
                    <p className="text-sm text-muted-foreground truncate max-w-[150px]">
                      {position.asset.name}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs px-2 py-1 rounded-full bg-muted">
                    {CATEGORY_LABELS[position.asset.category] || position.asset.category}
                  </span>
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatNumber(position.quantity, 4)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(position.avgCostUsd, 'USD')}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(position.asset.currentPriceUsd, 'USD')}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(position.marketValueUsd, 'USD')}
                </TableCell>
                <TableCell className="text-right">
                  <div className={getPnLColorClass(position.unrealizedPnL)}>
                    <p className="font-mono">
                      {formatCurrency(position.unrealizedPnL, 'USD')}
                    </p>
                    <p className="text-xs">
                      {formatPercent(position.unrealizedPnLPct)}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    <p className="text-sm">
                      {STORAGE_TYPE_LABELS[position.storageType] || position.storageType}
                    </p>
                    {position.storageLocation && (
                      <p className="text-xs text-muted-foreground">
                        {position.storageLocation}
                      </p>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditPosition(position)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletePosition(position)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editPosition} onOpenChange={() => setEditPosition(null)}>
        <DialogContent className="max-w-lg">
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
      <Dialog open={!!deletePosition} onOpenChange={() => setDeletePosition(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Position</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete your {deletePosition?.asset.symbol} position?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletePosition(null)}>
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
    </>
  );
}
