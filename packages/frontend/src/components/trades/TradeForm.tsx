import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAssets } from '@/hooks/useAssets';
import { useCreateTrade } from '@/hooks/useTrades';

interface TradeFormProps {
  onSuccess: () => void;
}

export function TradeForm({ onSuccess }: TradeFormProps) {
  const [assetId, setAssetId] = useState('');
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [exitDate, setExitDate] = useState('');
  const [notes, setNotes] = useState('');

  const { data: assets } = useAssets();
  const createTrade = useCreateTrade();

  const isLoading = createTrade.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    await createTrade.mutateAsync({
      assetId,
      direction,
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
      quantity: parseFloat(quantity),
      entryDate,
      exitDate: exitDate || undefined,
      notes: notes || undefined,
    });

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Asset */}
      <div className="space-y-2">
        <Label>Asset</Label>
        <Select value={assetId} onValueChange={setAssetId}>
          <SelectTrigger>
            <SelectValue placeholder="Select an asset" />
          </SelectTrigger>
          <SelectContent>
            {assets?.map((asset) => (
              <SelectItem key={asset.id} value={asset.id}>
                {asset.symbol} - {asset.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Direction */}
      <div className="space-y-2">
        <Label>Direction</Label>
        <Select value={direction} onValueChange={(v) => setDirection(v as 'LONG' | 'SHORT')}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="LONG">Long</SelectItem>
            <SelectItem value="SHORT">Short</SelectItem>
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
          {isLoading ? 'Saving...' : 'Log Trade'}
        </Button>
      </div>
    </form>
  );
}
