import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { useAssets, useSearchCoins, useCreateAssetFromCoinGecko } from '@/hooks/useAssets';
import { useCreateTrade, useUpdateTrade } from '@/hooks/useTrades';
import { api } from '@/lib/api';
import type { Asset, CoinSearchResult, BulkImportTrade, Trade } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface TradeFormProps {
  trade?: Trade;
  onSuccess: () => void;
}

type FormMode = 'add' | 'import';

interface ImportResult {
  success: boolean;
  symbol: string;
  error?: string;
}

export function TradeForm({ trade, onSuccess }: TradeFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!trade;

  // Form mode state (only show for new trades)
  const [mode, setMode] = useState<FormMode>('add');

  // Import state
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTrades, setParsedTrades] = useState<BulkImportTrade[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  // Asset selection state
  const [assetId, setAssetId] = useState(trade?.assetId || '');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(trade?.asset || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form fields - initialize from trade if editing
  const [direction, setDirection] = useState<'LONG' | 'SHORT'>(trade?.direction as 'LONG' | 'SHORT' || 'LONG');
  const [entryPrice, setEntryPrice] = useState(trade?.entryPrice?.toString() || '');
  const [exitPrice, setExitPrice] = useState(trade?.exitPrice?.toString() || '');
  const [quantity, setQuantity] = useState(trade?.quantity?.toString() || '');
  const [entryDate, setEntryDate] = useState(
    trade?.entryDate
      ? new Date(trade.entryDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [exitDate, setExitDate] = useState(
    trade?.exitDate
      ? new Date(trade.exitDate).toISOString().split('T')[0]
      : ''
  );
  const [notes, setNotes] = useState(trade?.notes || '');

  // Hooks
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(searchQuery);
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createTrade = useCreateTrade();
  const updateTrade = useUpdateTrade();

  const isLoading = createTrade.isPending || updateTrade.isPending || createAssetFromCoinGecko.isPending;

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

  // Import functions
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      parseJson(text);
    } catch {
      setParseError('Failed to read clipboard. Please paste manually.');
    }
  };

  const parseJson = (text: string) => {
    setParseError(null);
    setParsedTrades(null);
    setImportResults(null);

    if (!text.trim()) return;

    try {
      const parsed = JSON.parse(text);
      const trades: BulkImportTrade[] = Array.isArray(parsed) ? parsed : [parsed];

      // Validate structure
      for (const t of trades) {
        if (!t.asset?.symbol || !t.asset?.name) {
          throw new Error('Invalid format: missing asset symbol or name');
        }
        if (typeof t.entryPrice !== 'number' || t.entryPrice <= 0) {
          throw new Error('Invalid format: entryPrice must be a positive number');
        }
        if (typeof t.quantity !== 'number' || t.quantity <= 0) {
          throw new Error('Invalid format: quantity must be a positive number');
        }
        if (!t.direction || !['LONG', 'SHORT'].includes(t.direction)) {
          throw new Error('Invalid format: direction must be LONG or SHORT');
        }
        if (!t.entryDate) {
          throw new Error('Invalid format: entryDate is required');
        }
      }

      setParsedTrades(trades);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedTrades) return;

    setImporting(true);

    try {
      const response = await api.bulkImportTrades(parsedTrades);
      setImportResults(response.results);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh trades data
    queryClient.invalidateQueries({ queryKey: ['trades'] });
  };

  const resetImportState = () => {
    setJsonInput('');
    setParseError(null);
    setParsedTrades(null);
    setImportResults(null);
  };

  const successCount = importResults?.filter(r => r.success).length ?? 0;
  const failCount = importResults?.filter(r => !r.success).length ?? 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      assetId,
      direction,
      entryPrice: parseFloat(entryPrice),
      exitPrice: exitPrice ? parseFloat(exitPrice) : undefined,
      quantity: parseFloat(quantity),
      entryDate,
      exitDate: exitDate || undefined,
      notes: notes || undefined,
    };

    if (isEditing) {
      await updateTrade.mutateAsync({ id: trade.id, data });
    } else {
      await createTrade.mutateAsync(data);
    }

    onSuccess();
  };

  // If showing import results, show the results UI
  if (mode === 'import' && importResults) {
    return (
      <div className="space-y-4">
        <div className="text-center py-4">
          {failCount === 0 ? (
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
          ) : (
            <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
          )}
          <p className="font-medium">
            {successCount} imported successfully
            {failCount > 0 && `, ${failCount} failed`}
          </p>
        </div>

        <div className="max-h-60 overflow-y-auto space-y-1">
          {importResults.map((result, i) => (
            <div
              key={i}
              className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
                result.success ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
              }`}
            >
              {result.success ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
              )}
              <span className="font-medium">{result.symbol}</span>
              {result.error && (
                <span className="text-red-600 dark:text-red-400 text-xs">
                  {result.error}
                </span>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end">
          <Button onClick={onSuccess}>Done</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Mode Selection (Add New vs Import) - only show when not editing */}
      {!isEditing && (
        <div className="flex border-b mb-2">
          <button
            type="button"
            onClick={() => { setMode('add'); resetImportState(); }}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'add'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Add New
          </button>
          <button
            type="button"
            onClick={() => setMode('import')}
            className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'import'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Import
          </button>
        </div>
      )}

      {/* Import Mode UI */}
      {mode === 'import' && !isEditing ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handlePaste}>
              <Upload className="h-4 w-4 mr-1" />
              Paste from Clipboard
            </Button>
          </div>

          <Textarea
            placeholder='[{"asset": {"symbol": "BTC", "name": "Bitcoin", "category": "LIQUID_CRYPTO"}, "direction": "LONG", "entryPrice": 50000, "quantity": 0.5, "entryDate": "2026-01-15"}, ...]'
            value={jsonInput}
            onChange={(e) => {
              setJsonInput(e.target.value);
              parseJson(e.target.value);
            }}
            rows={6}
            className="font-mono text-xs"
          />

          {parseError && (
            <div className="flex items-start gap-2 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {parsedTrades && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Ready to import {parsedTrades.length} trade{parsedTrades.length !== 1 ? 's' : ''}:
              </p>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {parsedTrades.map((t, i) => (
                  <div key={i} className="text-sm bg-muted/50 px-3 py-2 rounded-md">
                    <span className={`font-medium ${t.direction === 'LONG' ? 'text-green-600' : 'text-red-600'}`}>
                      {t.direction}
                    </span>
                    <span className="font-medium ml-2">{t.asset.symbol}</span>
                    <span className="text-muted-foreground ml-2">
                      {t.quantity} @ ${t.entryPrice.toLocaleString()}
                    </span>
                    {t.exitPrice && (
                      <span className="text-muted-foreground ml-1">
                        → ${t.exitPrice.toLocaleString()}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleImport}
              disabled={!parsedTrades || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Importing...
                </>
              ) : (
                <>Import {parsedTrades?.length ?? 0} Trade{parsedTrades?.length !== 1 ? 's' : ''}</>
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* Add/Edit Mode - Form */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Asset */}
          <div className="space-y-2">
            <Label>Asset</Label>
            {isEditing ? (
              <Input
                value={`${trade.asset.symbol} - ${trade.asset.name}`}
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
              {isLoading ? 'Saving...' : isEditing ? 'Update Trade' : 'Log Trade'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
