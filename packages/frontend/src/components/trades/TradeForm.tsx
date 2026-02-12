import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useCreateTrade, useUpdateTrade } from '@/hooks/useTrades';
import type { Asset, Trade } from '@/lib/api';
import { TradeImportTab } from './TradeImportTab';
import { AssetSearchDropdown } from './AssetSearchDropdown';

interface TradeFormProps {
  trade?: Trade;
  onSuccess: () => void;
}

type FormMode = 'add' | 'import';

export function TradeForm({ trade, onSuccess }: TradeFormProps) {
  const isEditing = !!trade;

  // Form mode state (only show for new trades)
  const [mode, setMode] = useState<FormMode>('add');

  // Asset selection state
  const [assetId, setAssetId] = useState(trade?.assetId || '');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(trade?.asset || null);

  // Form fields - initialize from trade if editing
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>(trade?.direction as 'LONG' | 'SHORT' || 'LONG');
  const [entryPrice, setEntryPrice] = useState(trade?.entryPrice?.toString() || '');
  const [exitPrice, setExitPrice] = useState(trade?.exitPrice?.toString() || '');
  const [quantity, setQuantity] = useState(trade?.quantity?.toString() || '');
  const [entryDate, setEntryDate] = useState(
    trade?.entryDate
      ? new Date(trade.entryDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [exitDate, setExitDate] = useState(
    trade?.exitDate
      ? new Date(trade.exitDate).toISOString().split('T')[0]
      : ''
  );
  const [notes, setNotes] = useState(trade?.notes || '');

  // Hooks
  const createTrade = useCreateTrade();
  const updateTrade = useUpdateTrade();

  const isLoading = createTrade.isPending || updateTrade.isPending;

  // Handle asset selection
  const handleSelectAsset = (id: string, asset: Asset) => {
    setAssetId(id);
    setSelectedAsset(asset);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      assetId,
      direction,
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
      quantity: parseFloat(quantity),
      entryDate,
      exitDate: exitDate || undefined,
      notes: notes || undefined,
    };

    if (isEditing) {
      await updateTrade.mutateAsync({ id: trade.id, data });
    } else {
      await createTrade.mutateAsync(data);
    }

    onSuccess();
  };


  return (
    <div className="space-y-3">
      {/* Mode Selection (Add New vs Import) - only show when not editing */}
      {!isEditing && (
        <div className="flex border-b mb-2">
          <button
            type="button"
            onClick={() => setMode('add')}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'add'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Add New
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'import'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Import
          </button>
        </div>
      )}

      {/* Import Mode UI */}
      {mode === 'import' && !isEditing ? (
        <TradeImportTab onSuccess={onSuccess} />
      ) : (
        /* Add/Edit Mode - Form */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Asset */}
          <div className="space-y-2">
            <Label>Asset</Label>
            <AssetSearchDropdown
              selectedAsset={selectedAsset}
              onSelectAsset={handleSelectAsset}
              disabled={isEditing}
            />
          </div>

          {/* Direction */}
          <div className="space-y-2">
            <Label>Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as 'LONG' | 'SHORT')}>
              <SelectTrigger>
                <span className={`font-medium ${direction === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>
                  {direction}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">
                  <span className="text-green-600 font-medium">LONG</span>
                </SelectItem>
                <SelectItem value="SHORT">
                  <span className="text-red-600 font-medium">SHORT</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryPrice">Entry Price</Label>
              <Input
                id="entryPrice"
                type="number"
                step="any"
                value={entryPrice}
                onChange={(e) => setEntryPrice(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="entryDate">Entry Date</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Exit (Optional) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exitPrice">Exit Price (Optional)</Label>
              <Input
                id="exitPrice"
                type="number"
                step="any"
                value={exitPrice}
                onChange={(e) => setExitPrice(e.target.value)}
                placeholder="Leave empty for open trade"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="exitDate">Exit Date</Label>
              <Input
                id="exitDate"
                type="date"
                value={exitDate}
                onChange={(e) => setExitDate(e.target.value)}
              />
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              type="number"
              step="any"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Trade reasoning, strategy, etc."
            />
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="submit" disabled={isLoading || !assetId}>
              {isLoading ? 'Saving...' : isEditing ? 'Update Trade' : 'Log Trade'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
