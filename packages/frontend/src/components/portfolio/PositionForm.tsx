import { useState, useEffect, useMemo, useRef } from 'react';
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
  cryptoCount?: number;
  stablesCount?: number;
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

const MAX_POSITIONS_PER_CATEGORY = 20;

export function PositionForm({ position, onSuccess, cryptoCount = 0, stablesCount = 0 }: PositionFormProps) {
  // Category state
  const [category, setCategory] = useState<CategoryType>(() => {
    if (position?.asset.category === 'STABLECOIN' || position?.asset.category === 'CASH') {
      return 'cash';
    }
    return 'crypto';
  });

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Asset selection state
  const [assetId, setAssetId] = useState(position?.assetId || '');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(position?.asset || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form fields
  const [quantity, setQuantity] = useState(position?.quantity?.toString() || '');
  const [costInputMode, setCostInputMode] = useState<'total' | 'avg'>('total');
  const [totalCost, setTotalCost] = useState(() => {
    if (position?.quantity && position?.avgCostUsd) {
      return (position.quantity * position.avgCostUsd).toString();
    }
    return '';
  });
  const [avgCostInput, setAvgCostInput] = useState(position?.avgCostUsd?.toString() || '');
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
  const [notes, setNotes] = useState(position?.notes || '');

  // Hooks
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(searchQuery);
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isEditing = !!position;
  const isLoading = createPosition.isPending || updatePosition.isPending || createAssetFromCoinGecko.isPending;

  // Form validation
  const isFormValid = useMemo(() => {
    if (!assetId) return false;
    if (!quantity || parseFloat(quantity) <= 0) return false;
    return true;
  }, [assetId, quantity]);

  // Calculate the derived cost value based on input mode
  const calculatedAvgCost = useMemo(() => {
    if (costInputMode === 'total') {
      const qty = parseFloat(quantity);
      const total = parseFloat(totalCost);
      if (qty > 0 && total > 0) {
        return (total / qty).toFixed(2);
      }
      return '';
    }
    return avgCostInput;
  }, [quantity, totalCost, costInputMode, avgCostInput]);

  const calculatedTotalCost = useMemo(() => {
    if (costInputMode === 'avg') {
      const qty = parseFloat(quantity);
      const avg = parseFloat(avgCostInput);
      if (qty > 0 && avg > 0) {
        return (qty * avg).toFixed(2);
      }
      return '';
    }
    return totalCost;
  }, [quantity, avgCostInput, costInputMode, totalCost]);

  // Final avg cost for form submission
  const avgCostUsd = costInputMode === 'total' ? calculatedAvgCost : avgCostInput;

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

  // Track stablecoin selection separately for immediate UI feedback
  const [selectedStablecoinId, setSelectedStablecoinId] = useState<string>(
    position?.asset.coingeckoId || ''
  );

  // Handle selecting a stablecoin (for cash category)
  const handleSelectStablecoin = async (coinId: string) => {
    setSelectedStablecoinId(coinId); // Immediate UI update
    setError(null);

    const stablecoin = TOP_STABLECOINS.find(s => s.id === coinId);
    if (!stablecoin) return;

    // Check if asset already exists in our database
    const existingAsset = assets?.find(a => a.coingeckoId === coinId);
    if (existingAsset) {
      setAssetId(existingAsset.id);
      setSelectedAsset(existingAsset);
      return;
    }

    // Create new asset from CoinGecko
    try {
      const asset = await createAssetFromCoinGecko.mutateAsync({
        coingeckoId: stablecoin.id,
        symbol: stablecoin.symbol,
        name: stablecoin.name,
        category: 'STABLECOIN',
      });

      setAssetId(asset.id);
      setSelectedAsset(asset);
    } catch (err) {
      setError('Failed to load stablecoin data. Please try again.');
      setSelectedStablecoinId('');
    }
  };

  // Reset form when category changes
  useEffect(() => {
    if (!isEditing) {
      setAssetId('');
      setSelectedAsset(null);
      setSelectedStablecoinId('');
      setSearchQuery('');
      setQuantity('');
      setTotalCost('');
      setError(null);
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
    setError(null);
    setValidationError(null);

    // Validate required fields
    if (!isFormValid) {
      if (!assetId) {
        setValidationError('Please select an asset');
      } else if (!quantity || parseFloat(quantity) <= 0) {
        setValidationError('Please enter a valid quantity');
      }
      return;
    }

    // Check position limit before submitting
    if (!isEditing) {
      const currentCount = category === 'crypto' ? cryptoCount : stablesCount;
      if (currentCount >= MAX_POSITIONS_PER_CATEGORY) {
        setError(`Maximum ${MAX_POSITIONS_PER_CATEGORY} ${category === 'crypto' ? 'crypto' : 'stables'} positions allowed`);
        return;
      }
    }

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
      notes: notes.trim() || undefined,
    };

    try {
      if (isEditing) {
        await updatePosition.mutateAsync({ id: position.id, data });
      } else {
        await createPosition.mutateAsync(data);
      }
      onSuccess();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save position';
      setError(errorMessage);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Category Selection */}
      {!isEditing && (
        <div className="space-y-1">
          <Label className="text-sm">Category</Label>
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
        <div className="space-y-1">
          <Label className="text-sm">Asset</Label>
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
                      setValidationError(null);
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
          )}
        </div>
      ) : (
        /* Cash / Stablecoin Selection */
        <div className="space-y-1">
          <Label className="text-sm">Stablecoin</Label>
          {isEditing ? (
            <Input
              value={`${position.asset.symbol} - ${position.asset.name}`}
              disabled
              className="bg-muted"
            />
          ) : (
            <Select
              value={selectedStablecoinId}
              onValueChange={handleSelectStablecoin}
              disabled={createAssetFromCoinGecko.isPending}
            >
              <SelectTrigger>
                <SelectValue placeholder={createAssetFromCoinGecko.isPending ? "Loading..." : "Select a stablecoin"} />
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
      <div className="space-y-1">
        <Label htmlFor="quantity" className="text-sm">
          {category === 'crypto' ? 'Quantity' : 'Amount'}
        </Label>
        <Input
          id="quantity"
          type="number"
          step="any"
          value={quantity}
          onChange={(e) => {
            setQuantity(e.target.value);
            setValidationError(null);
          }}
          placeholder="0.00"
          required
        />
      </div>

      {/* Total Cost & Average Cost (Crypto only) */}
      {category === 'crypto' && (
        <div className="space-y-2">
          {/* Toggle for cost input mode */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Enter:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="costMode"
                checked={costInputMode === 'total'}
                onChange={() => setCostInputMode('total')}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span className={costInputMode === 'total' ? 'font-medium' : 'text-muted-foreground'}>
                Total Cost
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="costMode"
                checked={costInputMode === 'avg'}
                onChange={() => setCostInputMode('avg')}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span className={costInputMode === 'avg' ? 'font-medium' : 'text-muted-foreground'}>
                Avg Cost
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="totalCost" className="text-sm">Total Cost (USD)</Label>
              <Input
                id="totalCost"
                type="number"
                step="any"
                value={costInputMode === 'total' ? totalCost : calculatedTotalCost}
                onChange={(e) => setTotalCost(e.target.value)}
                placeholder="0.00"
                disabled={costInputMode !== 'total'}
                className={costInputMode !== 'total' ? 'bg-muted' : ''}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="avgCost" className="text-sm">Average Cost (USD)</Label>
              <Input
                id="avgCost"
                type="number"
                step="any"
                value={costInputMode === 'avg' ? avgCostInput : calculatedAvgCost}
                onChange={(e) => setAvgCostInput(e.target.value)}
                placeholder="0.00"
                disabled={costInputMode !== 'avg'}
                className={costInputMode !== 'avg' ? 'bg-muted' : ''}
              />
            </div>
          </div>
        </div>
      )}

      {/* Storage Type */}
      <div className="space-y-1">
        <Label className="text-sm">Storage Type</Label>
        <Select value={storageType} onValueChange={(value) => setStorageType(value as 'WALLET' | 'CEX' | 'DEFI' | 'BANK')}>
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
      <div className="space-y-1">
        <Label className="text-sm">Storage Location (Optional)</Label>
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

      {/* Notes */}
      <div className="space-y-1">
        <Label htmlFor="notes" className="text-sm">Notes (Optional)</Label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes..."
          rows={2}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      {/* Validation Error Display */}
      {validationError && (
        <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
          {validationError}
        </div>
      )}

      {/* Position Limit Info */}
      {!isEditing && (
        <div className="text-xs text-muted-foreground">
          {category === 'crypto' ? cryptoCount : stablesCount} / {MAX_POSITIONS_PER_CATEGORY} {category === 'crypto' ? 'crypto' : 'stables'} positions
        </div>
      )}

      {/* Submit */}
      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="submit"
          disabled={isLoading}
          className={!isFormValid && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}
        >
          {isLoading ? 'Saving...' : isEditing ? 'Update Position' : 'Add Position'}
        </Button>
      </div>
    </form>
  );
}
