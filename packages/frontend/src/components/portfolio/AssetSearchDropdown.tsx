import { useRef, useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { Asset, CoinSearchResult, ProviderSearchResult } from '@/lib/types';

type SearchCandidate = CoinSearchResult | ProviderSearchResult;

interface AssetSearchDropdownProps {
  selectedAsset: Asset | null;
  searchQuery: string;
  showDropdown: boolean;
  highlightedIndex: number;
  searchLoading: boolean;
  combinedResults: Array<{ type: 'existing' | 'search'; asset?: Asset; coin?: SearchCandidate }>;
  isEditing: boolean;
  id?: string;
  placeholder?: string;
  positionAssetSymbol?: string;
  positionAssetName?: string;
  onSearchChange: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onSelectExistingAsset: (asset: Asset) => void;
  onSelectCoin: (coin: SearchCandidate) => void;
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
  id,
  placeholder = 'Search for a coin...',
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
  const listboxId = useId();
  const activeOptionId =
    highlightedIndex >= 0 && showDropdown && combinedResults.length > 0
      ? `${listboxId}-option-${highlightedIndex}`
      : undefined;

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
        <Button type="button" variant="outline" size="sm" onClick={onClearSelection}>
          Change
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => {
          onSearchChange(e.target.value);
          setValidationError(null);
        }}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showDropdown && combinedResults.length > 0}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />

      {showDropdown && (
        <div
          id={listboxId}
          ref={dropdownRef}
          role="listbox"
          className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {searchLoading && searchQuery.length >= 1 ? (
            <div className="p-3 text-sm text-muted-foreground">Searching...</div>
          ) : combinedResults.length > 0 ? (
            combinedResults.map((result, index) => (
              <button
                key={result.type === 'existing' ? result.asset!.id : result.coin!.id}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={index === highlightedIndex}
                className={`w-full px-3 py-2 text-left flex items-center justify-between ${
                  index === highlightedIndex ? 'bg-muted' : 'hover:bg-muted'
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
                    {result.type === 'existing' ? result.asset!.name : result.coin!.name}
                  </span>
                </span>
                {result.type === 'search' &&
                  'exchange' in result.coin! &&
                  result.coin!.exchange && (
                    <span className="text-xs text-muted-foreground">{result.coin!.exchange}</span>
                  )}
                {result.type === 'search' && !('exchange' in result.coin!) && result.coin!.rank && (
                  <span className="text-xs text-muted-foreground">#{result.coin!.rank}</span>
                )}
                {result.type === 'existing' && (
                  <span className="text-xs text-profit">In portfolio</span>
                )}
              </button>
            ))
          ) : searchQuery.length >= 1 ? (
            <div className="p-3 text-sm text-muted-foreground">No coins found</div>
          ) : (
            <div className="p-3 text-sm text-muted-foreground">Type to search coins...</div>
          )}
        </div>
      )}
    </div>
  );
}
