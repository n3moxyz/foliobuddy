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
import {
  useAssets,
  useSearchCoins,
  useSearchAssets,
  useCreateAssetFromCoinGecko,
  useCreateAssetFromProvider,
} from '@/hooks/useAssets';
import { useCreatePosition, useUpdatePosition } from '@/hooks/usePortfolio';
import { api } from '@/lib/api';
import type {
  Asset,
  BulkImportPosition,
  CoinSearchResult,
  Position,
  ProviderSearchResult,
} from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { AssetSearchDropdown } from './AssetSearchDropdown';
import { PositionImportTab } from './PositionImportTab';
import { ImportResultsList, type ImportResultItem } from '@/components/ui/ImportResultsList';
import { CustodyCheckbox } from './CustodyCheckbox';
import { formatNumber, isStablecoinCategory } from '@/lib/utils';
import { Check } from 'lucide-react';

const CUSTODY_NAMES_KEY = 'foliobuddy-custody-names';
const LEGACY_CUSTODY_NAMES_KEY = 'pa-portfolio-custody-names';

function getCustodyNames(): string[] {
  try {
    // Migrate from legacy key
    const legacy = localStorage.getItem(LEGACY_CUSTODY_NAMES_KEY);
    if (legacy !== null) {
      localStorage.setItem(CUSTODY_NAMES_KEY, legacy);
      localStorage.removeItem(LEGACY_CUSTODY_NAMES_KEY);
      return JSON.parse(legacy);
    }
    const stored = localStorage.getItem(CUSTODY_NAMES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCustodyName(name: string) {
  const names = getCustodyNames();
  if (!names.includes(name)) {
    names.push(name);
    names.sort();
    localStorage.setItem(CUSTODY_NAMES_KEY, JSON.stringify(names));
  }
}

interface PositionFormProps {
  position?: Position;
  onSuccess: () => void;
  cryptoCount?: number;
  stablesCount?: number;
  /** Existing custody names derived from positions */
  existingCustodyNames?: string[];
}

type CategoryType = 'crypto' | 'cash' | 'equity';
type FormMode = 'add' | 'import';

type ImportedPosition = BulkImportPosition;

const STORAGE_TYPES = [
  { value: 'CEX', label: 'CEX' },
  { value: 'WALLET', label: 'Onchain' },
];

const EQUITY_STORAGE_TYPES = [{ value: 'BROKERAGE', label: 'Brokerage' }];

// Alphabetically sorted, with Others at the end
const CEX_LOCATIONS = ['Binance', 'Bybit', 'Coinbase', 'Others'];
const ONCHAIN_LOCATIONS = ['Ledger', 'Metamask', 'Rabby', 'SOL wallet', 'Others'];
const BROKERAGE_LOCATIONS = ['FSMOne', 'Tiger', 'UOB Kay Hian', 'Others'];

function locationOptionsForStorageType(storageType: string | null | undefined): string[] {
  if (storageType === 'CEX') return CEX_LOCATIONS;
  if (storageType === 'BROKERAGE') return BROKERAGE_LOCATIONS;
  return ONCHAIN_LOCATIONS;
}

// Custom order: USDT, USDC, USDe, FDUSD, DAI
const TOP_STABLECOINS = [
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { id: 'ethena-usde', symbol: 'USDe', name: 'Ethena USDe' },
  { id: 'first-digital-usd', symbol: 'FDUSD', name: 'First Digital USD' },
  { id: 'dai', symbol: 'DAI', name: 'Dai' },
];

const MAX_POSITIONS_PER_CATEGORY = 20;

export function PositionForm({
  position,
  onSuccess,
  cryptoCount = 0,
  stablesCount = 0,
  existingCustodyNames = [],
}: PositionFormProps) {
  // Form mode state (add new or import)
  const [mode, setMode] = useState<FormMode>('add');
  const [editMode, setEditMode] = useState<'edit' | 'delta'>('edit');
  const [deltaMode, setDeltaMode] = useState<'add' | 'reduce'>('add');
  const queryClient = useQueryClient();

  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPositions, setParsedPositions] = useState<ImportedPosition[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResultItem[] | null>(null);

  // Category state
  const [category, setCategory] = useState<CategoryType>(() => {
    if (position?.asset.category === 'EQUITY') return 'equity';
    if (isStablecoinCategory(position?.asset.category)) return 'cash';
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
    const loc = position.storageLocation;
    const options = locationOptionsForStorageType(position.storageType);
    if (!options.slice(0, -1).includes(loc)) {
      return 'Others';
    }
    return loc;
  });
  const [customLocation, setCustomLocation] = useState(() => {
    if (!position?.storageLocation) return '';
    const loc = position.storageLocation;
    const options = locationOptionsForStorageType(position.storageType);
    if (!options.slice(0, -1).includes(loc)) {
      return loc;
    }
    return '';
  });
  const [isCustody, setIsCustody] = useState(!!position?.custodyOf);
  const [custodyOf, setCustodyOf] = useState(position?.custodyOf || '');
  const [addingNewName, setAddingNewName] = useState(false);
  const [newNameInput, setNewNameInput] = useState('');
  const [custodyNamesVersion, setCustodyNamesVersion] = useState(0);

  // Merge stored names + names from existing positions into a deduplicated sorted list
  const custodyNameOptions = useMemo(() => {
    const stored = getCustodyNames();
    const all = new Set([...stored, ...existingCustodyNames]);
    return Array.from(all).sort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCustodyNames, custodyNamesVersion]);
  const [notes, setNotes] = useState(position?.notes || '');
  const [additionalQuantity, setAdditionalQuantity] = useState('');
  const [additionalTotalCost, setAdditionalTotalCost] = useState('');

  // Hooks
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(
    category === 'equity' ? '' : searchQuery
  );
  const { data: equitySearchResults, isLoading: equitySearchLoading } = useSearchAssets(
    category === 'equity' ? searchQuery : '',
    { category: 'EQUITY', provider: 'yahoo' }
  );
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createAssetFromProvider = useCreateAssetFromProvider();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isEditing = !!position;
  const isLoading =
    createPosition.isPending ||
    updatePosition.isPending ||
    createAssetFromCoinGecko.isPending ||
    createAssetFromProvider.isPending;

  // Form validation
  const isFormValid = useMemo(() => {
    if (!assetId) return false;
    if (!quantity || parseFloat(quantity) <= 0) return false;
    return true;
  }, [assetId, quantity]);

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
    setParsedPositions(null);
    setImportResults(null);

    if (!text.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const positions = Array.isArray(parsed) ? parsed : [parsed];

      // Validate structure
      for (const pos of positions) {
        if (!pos.asset?.symbol || !pos.asset?.name) {
          throw new Error('Invalid format: missing asset symbol or name');
        }
        if (typeof pos.quantity !== 'number' || pos.quantity <= 0) {
          throw new Error('Invalid format: quantity must be a positive number');
        }
        if (typeof pos.avgCostUsd !== 'number' || pos.avgCostUsd < 0) {
          throw new Error('Invalid format: avgCostUsd must be a non-negative number');
        }
      }

      setParsedPositions(positions);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedPositions) return;

    setImporting(true);

    // Stamp custodyOf on all positions if custody checkbox is checked
    const positionsToImport = isCustody
      ? parsedPositions.map((p) => ({ ...p, custodyOf: custodyOf.trim() || 'Someone' }))
      : parsedPositions;

    try {
      const response = await api.bulkImportPositions(positionsToImport);
      setImportResults(response.results.map((r) => ({ ...r, label: r.symbol })));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh positions data
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  };

  const resetImportState = () => {
    setJsonInput('');
    setParseError(null);
    setParsedPositions(null);
    setImportResults(null);
  };

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

  const addPreview = useMemo(() => {
    if (!position || editMode !== 'delta') return null;
    const deltaQty = parseFloat(additionalQuantity);
    const deltaCost =
      deltaMode === 'reduce' ? deltaQty * position.avgCostUsd : parseFloat(additionalTotalCost);
    if (!(deltaQty > 0) || !(deltaCost >= 0)) return null;

    const currentTotalCost = position.quantity * position.avgCostUsd;
    const multiplier = deltaMode === 'add' ? 1 : -1;
    const nextQuantity = position.quantity + deltaQty * multiplier;
    const nextTotalCost = currentTotalCost + deltaCost * multiplier;
    if (nextQuantity < 0 || nextTotalCost < 0) return null;
    const nextAvgCost = nextQuantity > 0 ? nextTotalCost / nextQuantity : 0;

    return {
      currentQuantity: position.quantity,
      currentAvgCost: position.avgCostUsd,
      currentTotalCost,
      nextQuantity,
      nextAvgCost,
      nextTotalCost,
    };
  }, [position, editMode, additionalQuantity, additionalTotalCost, deltaMode]);

  // Filter existing assets based on search and category
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    let filtered = assets;

    if (category === 'crypto') {
      filtered = filtered.filter(
        (a) =>
          !isStablecoinCategory(a.category) &&
          a.category !== 'EQUITY' &&
          a.category !== 'UNIT_TRUST'
      );
    } else if (category === 'equity') {
      filtered = filtered.filter((a) => a.category === 'EQUITY');
    }

    if (searchQuery.length > 0) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (a) => a.symbol.toLowerCase().includes(query) || a.name.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [assets, category, searchQuery]);

  // Combine existing assets with search results (for crypto + equity)
  const combinedResults = useMemo(() => {
    if (category === 'cash') return [];

    const results: Array<{
      type: 'existing' | 'search';
      asset?: Asset;
      coin?: CoinSearchResult | ProviderSearchResult;
    }> = [];

    filteredAssets.forEach((asset) => {
      results.push({ type: 'existing', asset });
    });

    if (category === 'crypto' && searchResults && searchQuery.length >= 1) {
      searchResults.forEach((coin) => {
        const existsInPortfolio = assets?.some(
          (a) => a.coingeckoId === coin.id || a.symbol.toLowerCase() === coin.symbol.toLowerCase()
        );
        if (!existsInPortfolio) {
          results.push({ type: 'search', coin });
        }
      });
    }

    if (category === 'equity' && equitySearchResults && searchQuery.length >= 1) {
      equitySearchResults.forEach((candidate) => {
        const existsInPortfolio = assets?.some(
          (a) =>
            (a.priceProvider === 'yahoo' && a.providerAssetId === candidate.providerAssetId) ||
            a.symbol.toLowerCase() === candidate.symbol.toLowerCase()
        );
        if (!existsInPortfolio) {
          results.push({ type: 'search', coin: candidate });
        }
      });
    }

    return results;
  }, [filteredAssets, searchResults, equitySearchResults, searchQuery, category, assets]);

  const handleSelectExistingAsset = (asset: Asset) => {
    setAssetId(asset.id);
    setSelectedAsset(asset);
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleSelectCoin = async (candidate: CoinSearchResult | ProviderSearchResult) => {
    let asset: Asset;
    if ('provider' in candidate) {
      asset = await createAssetFromProvider.mutateAsync({
        provider: candidate.provider,
        providerAssetId: candidate.providerAssetId,
        symbol: candidate.symbol,
        name: candidate.name,
        category: 'EQUITY',
        nativeCurrency: candidate.nativeCurrency ?? undefined,
        exchange: candidate.exchange ?? null,
      });
    } else {
      asset = await createAssetFromCoinGecko.mutateAsync({
        coingeckoId: candidate.id,
        symbol: candidate.symbol,
        name: candidate.name,
        category: category === 'cash' ? 'STABLECOIN' : 'LIQUID_CRYPTO',
      });
    }

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
        setHighlightedIndex((prev) => (prev < combinedResults.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : combinedResults.length - 1));
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

  // Track stablecoin selection separately for immediate UI feedback
  const [selectedStablecoinId, setSelectedStablecoinId] = useState<string>(
    position?.asset.coingeckoId || ''
  );

  const handleSelectStablecoin = async (coinId: string) => {
    setSelectedStablecoinId(coinId);
    setError(null);

    const stablecoin = TOP_STABLECOINS.find((s) => s.id === coinId);
    if (!stablecoin) return;

    const existingAsset = assets?.find((a) => a.coingeckoId === coinId);
    if (existingAsset) {
      setAssetId(existingAsset.id);
      setSelectedAsset(existingAsset);
      return;
    }

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
      setStorageType(category === 'equity' ? 'BROKERAGE' : 'CEX');
    }
  }, [category, isEditing]);

  // Reset import state when mode changes
  useEffect(() => {
    if (mode === 'add') {
      resetImportState();
    }
  }, [mode]);

  // Reset storage location when storage type changes
  useEffect(() => {
    if (!isEditing) {
      setStorageLocation('');
      setCustomLocation('');
    }
  }, [storageType, isEditing]);

  const locationOptions = locationOptionsForStorageType(storageType);

  const handleCustodySave = () => {
    if (isCustody && custodyOf.trim()) {
      saveCustodyName(custodyOf.trim());
      setCustodyNamesVersion((v) => v + 1);
    }
  };

  const handleAddNewName = () => {
    const name = newNameInput.trim();
    if (name) {
      saveCustodyName(name);
      setCustodyNamesVersion((v) => v + 1);
      setCustodyOf(name);
      setNewNameInput('');
      setAddingNewName(false);
    }
  };

  const handleCustodyChange = (checked: boolean) => {
    setIsCustody(checked);
    if (!checked) {
      setCustodyOf('');
      setAddingNewName(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    if (isEditing && editMode === 'delta' && position) {
      const deltaQty = parseFloat(additionalQuantity);
      const deltaCost =
        deltaMode === 'reduce' ? deltaQty * position.avgCostUsd : parseFloat(additionalTotalCost);

      if (!(deltaQty > 0)) {
        setValidationError(`Please enter a valid ${deltaMode} quantity`);
        return;
      }

      if (deltaMode === 'add' && !(deltaCost >= 0)) {
        setValidationError(`Please enter a valid ${deltaMode} total cost`);
        return;
      }

      const currentTotalCost = position.quantity * position.avgCostUsd;
      const multiplier = deltaMode === 'add' ? 1 : -1;
      const nextQuantity = position.quantity + deltaQty * multiplier;
      const nextTotalCost = currentTotalCost + deltaCost * multiplier;

      if (nextQuantity < 0) {
        setValidationError('You cannot reduce below zero quantity');
        return;
      }

      if (nextTotalCost < 0) {
        setValidationError('You cannot reduce more cost basis than the position has');
        return;
      }

      const nextAvgCost = nextQuantity > 0 ? nextTotalCost / nextQuantity : 0;

      try {
        await updatePosition.mutateAsync({
          id: position.id,
          data: {
            quantity: nextQuantity,
            avgCostUsd: nextAvgCost,
            custodyOf: isCustody ? custodyOf.trim() || 'Someone' : '',
          },
        });
        handleCustodySave();
        onSuccess();
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to save position';
        setError(errorMessage);
      }
      return;
    }

    // Validate required fields
    if (!isFormValid) {
      if (!assetId) {
        setValidationError('Please select an asset');
      } else if (!quantity || parseFloat(quantity) <= 0) {
        setValidationError('Please enter a valid quantity');
      }
      return;
    }

    // Check position limit before submitting (crypto + stables only; equities unbounded)
    if (!isEditing && category !== 'equity') {
      const currentCount = category === 'crypto' ? cryptoCount : stablesCount;
      if (currentCount >= MAX_POSITIONS_PER_CATEGORY) {
        setError(
          `Maximum ${MAX_POSITIONS_PER_CATEGORY} ${category === 'crypto' ? 'crypto' : 'stables'} positions allowed`
        );
        return;
      }
    }

    // Determine final storage location value
    const finalStorageLocation = storageLocation === 'Others' ? customLocation : storageLocation;

    const data = {
      assetId,
      quantity: parseFloat(quantity),
      avgCostUsd: category === 'cash' ? 1 : parseFloat(avgCostUsd) || 0,
      storageType: storageType as 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE',
      storageLocation: finalStorageLocation || undefined,
      notes: notes.trim() || undefined,
      custodyOf: isCustody ? custodyOf.trim() || 'Someone' : isEditing ? '' : undefined,
    };

    try {
      if (isEditing) {
        await updatePosition.mutateAsync({ id: position.id, data });
      } else {
        await createPosition.mutateAsync(data);
      }
      handleCustodySave();
      onSuccess();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save position';
      setError(errorMessage);
    }
  };

  // If showing import results, show the results UI
  if (mode === 'import' && importResults) {
    return <ImportResultsList results={importResults} onDone={onSuccess} />;
  }

  return (
    <div className="space-y-3">
      {/* Custody checkbox — applies to both Add, Import, and Edit */}
      <CustodyCheckbox
        id={isEditing ? 'isCustodyEdit' : 'isCustody'}
        isCustody={isCustody}
        custodyOf={custodyOf}
        addingNewName={addingNewName}
        newNameInput={newNameInput}
        custodyNameOptions={custodyNameOptions}
        showDescription={!isEditing}
        onCustodyChange={handleCustodyChange}
        onCustodyOfChange={setCustodyOf}
        onStartAddingName={() => {
          setAddingNewName(true);
          setNewNameInput('');
        }}
        onNewNameInputChange={setNewNameInput}
        onAddNewName={handleAddNewName}
        onCancelAddingName={() => setAddingNewName(false)}
      />

      {/* Mode Selection (Add New vs Import) */}
      {!isEditing && (
        <div className="flex border-b mb-2" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'add'}
            onClick={() => setMode('add')}
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
            role="tab"
            aria-selected={mode === 'import'}
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

      {mode === 'import' && !isEditing ? (
        <PositionImportTab
          jsonInput={jsonInput}
          parseError={parseError}
          parsedPositions={parsedPositions}
          importing={importing}
          isCustody={isCustody}
          custodyOf={custodyOf}
          onJsonChange={(value) => {
            setJsonInput(value);
            parseJson(value);
          }}
          onPaste={handlePaste}
          onImport={() => {
            handleCustodySave();
            handleImport();
          }}
        />
      ) : (
        /* Add New Mode */
        <form onSubmit={handleSubmit} className="space-y-3">
          {isEditing && (
            <div className="flex border-b mb-2" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={editMode === 'edit'}
                onClick={() => setEditMode('edit')}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  editMode === 'edit'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Edit Totals
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={editMode === 'delta'}
                onClick={() => setEditMode('delta')}
                className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  editMode === 'delta'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Add/Reduce Position
              </button>
            </div>
          )}

          {isEditing && editMode === 'delta' && position ? (
            <>
              <div className="rounded-md border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">{position.asset.symbol}</p>
                    <p className="text-sm text-muted-foreground">{position.asset.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Current quantity</p>
                    <p className="font-mono text-sm">
                      {isStablecoinCategory(position.asset.category)
                        ? formatNumber(position.quantity, 0)
                        : formatNumber(position.quantity, 4)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDeltaMode('add')}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    deltaMode === 'add'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {deltaMode === 'add' && <Check className="h-4 w-4" />}
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => setDeltaMode('reduce')}
                  className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    deltaMode === 'reduce'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {deltaMode === 'reduce' && <Check className="h-4 w-4" />}
                  Reduce
                </button>
              </div>

              <div className="space-y-1">
                <Label htmlFor="additionalQuantity" className="text-sm">
                  {deltaMode === 'add' ? 'Additional Quantity' : 'Reduce Quantity'}
                </Label>
                <Input
                  id="additionalQuantity"
                  type="number"
                  step="any"
                  value={additionalQuantity}
                  onChange={(e) => {
                    setAdditionalQuantity(e.target.value);
                    setValidationError(null);
                  }}
                  placeholder="0.00"
                  required
                />
              </div>

              {deltaMode === 'add' ? (
                <div className="space-y-1">
                  <Label htmlFor="additionalTotalCost" className="text-sm">
                    Additional Total Cost (USD)
                  </Label>
                  <Input
                    id="additionalTotalCost"
                    type="number"
                    step="any"
                    value={additionalTotalCost}
                    onChange={(e) => {
                      setAdditionalTotalCost(e.target.value);
                      setValidationError(null);
                    }}
                    placeholder="0.00"
                    required
                  />
                </div>
              ) : (
                <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Cost basis will be reduced automatically using the current average cost.
                </div>
              )}

              {addPreview && (
                <div className="rounded-md border bg-muted/20 p-3">
                  <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-x-4 gap-y-2 text-sm">
                    <div />
                    <div className="text-right text-xs text-muted-foreground">Quantity</div>
                    <div className="text-right text-xs text-muted-foreground">Avg Cost</div>
                    <div className="text-right text-xs text-muted-foreground">Total Cost</div>

                    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      Old
                    </div>
                    <div className="text-right font-mono text-muted-foreground">
                      {isStablecoinCategory(position.asset.category)
                        ? formatNumber(addPreview.currentQuantity, 0)
                        : formatNumber(addPreview.currentQuantity, 4)}
                    </div>
                    <div className="text-right font-mono text-muted-foreground">
                      {addPreview.currentAvgCost.toFixed(addPreview.currentAvgCost >= 1000 ? 0 : 2)}
                    </div>
                    <div className="text-right font-mono text-muted-foreground">
                      {addPreview.currentTotalCost.toFixed(0)}
                    </div>

                    <div className="text-[11px] font-medium uppercase tracking-wide text-primary">
                      New
                    </div>
                    <div className="text-right font-mono font-medium text-primary">
                      {isStablecoinCategory(position.asset.category)
                        ? formatNumber(addPreview.nextQuantity, 0)
                        : formatNumber(addPreview.nextQuantity, 4)}
                    </div>
                    <div className="text-right font-mono font-medium text-primary">
                      {addPreview.nextAvgCost.toFixed(addPreview.nextAvgCost >= 1000 ? 0 : 2)}
                    </div>
                    <div className="text-right font-mono font-medium text-primary">
                      {addPreview.nextTotalCost.toFixed(0)}
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                  {error}
                </div>
              )}

              {validationError && (
                <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded-md">
                  {validationError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isLoading}>
                  {isLoading
                    ? 'Saving...'
                    : deltaMode === 'add'
                      ? 'Add to Position'
                      : 'Reduce Position'}
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Category Selection */}
              {!isEditing && (
                <div className="space-y-1">
                  <Label htmlFor="pos-category" className="text-sm">
                    Category
                  </Label>
                  <Select value={category} onValueChange={(v) => setCategory(v as CategoryType)}>
                    <SelectTrigger id="pos-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="cash">Stables</SelectItem>
                      <SelectItem value="equity">Equity</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Asset Selection - Different UI for Crypto/Equity vs Cash */}
              {category !== 'cash' ? (
                <div className="space-y-1">
                  <Label htmlFor="pos-asset" className="text-sm">
                    Asset
                  </Label>
                  <AssetSearchDropdown
                    selectedAsset={selectedAsset}
                    searchQuery={searchQuery}
                    showDropdown={showDropdown}
                    highlightedIndex={highlightedIndex}
                    searchLoading={category === 'equity' ? equitySearchLoading : searchLoading}
                    combinedResults={combinedResults}
                    isEditing={isEditing}
                    placeholder={
                      category === 'equity'
                        ? 'Search ticker (e.g. AAPL, D05.SI)'
                        : 'Search for a coin...'
                    }
                    positionAssetSymbol={position?.asset.symbol}
                    positionAssetName={position?.asset.name}
                    onSearchChange={(value) => {
                      setSearchQuery(value);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    onKeyDown={handleSearchKeyDown}
                    onSelectExistingAsset={handleSelectExistingAsset}
                    onSelectCoin={handleSelectCoin}
                    onClearSelection={() => {
                      setAssetId('');
                      setSelectedAsset(null);
                    }}
                    setHighlightedIndex={setHighlightedIndex}
                    setValidationError={setValidationError}
                  />
                </div>
              ) : (
                /* Cash / Stablecoin Selection */
                <div className="space-y-1">
                  <Label htmlFor="pos-stablecoin" className="text-sm">
                    Stablecoin
                  </Label>
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
                      <SelectTrigger id="pos-stablecoin">
                        <SelectValue
                          placeholder={
                            createAssetFromCoinGecko.isPending
                              ? 'Loading...'
                              : 'Select a stablecoin'
                          }
                        />
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
                  {category === 'cash' ? 'Amount' : category === 'equity' ? 'Shares' : 'Quantity'}
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

              {/* Total Cost & Average Cost (Crypto + Equity) */}
              {category !== 'cash' && (
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
                      <span
                        className={
                          costInputMode === 'total' ? 'font-medium' : 'text-muted-foreground'
                        }
                      >
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
                      <span
                        className={
                          costInputMode === 'avg' ? 'font-medium' : 'text-muted-foreground'
                        }
                      >
                        Avg Cost
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="totalCost" className="text-sm">
                        Total Cost (USD)
                      </Label>
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
                      <Label htmlFor="avgCost" className="text-sm">
                        Average Cost (USD)
                      </Label>
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
                <Label htmlFor="pos-storage-type" className="text-sm">
                  Storage Type
                </Label>
                <Select
                  value={storageType}
                  onValueChange={(value) =>
                    setStorageType(value as 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE')
                  }
                >
                  <SelectTrigger id="pos-storage-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(category === 'equity' ? EQUITY_STORAGE_TYPES : STORAGE_TYPES).map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Storage Location */}
              <div className="space-y-1">
                <Label htmlFor="pos-storage-location" className="text-sm">
                  Storage Location (Optional)
                </Label>
                <Select
                  value={storageLocation}
                  onValueChange={(v) => {
                    setStorageLocation(v);
                    if (v !== 'Others') {
                      setCustomLocation('');
                    }
                  }}
                >
                  <SelectTrigger id="pos-storage-location">
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

              <div className="space-y-1">
                <Label htmlFor="notes" className="text-sm">
                  Notes (Optional)
                </Label>
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

              {/* Position Limit Info (crypto + stables only) */}
              {!isEditing && category !== 'equity' && (
                <div className="text-xs text-muted-foreground">
                  {category === 'crypto' ? cryptoCount : stablesCount} /{' '}
                  {MAX_POSITIONS_PER_CATEGORY} {category === 'crypto' ? 'crypto' : 'stables'}{' '}
                  positions
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="submit"
                  disabled={isLoading}
                  className={!isFormValid && !isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                >
                  {isLoading ? 'Saving...' : isEditing ? 'Update Position' : 'Add Position'}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
