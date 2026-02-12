import { useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Asset, CoinSearchResult } from '@/lib/api';

interface AssetSearchDropdownProps {
  selectedAsset: Asset | null;
  searchQuery: string;
  showDropdown: boolean;
  highlightedIndex: number;
  searchLoading: boolean;
  combinedResults: Array<{ type: 'existing' | 'search'; asset?: Asset; coin?: CoinSearchResult }>;
  isEditing: boolean;
  positionAssetSymbol?: string;
  positionAssetName?: string;
  onSearchChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectExistingAsset: (asset: Asset) => void;
  onSelectCoin: (coin: CoinSearchResult) => void;
  onClearSelection: () => void;
  setHighlightedIndex: (index: number) => void;
  setValidationError: (error: string | null) => void;
}

export function AssetSearchDropdown({
  selectedAsset,
  searchQuery,
  showDropdown,
  highlightedIndex,
  searchLoading,
  combinedResults,
  isEditing,
  positionAssetSymbol,
  positionAssetName,
  onSearchChange,
  onFocus,
  onBlur,
  onKeyDown,
  onSelectExistingAsset,
  onSelectCoin,
  onClearSelection,
  setHighlightedIndex,
  setValidationError,
}: AssetSearchDropdownProps) {
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('button');
      if (items[highlightedIndex]) {
        items[highlightedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  if (isEditing) {
    return (
      <Input
        value={`${positionAssetSymbol} - ${positionAssetName}`}
        disabled
        className="bg-muted"
      />
    );
  }

  if (selectedAsset) {
    return (
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
          onClick={onClearSelection}
        >
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search for a coin..."
        value={searchQuery}
        onChange={(e) => {
          onSearchChange(e.target.value);
          setValidationError(null);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
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
                    onSelectExistingAsset(result.asset!);
                  } else {
                    onSelectCoin(result.coin!);
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
    </div>
  );
}
