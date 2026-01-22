import { useState, useEffect } from 'react';
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
import { useAssets, useSearchCoins, useCreateAssetFromCoinGecko } from '@/hooks/useAssets';
import { useCreatePosition, useUpdatePosition } from '@/hooks/usePortfolio';
import type { Position, CoinSearchResult } from '@/lib/api';

interface PositionFormProps {
  position?: Position;
  onSuccess: () => void;
}

const STORAGE_TYPES = [
  { value: 'WALLET', label: 'Wallet' },
  { value: 'CEX', label: 'CEX (Exchange)' },
  { value: 'DEFI', label: 'DeFi' },
  { value: 'BANK', label: 'Bank' },
];

export function PositionForm({ position, onSuccess }: PositionFormProps) {
  const [assetId, setAssetId] = useState(position?.assetId || '');
  const [quantity, setQuantity] = useState(position?.quantity?.toString() || '');
  const [avgCostUsd, setAvgCostUsd] = useState(position?.avgCostUsd?.toString() || '');
  const [storageType, setStorageType] = useState(position?.storageType || 'WALLET');
  const [storageLocation, setStorageLocation] = useState(position?.storageLocation || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);

  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(searchQuery);
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isEditing = !!position;
  const isLoading = createPosition.isPending || updatePosition.isPending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      assetId,
      quantity: parseFloat(quantity),
      avgCostUsd: parseFloat(avgCostUsd) || 0,
      storageType: storageType as 'WALLET' | 'CEX' | 'DEFI' | 'BANK',
      storageLocation: storageLocation || undefined,
    };

    if (isEditing) {
      await updatePosition.mutateAsync({ id: position.id, data });
    } else {
      await createPosition.mutateAsync(data);
    }

    onSuccess();
  };

  const handleSelectCoin = async (coin: CoinSearchResult) => {
    // Create asset from CoinGecko search result
    const asset = await createAssetFromCoinGecko.mutateAsync({
      coingeckoId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
    });

    setAssetId(asset.id);
    setSearchQuery('');
    setShowSearch(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Asset Selection */}
      <div className="space-y-2">
        <Label>Asset</Label>
        {isEditing ? (
          <Input
            value={position.asset.symbol}
            disabled
            className="bg-muted"
          />
        ) : (
          <div className="space-y-2">
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

            <div className="relative">
              <Input
                placeholder="Or search for a new coin..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowSearch(true);
                }}
                onFocus={() => setShowSearch(true)}
              />

              {showSearch && searchQuery.length >= 2 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                  {searchLoading ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : searchResults && searchResults.length > 0 ? (
                    searchResults.map((coin) => (
                      <button
                        key={coin.id}
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between"
                        onClick={() => handleSelectCoin(coin)}
                      >
                        <span>
                          <span className="font-medium">{coin.symbol.toUpperCase()}</span>
                          <span className="text-muted-foreground ml-2">
                            {coin.name}
                          </span>
                        </span>
                        {coin.rank && (
                          <span className="text-xs text-muted-foreground">
                            #{coin.rank}
                          </span>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">
                      No coins found
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
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

      {/* Average Cost */}
      <div className="space-y-2">
        <Label htmlFor="avgCost">Average Cost (USD)</Label>
        <Input
          id="avgCost"
          type="number"
          step="any"
          value={avgCostUsd}
          onChange={(e) => setAvgCostUsd(e.target.value)}
          placeholder="0.00"
        />
      </div>

      {/* Storage Type */}
      <div className="space-y-2">
        <Label>Storage Type</Label>
        <Select value={storageType} onValueChange={setStorageType}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STORAGE_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Storage Location */}
      <div className="space-y-2">
        <Label htmlFor="storageLocation">Storage Location (Optional)</Label>
        <Input
          id="storageLocation"
          value={storageLocation}
          onChange={(e) => setStorageLocation(e.target.value)}
          placeholder="e.g., Binance, Ledger, MetaMask"
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isLoading || (!isEditing && !assetId)}>
          {isLoading ? 'Saving...' : isEditing ? 'Update Position' : 'Add Position'}
        </Button>
      </div>
    </form>
  );
}
