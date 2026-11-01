import { useRef, useEffect, useId } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchErrorNotice } from '@/components/SearchErrorNotice';
import type { Asset, CoinSearchResult, ProviderSearchResult } from '@/lib/types';
import { PositionAssetSummary } from './PositionAssetSummary';

type SearchCandidate = CoinSearchResult | ProviderSearchResult;

interface AssetSearchDropdownProps {
  selectedAsset: Asset | null;
  searchQuery: string;
  showDropdown: boolean;
  highlightedIndex: number;
  /** The query has no answer yet, including the debounce wait before the request. */
  searchLoading: boolean;
  /** The provider search for the query failed: its results are unknown, not empty. */
  searchFailed?: boolean;
  onRetrySearch?: () => void;
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
  searchFailed = false,
  onRetrySearch,
  combinedResults,
  isEditing,
  id,
  placeholder = 'Search for a coin…',
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
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const trimmedQuery = searchQuery.trim();
  const searching = searchLoading && trimmedQuery.length >= 1;
  // "Searching…" replaces the list, so no hidden option may be marked active.
  const visibleResults = searching ? [] : combinedResults;
  const activeOptionId =
    highlightedIndex >= 0 && highlightedIndex < visibleResults.length && showDropdown
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
      <PositionAssetSummary
        asset={{ symbol: positionAssetSymbol ?? '', name: positionAssetName ?? '' }}
      />
    );
  }

  if (selectedAsset) {
    return (
      <PositionAssetSummary
        asset={selectedAsset}
        action={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={onClearSelection}
          >
            Change
          </Button>
        }
      />
    );
  }

  const retrySearch = () => {
    // The notice unmounts once the search runs again, so keep focus in the picker.
    inputRef.current?.focus();
    onRetrySearch?.();
  };

  return (
    <div
      className="relative"
      // Close only when focus leaves the picker, so Tab can reach "Try again".
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onBlur();
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        placeholder={placeholder}
        value={searchQuery}
        onChange={(e) => {
          onSearchChange(e.target.value);
          setValidationError(null);
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={showDropdown}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
      />

      {showDropdown && (
        <div
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-10 w-full mt-1 overflow-hidden bg-background border rounded-md shadow-lg"
        >
          {/* A failed search with nothing to list shows only the notice below. */}
          {(!searchFailed || visibleResults.length > 0) && (
            <div
              id={listboxId}
              ref={dropdownRef}
              role="listbox"
              aria-label="Matching assets"
              className="max-h-60 overflow-auto"
            >
              {searching ? (
                <div className="p-3 text-sm text-muted-foreground">Searching…</div>
              ) : visibleResults.length > 0 ? (
                visibleResults.map((result, index) => (
                  <button
                    key={result.type === 'existing' ? result.asset!.id : result.coin!.id}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === highlightedIndex}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left sm:min-h-0 ${
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
                    <span className="min-w-0 break-words [overflow-wrap:anywhere]">
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
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {result.coin!.exchange}
                        </span>
                      )}
                    {result.type === 'search' &&
                      !('exchange' in result.coin!) &&
                      result.coin!.rank && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          #{result.coin!.rank}
                        </span>
                      )}
                  </button>
                ))
              ) : trimmedQuery.length >= 1 ? (
                // Reached only after a successful empty response for this query.
                <div className="p-3 text-sm text-muted-foreground">No matching assets</div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">Type to search assets…</div>
              )}
            </div>
          )}
          {searchFailed && (
            <SearchErrorNotice className="m-2" subject="assets" onRetry={retrySearch} />
          )}
        </div>
      )}
    </div>
  );
}
