import { useState, useEffect, useMemo } from 'react';
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
import type { Position, Asset, CoinSearchResult } from '@/lib/api';

interface PositionFormProps {
  position?: Position;
  onSuccess: () => void;
}

type CategoryType = 'crypto' | 'cash';

const STORAGE_TYPES = [
  { value: 'CEX', label: 'CEX' },
  { value: 'WALLET', label: 'Onchain' },
];

// Alphabetically sorted, with Others at the end
const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase', 'Others'];
const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet', 'Others'];

// Custom order: USDT, USDC, USDe, FDUSD, DAI
const TOP_STABLECOINS = [
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { id: 'ethena-usde', symbol: 'USDe', name: 'Ethena USDe' },
  { id: 'first-digital-usd', symbol: 'FDUSD', name: 'First Digital USD' },
  { id: 'dai', symbol: 'DAI', name: 'Dai' },
];

export function PositionForm({ position, onSuccess }: PositionFormProps) {
  // Category state
  const [category, setCategory] = useState<CategoryType>(() => {
    if (position?.asset.category === 'STABLECOIN' || position?.asset.category === 'CASH') {
      return 'cash';
    }
    return 'crypto';
  });

  // Asset selection state
  const [assetId, setAssetId] = useState(position?.assetId || '');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(position?.asset || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);

  // Form fields
  const [quantity, setQuantity] = useState(position?.quantity?.toString() || '');
  const [totalCost, setTotalCost] = useState(() => {
    if (position?.quantity && position?.avgCostUsd) {
      return (position.quantity * position.avgCostUsd).toString();
    }
    return '';
  });
  const [storageType, setStorageType] = useState(position?.storageType || 'CEX');
  const [storageLocation, setStorageLocation] = useState(() => {
    if (!position?.storageLocation) return '';
    // Check if existing value matches predefined options
    const loc = position.storageLocation;
    const isCex = position.storageType === 'CEX';
    const options = isCex ? CEX_LOCATIONS : ONCHAIN_LOCATIONS;
    // Check if location is in predefined list (excluding "Others")
    if (!options.slice(0, -1).includes(loc)) {
      return 'Others';
    }
    return loc;
  });
  const [customLocation, setCustomLocation] = useState(() => {
    if (!position?.storageLocation) return '';
    // If existing value doesn't match predefined options, it's custom
    const loc = position.storageLocation;
    const isCex = position.storageType === 'CEX';
    const options = isCex ? CEX_LOCATIONS : ONCHAIN_LOCATIONS;
    if (!options.slice(0, -1).includes(loc)) {
      return loc;
    }
    return '';
  });

  // Hooks
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(searchQuery);
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isEditing = !!position;
  const isLoading = createPosition.isPending || updatePosition.isPending || createAssetFromCoinGecko.isPending;

  // Calculate average cost automatically
  const avgCostUsd = useMemo(() => {
    const qty = parseFloat(quantity);
    const total = parseFloat(totalCost);
    if (qty > 0 && total > 0) {
      return (total / qty).toFixed(2);
    }
    return '';
  }, [quantity, totalCost]);

  // Filter existing assets based on search and category
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    let filtered = assets;

    // Filter by category - exclude stablecoins for crypto
    if (category === 'crypto') {
      filtered = filtered.filter(a => a.category !== 'STABLECOIN' && a.category !== 'CASH');
    }

    // Filter by search query
    if (searchQuery.length > 0) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(a =>
        a.symbol.toLowerCase().includes(query) ||
        a.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [assets, category, searchQuery]);

  // Combine existing assets with search results (for crypto)
  // Portfolio assets always show first, then CoinGecko results when searching
  const combinedResults = useMemo(() => {
    if (category !== 'crypto') return [];

    const results: Array<{ type: 'existing' | 'search'; asset?: Asset; coin?: CoinSearchResult }> = [];

    // Add existing portfolio assets first (filtered by search query if any)
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
  }, [filteredAssets, searchResults, searchQuery, category, assets]);

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
      category: category === 'cash' ? 'STABLECOIN' : 'LIQUID_CRYPTO',
    });

    setAssetId(asset.id);
    setSelectedAsset(asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Handle selecting a stablecoin (for cash category)
  const handleSelectStablecoin = async (coinId: string) => {
    const stablecoin = TOP_STABLECOINS.find(s => s.id === coinId);
    if (!stablecoin) return;

    // Check if asset already exists
    const existingAsset = assets?.find(a => a.coingeckoId === coinId);
    if (existingAsset) {
      setAssetId(existingAsset.id);
      setSelectedAsset(existingAsset);
      return;
    }

    // Create new asset
    const asset = await createAssetFromCoinGecko.mutateAsync({
      coingeckoId: stablecoin.id,
      symbol: stablecoin.symbol,
      name: stablecoin.name,
      category: 'STABLECOIN',
    });

    setAssetId(asset.id);
    setSelectedAsset(asset);
  };

  // Reset form when category changes
  useEffect(() => {
    if (!isEditing) {
      setAssetId('');
      setSelectedAsset(null);
      setSearchQuery('');
      setQuantity('');
      setTotalCost('');
    }
  }, [category, isEditing]);

  // Reset storage location when storage type changes
  useEffect(() => {
    if (!isEditing) {
      setStorageLocation('');
      setCustomLocation('');
    }
  }, [storageType, isEditing]);

  // Get location options based on storage type
  const locationOptions = storageType === 'CEX' ? CEX_LOCATIONS : ONCHAIN_LOCATIONS;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Determine final storage location value
    const finalStorageLocation = storageLocation === 'Others'
      ? customLocation
      : storageLocation;

    const data = {
      assetId,
      quantity: parseFloat(quantity),
      avgCostUsd: category === 'crypto' ? (parseFloat(avgCostUsd) || 0) : 1,
      storageType: storageType as 'WALLET' | 'CEX' | 'DEFI' | 'BANK',
      storageLocation: finalStorageLocation || undefined,
    };

    if (isEditing) {
      await updatePosition.mutateAsync({ id: position.id, data });
    } else {
      await createPosition.mutateAsync(data);
    }

    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Category Selection */}
      {!isEditing && (
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as CategoryType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="cash">Stables</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Asset Selection - Different UI for Crypto vs Cash */}
      {category === 'crypto' ? (
        <div className="space-y-2">
          <Label>Asset</Label>
          {isEditing ? (
            <Input
              value={`${position.asset.symbol} - ${position.asset.name}`}
              disabled
              className="bg-muted"
            />
          ) : (
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
                  />

                  {showDropdown && (
                    <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto">
                      {searchLoading && searchQuery.length >= 1 ? (
                        <div className="p-3 text-sm text-muted-foreground">
                          Searching...
                        </div>
                      ) : combinedResults.length > 0 ? (
                        combinedResults.map((result) => (
                          <button
                            key={result.type === 'existing' ? result.asset!.id : result.coin!.id}
                            type="button"
                            className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between"
                            onClick={() => {
                              if (result.type === 'existing') {
                                handleSelectExistingAsset(result.asset!);
                              } else {
                                handleSelectCoin(result.coin!);
                              }
                            }}
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
          )}
        </div>
      ) : (
        /* Cash / Stablecoin Selection */
        <div className="space-y-2">
          <Label>Stablecoin</Label>
          {isEditing ? (
            <Input
              value={`${position.asset.symbol} - ${position.asset.name}`}
              disabled
              className="bg-muted"
            />
          ) : (
            <Select
              value={selectedAsset?.coingeckoId || ''}
              onValueChange={handleSelectStablecoin}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a stablecoin" />
              </SelectTrigger>
              <SelectContent>
                {TOP_STABLECOINS.map((coin) => (
                  <SelectItem key={coin.id} value={coin.id}>
                    {coin.symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Quantity / Amount */}
      <div className="space-y-2">
        <Label htmlFor="quantity">
          {category === 'crypto' ? 'Quantity' : 'Amount'}
        </Label>
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

      {/* Total Cost & Average Cost (Crypto only) */}
      {category === 'crypto' && (
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="totalCost">Total Cost (USD)</Label>
            <Input
              id="totalCost"
              type="number"
              step="any"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="avgCost">Average Cost (USD)</Label>
            <Input
              id="avgCost"
              type="number"
              step="any"
              value={avgCostUsd}
              disabled
              className="bg-muted"
              placeholder="Auto-calculated"
            />
          </div>
        </div>
      )}

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
        <Label>Storage Location (Optional)</Label>
        <Select value={storageLocation} onValueChange={(v) => {
          setStorageLocation(v);
          if (v !== 'Others') {
            setCustomLocation('');
          }
        }}>
          <SelectTrigger>
            <SelectValue placeholder="Select location" />
          </SelectTrigger>
          <SelectContent>
            {locationOptions.map((loc) => (
              <SelectItem key={loc} value={loc}>
                {loc}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Custom location input when "Others" is selected */}
        {storageLocation === 'Others' && (
          <Input
            value={customLocation}
            onChange={(e) => setCustomLocation(e.target.value)}
            placeholder="Enter custom location..."
            className="mt-2"
          />
        )}
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-4">
        <Button type="submit" disabled={isLoading || !assetId}>
          {isLoading ? 'Saving...' : isEditing ? 'Update Position' : 'Add Position'}
        </Button>
      </div>
    </form>
  );
}
