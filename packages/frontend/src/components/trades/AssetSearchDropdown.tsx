import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchErrorNotice } from '@/components/SearchErrorNotice';
import { useAssets, useSearchCoins, useCreateAssetFromCoinGecko } from '@/hooks/useAssets';
import { isStablecoinCategory } from '@/lib/utils';
import { isListedCoinCandidate } from '@/components/portfolio/assetSearchMatching';
import type { Asset, CoinSearchResult } from '@/lib/types';
import { toast } from 'sonner';
import { mismatchedPickToast, resolvedAssetMatchesPick } from '@/lib/assetPickGuard';
import { AuthSessionChangedError } from '@/lib/authSession';
import { failureDescription } from '@/lib/mutationFeedback';

interface AssetSearchDropdownProps {
  selectedAsset: Asset | null;
  onSelectAsset: (assetId: string, asset: Asset) => void;
  disabled?: boolean;
  id?: string;
}

export function AssetSearchDropdown({
  selectedAsset,
  onSelectAsset,
  disabled,
  id,
}: AssetSearchDropdownProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const trimmedQuery = searchQuery.trim();

  const { data: assets } = useAssets();
  const coinSearch = useSearchCoins(searchQuery);
  const searchResults = coinSearch.data;
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();

  // Filter existing assets based on search (exclude stablecoins for trades)
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    let filtered = assets.filter((a) => !isStablecoinCategory(a.category));

    if (trimmedQuery.length > 0) {
      const query = trimmedQuery.toLowerCase();
      filtered = filtered.filter(
        (a) => a.symbol.toLowerCase().includes(query) || a.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [assets, trimmedQuery]);

  // Combine existing assets with CoinGecko search results
  const combinedResults = useMemo(() => {
    const results: Array<{ type: 'existing' | 'search'; asset?: Asset; coin?: CoinSearchResult }> =
      [];

    // Add catalog assets first
    filteredAssets.forEach((asset) => {
      results.push({ type: 'existing', asset });
    });

    // Add CoinGecko search results that aren't already in the catalog
    if (searchResults && trimmedQuery.length >= 1) {
      searchResults.forEach((coin) => {
        if (!isListedCoinCandidate(assets, coin)) {
          results.push({ type: 'search', coin });
        }
      });
    }

    return results;
  }, [filteredAssets, searchResults, trimmedQuery, assets]);

  // "Searching…" replaces the list, so the keys must not reach a hidden option.
  const visibleResults = coinSearch.isSearching ? [] : combinedResults;
  const safeHighlightedIndex =
    highlightedIndex >= 0 && highlightedIndex < visibleResults.length ? highlightedIndex : -1;
  const activeOptionId =
    safeHighlightedIndex >= 0 && showDropdown
      ? `${listboxId}-option-${safeHighlightedIndex}`
      : undefined;

  const handleSelectExistingAsset = (asset: Asset) => {
    onSelectAsset(asset.id, asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleSelectCoin = async (coin: CoinSearchResult) => {
    let asset: Asset;
    try {
      asset = await createAssetFromCoinGecko.mutateAsync({
        coingeckoId: coin.id,
        symbol: coin.symbol,
        name: coin.name,
        category: 'LIQUID_CRYPTO',
      });
    } catch (error) {
      if (!(error instanceof AuthSessionChangedError)) {
        toast.error(`Couldn't select ${coin.name}`, { description: failureDescription(error) });
      }
      return;
    }
    if (!resolvedAssetMatchesPick(asset, 'LIQUID_CRYPTO')) {
      const { title, description } = mismatchedPickToast(coin.name, asset);
      toast.error(title, { description });
      return;
    }

    onSelectAsset(asset.id, asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  // Keyboard navigation handler for search dropdown
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape' && showDropdown) {
      e.preventDefault();
      e.stopPropagation();
      setShowDropdown(false);
      setHighlightedIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      setShowDropdown(true);
    }
    // Enter mid-search would submit the trade form or pick an option still hidden.
    if (coinSearch.isSearching && e.key === 'Enter') {
      e.preventDefault();
      return;
    }
    if (visibleResults.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < visibleResults.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : visibleResults.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < visibleResults.length) {
          const result = visibleResults[highlightedIndex];
          if (result.type === 'existing') {
            handleSelectExistingAsset(result.asset!);
          } else {
            handleSelectCoin(result.coin!);
          }
        }
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

  const handleClearSelection = () => {
    onSelectAsset('', null!);
  };

  if (disabled && selectedAsset) {
    return (
      <Input
        id={id}
        value={`${selectedAsset.symbol} - ${selectedAsset.name}`}
        disabled
        className="bg-muted"
      />
    );
  }

  if (selectedAsset) {
    return (
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={`${selectedAsset.symbol} - ${selectedAsset.name}`}
          disabled
          className="bg-muted min-w-0 flex-1"
        />
        <Button type="button" variant="outline" size="sm" onClick={handleClearSelection}>
          Change
        </Button>
      </div>
    );
  }

  const retrySearch = () => {
    // The notice unmounts once the search runs again, so keep focus in the picker.
    inputRef.current?.focus();
    coinSearch.retry();
  };

  return (
    <div
      className="relative"
      // Close only when focus leaves the picker, so Tab can reach "Try again".
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setShowDropdown(false);
      }}
    >
      <Input
        ref={inputRef}
        id={id}
        placeholder="Search for a coin…"
        value={searchQuery}
        onChange={(e) => {
          setSearchQuery(e.target.value);
          setShowDropdown(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setShowDropdown(true)}
        onKeyDown={handleSearchKeyDown}
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
          {(!coinSearch.isError || visibleResults.length > 0) && (
            <div
              id={listboxId}
              ref={dropdownRef}
              role="listbox"
              aria-label="Matching assets"
              className="max-h-60 overflow-auto"
            >
              {coinSearch.isSearching ? (
                <div className="p-3 text-sm text-muted-foreground">Searching…</div>
              ) : visibleResults.length > 0 ? (
                visibleResults.map((result, index) => (
                  <button
                    key={result.type === 'existing' ? result.asset!.id : result.coin!.id}
                    id={`${listboxId}-option-${index}`}
                    type="button"
                    role="option"
                    tabIndex={-1}
                    aria-selected={index === safeHighlightedIndex}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left sm:min-h-0 ${
                      index === safeHighlightedIndex ? 'bg-muted' : 'hover:bg-muted'
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
                    {result.type === 'search' && result.coin!.rank && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        #{result.coin!.rank}
                      </span>
                    )}
                  </button>
                ))
              ) : trimmedQuery.length >= 1 ? (
                // Reached only after a successful empty response for this input.
                <div className="p-3 text-sm text-muted-foreground">No matching assets</div>
              ) : (
                <div className="p-3 text-sm text-muted-foreground">Type to search assets…</div>
              )}
            </div>
          )}
          {coinSearch.isError && (
            <SearchErrorNotice className="m-2" subject="assets" onRetry={retrySearch} />
          )}
        </div>
      )}
    </div>
  );
}
