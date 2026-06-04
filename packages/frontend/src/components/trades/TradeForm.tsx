import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { useCreateTrade, useUpdateTrade } from '@/hooks/useTrades';
import type { Asset, Trade } from '@/lib/types';
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
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>(
    (trade?.direction as 'LONG' | 'SHORT') || 'LONG'
  );
  const [entryPrice, setEntryPrice] = useState(trade?.entryPrice?.toString() || '');
  const [exitPrice, setExitPrice] = useState(trade?.exitPrice?.toString() || '');
  const [quantity, setQuantity] = useState(trade?.quantity?.toString() || '');
  const [entryDate, setEntryDate] = useState(() => {
    if (trade?.entryDate) return new Date(trade.entryDate).toISOString().split('T')[0];
    // Default to 5 days ago (most trades are logged after closing)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    return fiveDaysAgo.toISOString().split('T')[0];
  });
  const [exitDate, setExitDate] = useState(() => {
    if (trade?.exitDate) return new Date(trade.exitDate).toISOString().split('T')[0];
    // Default to today (logging closed trades)
    return new Date().toISOString().split('T')[0];
  });
  const [notes, setNotes] = useState(trade?.notes || '');

  // Hooks
  const createTrade = useCreateTrade();
  const updateTrade = useUpdateTrade();

  const isLoading = createTrade.isPending || updateTrade.isPending;

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
      {!isEditing && (
        <div className="flex border-b mb-2">
          <button
            type="button"
            aria-pressed={mode === 'add'}
            onClick={() => setMode('add')}
            className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'add'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Add New
          </button>
          <button
            type="button"
            aria-pressed={mode === 'import'}
            onClick={() => setMode('import')}
            className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'import'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Import
          </button>
        </div>
      )}

      {mode === 'import' && !isEditing ? (
        <TradeImportTab onSuccess={onSuccess} />
      ) : (
        /* Add/Edit Mode - Form */
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trade-asset">Asset</Label>
            <AssetSearchDropdown
              selectedAsset={selectedAsset}
              onSelectAsset={handleSelectAsset}
              disabled={isEditing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trade-direction">Direction</Label>
            <Select value={direction} onValueChange={(v) => setDirection(v as 'LONG' | 'SHORT')}>
              <SelectTrigger id="trade-direction">
                <span
                  className={`font-medium ${direction === 'LONG' ? 'text-profit' : 'text-loss'}`}
                >
                  {direction}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LONG">
                  <span className="text-profit font-medium">LONG</span>
                </SelectItem>
                <SelectItem value="SHORT">
                  <span className="text-loss font-medium">SHORT</span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryPrice">Entry Price</Label>
              <FormattedNumberInput
                id="entryPrice"
                value={entryPrice}
                onValueChange={setEntryPrice}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="exitPrice">Exit Price (Optional)</Label>
              <FormattedNumberInput
                id="exitPrice"
                value={exitPrice}
                onValueChange={setExitPrice}
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

          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity</Label>
            <FormattedNumberInput
              id="quantity"
              value={quantity}
              onValueChange={setQuantity}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Trade reasoning, strategy, etc."
            />
          </div>

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
