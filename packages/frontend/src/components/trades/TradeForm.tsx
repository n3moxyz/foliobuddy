import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useAssets, useSearchCoins, useCreateAssetFromCoinGecko } from '@/hooks/useAssets';
import { useCreateTrade } from '@/hooks/useTrades';
import type { Asset, CoinSearchResult } from '@/lib/api';

interface TradeFormProps {
  onSuccess: () => void;
}

export function TradeForm({ onSuccess }: TradeFormProps) {
  // Asset selection state
  const [assetId, setAssetId] = useState('');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form fields
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>('LONG');
  const [entryPrice, setEntryPrice] = useState('');
  const [exitPrice, setExitPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [exitDate, setExitDate] = useState('');
  const [notes, setNotes] = useState('');

  // Hooks
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(searchQuery);
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createTrade = useCreateTrade();

  const isLoading = createTrade.isPending || createAssetFromCoinGecko.isPending;

  // Filter existing assets based on search (exclude stablecoins for trades)
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    let filtered = assets.filter(a => a.category !== 'STABLECOIN' && a.category !== 'CASH');

    if (searchQuery.length > 0) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.symbol.toLowerCase().includes(query) ||
        a.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [assets, searchQuery]);

  // Combine existing assets with CoinGecko search results
  const combinedResults = useMemo(() => {
    const results: Array<{ type: 'existing' | 'search'; asset?: Asset; coin?: CoinSearchResult }> = [];

    // Add existing portfolio assets first
    filteredAssets.forEach(asset => {
      results.push({ type: 'existing', asset });
    });

    // Add CoinGecko search results that aren't already in portfolio
    if (searchResults && searchQuery.length >= 1) {
      searchResults.forEach(coin => {
        const existsInPortfolio = assets?.some(
          a => a.coingeckoId === coin.id || a.symbol.toLowerCase() === coin.symbol.toLowerCase()
        );
        if (!existsInPortfolio) {
          results.push({ type: 'search', coin });
        }
      });
    }

    return results;
  }, [filteredAssets, searchResults, searchQuery, assets]);

  // Handle selecting an existing asset
  const handleSelectExistingAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setSelectedAsset(asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Handle selecting a coin from search (create new asset)
  const handleSelectCoin = async (coin: CoinSearchResult) => {
    const asset = await createAssetFromCoinGecko.mutateAsync({
      coingeckoId: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      category: 'LIQUID_CRYPTO',
    });

    setAssetId(asset.id);
    setSelectedAsset(asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Reset highlighted index when results change
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [combinedResults.length, searchQuery]);

  // Keyboard navigation handler for search dropdown
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || combinedResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev < combinedResults.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex(prev =>
          prev > 0 ? prev - 1 : combinedResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < combinedResults.length) {
          const result = combinedResults[highlightedIndex];
          if (result.type === 'existing') {
            handleSelectExistingAsset(result.asset!);
          } else {
            handleSelectCoin(result.coin!);
          }
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('button');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

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
        <div className="relative">
          {selectedAsset ? (
            <div className="flex items-center gap-2">
              <Input
                value={`${selectedAsset.symbol} - ${selectedAsset.name}`}
                disabled
                className="bg-muted flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAssetId('');
                  setSelectedAsset(null);
                }}
              >
                Change
              </Button>
            </div>
          ) : (
            <>
              <Input
                placeholder="Search for a coin..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                onKeyDown={handleSearchKeyDown}
              />

              {showDropdown && (
                <div
                  ref={dropdownRef}
                  className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
                >
                  {searchLoading && searchQuery.length >= 1 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      Searching...
                    </div>
                  ) : combinedResults.length > 0 ? (
                    combinedResults.map((result, index) => (
                      <button
                        key={result.type === 'existing' ? result.asset!.id : result.coin!.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left flex items-center justify-between ${
                          index === highlightedIndex
                            ? 'bg-muted'
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => {
                          if (result.type === 'existing') {
                            handleSelectExistingAsset(result.asset!);
                          } else {
                            handleSelectCoin(result.coin!);
                          }
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                      >
                        <span>
                          <span className="font-medium">
                            {result.type === 'existing'
                              ? result.asset!.symbol
                              : result.coin!.symbol.toUpperCase()}
                          </span>
                          <span className="text-muted-foreground ml-2">
                            {result.type === 'existing'
                              ? result.asset!.name
                              : result.coin!.name}
                          </span>
                        </span>
                        {result.type === 'search' && result.coin!.rank && (
                          <span className="text-xs text-muted-foreground">
                            #{result.coin!.rank}
                          </span>
                        )}
                        {result.type === 'existing' && (
                          <span className="text-xs text-green-600">
                            In portfolio
                          </span>
                        )}
                      </button>
                    ))
                  ) : searchQuery.length >= 1 ? (
                    <div className="p-3 text-sm text-muted-foreground">
                      No coins found
                    </div>
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">
                      Type to search coins...
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
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
          {isLoading ? 'Saving...' : 'Log Trade'}
        </Button>
      </div>
    </form>
  );
}
