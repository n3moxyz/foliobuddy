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
import { useCreateUnitTrust } from '@/hooks/useAssets';
import { useCreatePosition } from '@/hooks/usePortfolio';

const BROKERAGE_LOCATIONS = ['FSMOne', 'Tiger', 'UOB Kay Hian', 'Others'];

interface UnitTrustFormProps {
  onSuccess: () => void;
}

export function UnitTrustForm({ onSuccess }: UnitTrustFormProps) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [nativeCurrency, setNativeCurrency] = useState('SGD');
  const [isin, setIsin] = useState('');
  const [factsheetUrl, setFactsheetUrl] = useState('');
  const [nav, setNav] = useState('');
  const [navAsOfDate, setNavAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [quantity, setQuantity] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [storageLocation, setStorageLocation] = useState('FSMOne');
  const [customLocation, setCustomLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const createUnitTrust = useCreateUnitTrust();
  const createPosition = useCreatePosition();
  const isLoading = createUnitTrust.isPending || createPosition.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const navNum = parseFloat(nav);
    const qtyNum = parseFloat(quantity);
    const costNum = parseFloat(totalCost);

    if (!symbol.trim() || !name.trim()) {
      setError('Symbol and name are required');
      return;
    }
    if (!(navNum > 0)) {
      setError('NAV must be positive');
      return;
    }
    if (!(qtyNum > 0)) {
      setError('Units must be positive');
      return;
    }
    if (!(costNum >= 0)) {
      setError('Total cost must be a non-negative number');
      return;
    }

    try {
      const asset = await createUnitTrust.mutateAsync({
        symbol: symbol.trim().toUpperCase(),
        name: name.trim(),
        nativeCurrency,
        isin: isin.trim() || undefined,
        factsheetUrl: factsheetUrl.trim() || undefined,
        initialNav: navNum,
        navAsOfDate: new Date(navAsOfDate).toISOString(),
      });

      const finalLocation = storageLocation === 'Others' ? customLocation.trim() : storageLocation;

      await createPosition.mutateAsync({
        assetId: asset.id,
        quantity: qtyNum,
        avgCostUsd: qtyNum > 0 ? costNum / qtyNum : 0,
        storageType: 'BROKERAGE',
        storageLocation: finalLocation || undefined,
        notes: notes.trim() || undefined,
      });

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create unit trust');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ut-symbol" className="text-sm">
            Symbol / Code
          </Label>
          <Input
            id="ut-symbol"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            placeholder="e.g. LIONGL"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ut-currency" className="text-sm">
            Currency
          </Label>
          <Select value={nativeCurrency} onValueChange={setNativeCurrency}>
            <SelectTrigger id="ut-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SGD">SGD</SelectItem>
              <SelectItem value="USD">USD</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ut-name" className="text-sm">
          Fund Name
        </Label>
        <Input
          id="ut-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lion Global All Seasons"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="ut-isin" className="text-sm">
            ISIN (Optional)
          </Label>
          <Input
            id="ut-isin"
            value={isin}
            onChange={(e) => setIsin(e.target.value)}
            placeholder="SG9999000001"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ut-factsheet" className="text-sm">
            Factsheet URL (Optional)
          </Label>
          <Input
            id="ut-factsheet"
            value={factsheetUrl}
            onChange={(e) => setFactsheetUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="ut-nav" className="text-sm">
            NAV ({nativeCurrency})
          </Label>
          <Input
            id="ut-nav"
            type="number"
            step="any"
            value={nav}
            onChange={(e) => setNav(e.target.value)}
            placeholder="1.234"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ut-nav-date" className="text-sm">
            NAV Date
          </Label>
          <Input
            id="ut-nav-date"
            type="date"
            value={navAsOfDate}
            onChange={(e) => setNavAsOfDate(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ut-qty" className="text-sm">
            Units
          </Label>
          <Input
            id="ut-qty"
            type="number"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="1000"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ut-cost" className="text-sm">
            Total Cost (USD)
          </Label>
          <Input
            id="ut-cost"
            type="number"
            step="any"
            value={totalCost}
            onChange={(e) => setTotalCost(e.target.value)}
            placeholder="0.00"
            required
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ut-location" className="text-sm">
          Platform
        </Label>
        <Select value={storageLocation} onValueChange={setStorageLocation}>
          <SelectTrigger id="ut-location">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BROKERAGE_LOCATIONS.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {storageLocation === 'Others' && (
          <Input
            className="mt-2"
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            placeholder="Enter platform..."
          />
        )}
      </div>

      <div className="space-y-1">
        <Label htmlFor="ut-notes" className="text-sm">
          Notes (Optional)
        </Label>
        <textarea
          id="ut-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">{error}</div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Add Unit Trust'}
        </Button>
      </div>
    </form>
  );
}
