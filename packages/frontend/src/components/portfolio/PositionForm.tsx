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
import {
  useAssets,
  useSearchCoins,
  useSearchAssets,
  useCreateAssetFromCoinGecko,
  useCreateAssetFromProvider,
  useCreateUnitTrust,
} from '@/hooks/useAssets';
import { useCreatePosition, useUpdatePosition, usePortfolioSummary } from '@/hooks/usePortfolio';
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
import { Check, Upload } from 'lucide-react';
import type { ParsedStatementHolding } from '@/lib/types';

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

// Pulls fund code + readable name from a Fundsupermart factsheet URL.
// e.g. .../factsheet/370007/Amova-Singapore-Equity-SGD- → { code: "370007", name: "Amova Singapore Equity SGD" }
// NAV and currency aren't in the URL — user enters those manually.
function parseFundUrl(raw: string): { code: string; name: string } | null {
  try {
    const url = new URL(raw.trim());
    const match = url.pathname.match(/\/factsheet\/(\d+)(?:\/([^/]+))?/);
    if (!match) return null;
    const code = match[1];
    const slug = match[2] ? decodeURIComponent(match[2]) : '';
    const name = slug.replace(/-+$/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
    return { code, name };
  } catch {
    return null;
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
type EquityMode = 'single' | 'fund';
type FormMode = 'add' | 'import';

type ImportedPosition = BulkImportPosition;

const STORAGE_TYPES = [
  { value: 'CEX', label: 'CEX' },
  { value: 'WALLET', label: 'Onchain' },
];

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

  // Category state (Equities covers both single stocks and fund-level holdings)
  const [category, setCategory] = useState<CategoryType>(() => {
    if (position?.asset.category === 'EQUITY' || position?.asset.category === 'UNIT_TRUST')
      return 'equity';
    if (isStablecoinCategory(position?.asset.category)) return 'cash';
    return 'crypto';
  });

  // Sub-mode when category === 'equity': 'single' = stock ticker, 'fund' = unit-trust flow
  const [equityMode, setEquityMode] = useState<EquityMode>(() =>
    position?.asset.category === 'UNIT_TRUST' ? 'fund' : 'single'
  );

  // Fund-level (unit trust) form state — only used when category === 'equity' && equityMode === 'fund' && !isEditing
  const [utSymbol, setUtSymbol] = useState('');
  const [utName, setUtName] = useState('');
  const [utNativeCurrency, setUtNativeCurrency] = useState<'SGD' | 'USD'>('SGD');
  const [utIsin, setUtIsin] = useState('');
  const [utFactsheetUrl, setUtFactsheetUrl] = useState('');
  // Tracks the last fund-name we wrote from a parsed factsheet URL. Lets us
  // overwrite a stale auto-fill when the URL is replaced — without clobbering
  // a name the user has manually edited.
  const lastAutoFilledFundName = useRef('');
  const [utNav, setUtNav] = useState('');
  const [utNavAsOfDate, setUtNavAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [utUploading, setUtUploading] = useState(false);
  const [utUploadError, setUtUploadError] = useState<string | null>(null);
  const [utDragOver, setUtDragOver] = useState(false);
  const [utPrefilledFrom, setUtPrefilledFrom] = useState<string | null>(null);
  const [utMultipleHoldings, setUtMultipleHoldings] = useState<ParsedStatementHolding[] | null>(
    null
  );
  // usdPerSgd: 1 SGD = x USD. Used to convert SGD cost input to USD on submit.
  // Defaults to ~0.74 (≈ 1/1.35). Overwritten by the PDF parse response when available.
  const [utUsdPerNative, setUtUsdPerNative] = useState<number>(1 / 1.35);
  const [utYahooSymbol, setUtYahooSymbol] = useState<string | null>(null);

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
  // Tracks whether we've populated cost fields for an existing position.
  // For SGD-denominated edits we wait for portfolioSummary so the displayed
  // SGD values match the FX rate used on submit.
  const [costInitialized, setCostInitialized] = useState(false);
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
  const createUnitTrust = useCreateUnitTrust();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isEditing = !!position;
  const isLoading =
    createPosition.isPending ||
    updatePosition.isPending ||
    createAssetFromCoinGecko.isPending ||
    createAssetFromProvider.isPending ||
    createUnitTrust.isPending;

  // Live FX rate (SGD per 1 USD) — derived from portfolio summary so it matches displayed values.
  // Used to convert single-equity SGD inputs to USD on submit.
  const { data: portfolioSummary } = usePortfolioSummary();
  const fxSgdPerUsd = useMemo(() => {
    if (portfolioSummary && portfolioSummary.totalValueUsd > 0 && portfolioSummary.totalValueSgd > 0) {
      return portfolioSummary.totalValueSgd / portfolioSummary.totalValueUsd;
    }
    return 1.35;
  }, [portfolioSummary]);

  // Currency the user is entering cost in. USD unless the asset is SGD-denominated
  // (single equity with .SI ticker, or a SGD unit trust). Backend always stores USD.
  const costCurrency = useMemo<'USD' | 'SGD'>(() => {
    if (category !== 'equity') return 'USD';
    if (equityMode === 'fund' && !isEditing) return utNativeCurrency;
    const native = selectedAsset?.nativeCurrency?.toUpperCase();
    return native === 'SGD' ? 'SGD' : 'USD';
  }, [category, equityMode, isEditing, utNativeCurrency, selectedAsset]);

  // When editing an SGD-native position, re-display the stored USD cost basis in SGD.
  // Runs once per position; waits for portfolioSummary so the FX rate is real, not the
  // 1.35 fallback (would otherwise round-trip incorrectly on save).
  useEffect(() => {
    if (!position || costInitialized) return;
    if (costCurrency !== 'SGD') {
      setCostInitialized(true);
      return;
    }
    if (!portfolioSummary) return;
    const displayAvg = position.avgCostUsd * fxSgdPerUsd;
    const displayTotal = position.quantity * position.avgCostUsd * fxSgdPerUsd;
    setAvgCostInput(displayAvg.toFixed(2));
    setTotalCost(displayTotal.toFixed(2));
    setCostInitialized(true);
  }, [position, costCurrency, fxSgdPerUsd, portfolioSummary, costInitialized]);

  // Form validation
  const isFormValid = useMemo(() => {
    if (!quantity || parseFloat(quantity) <= 0) return false;
    if (category === 'equity' && equityMode === 'fund' && !isEditing) {
      if (!utSymbol.trim() || !utName.trim()) return false;
      if (!utNav || parseFloat(utNav) <= 0) return false;
      return true;
    }
    if (!assetId) return false;
    return true;
  }, [assetId, quantity, category, equityMode, isEditing, utSymbol, utName, utNav]);

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
    const rawDeltaCost = parseFloat(additionalTotalCost);
    const deltaCostAddUsd =
      costCurrency === 'SGD' ? rawDeltaCost / fxSgdPerUsd : rawDeltaCost;
    const deltaCost =
      deltaMode === 'reduce' ? deltaQty * position.avgCostUsd : deltaCostAddUsd;
    if (!(deltaQty > 0) || !(deltaCost >= 0)) return null;

    const currentTotalCost = position.quantity * position.avgCostUsd;
    const multiplier = deltaMode === 'add' ? 1 : -1;
    const nextQuantity = position.quantity + deltaQty * multiplier;
    const nextTotalCost = currentTotalCost + deltaCost * multiplier;
    if (nextQuantity < 0 || nextTotalCost < 0) return null;
    const nextAvgCost = nextQuantity > 0 ? nextTotalCost / nextQuantity : 0;

    const rate = costCurrency === 'SGD' ? fxSgdPerUsd : 1;
    return {
      currentQuantity: position.quantity,
      currentAvgCost: position.avgCostUsd * rate,
      currentTotalCost: currentTotalCost * rate,
      nextQuantity,
      nextAvgCost: nextAvgCost * rate,
      nextTotalCost: nextTotalCost * rate,
    };
  }, [position, editMode, additionalQuantity, additionalTotalCost, deltaMode, costCurrency, fxSgdPerUsd]);

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

  // Reset form when category or equity sub-mode changes
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
  }, [category, equityMode, isEditing]);

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

  const applyParsedHolding = (h: ParsedStatementHolding, broker: string) => {
    setUtSymbol(h.symbol);
    setUtName(h.name);
    setUtIsin(h.isin);
    const ccy = h.nativeCurrency === 'USD' ? 'USD' : 'SGD';
    setUtNativeCurrency(ccy);
    setUtNav(h.navNative.toString());
    if (h.navAsOfDate) {
      setUtNavAsOfDate(new Date(h.navAsOfDate).toISOString().slice(0, 10));
    }
    setQuantity(h.units.toString());
    setCostInputMode('total');
    // Prefill total cost in native currency when non-USD; store fx rate for later conversion
    const usdPerNative = h.fxRateToUsd ?? (ccy === 'USD' ? 1 : 1 / 1.35);
    setUtUsdPerNative(usdPerNative);
    setTotalCost(
      ccy === 'USD' ? h.totalCostUsd.toFixed(2) : h.totalCostNative.toFixed(2)
    );
    setStorageLocation(
      broker.includes('UOB')
        ? 'UOB Kay Hian'
        : /FSM|fundsupermart|iFAST/i.test(broker)
          ? 'FSMOne'
          : 'Others'
    );
    setUtPrefilledFrom(broker);
    setUtMultipleHoldings(null);
    setUtYahooSymbol(h.yahooSymbol ?? null);
  };

  const handleUploadStatement = async (file: File) => {
    setUtUploadError(null);
    setUtUploading(true);
    try {
      const result = await api.parseUnitTrustStatement(file);
      if (!result || !Array.isArray(result.holdings)) {
        throw new Error('Server returned an unexpected response');
      }
      if (result.holdings.length === 0) {
        throw new Error('No holdings found in the statement');
      }
      if (result.holdings.length === 1) {
        applyParsedHolding(result.holdings[0], result.broker);
      } else {
        setUtMultipleHoldings(result.holdings);
        setUtPrefilledFrom(result.broker);
      }
    } catch (err) {
      setUtUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUtUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    if (isEditing && editMode === 'delta' && position) {
      const deltaQty = parseFloat(additionalQuantity);
      // In add mode the user enters cost in costCurrency — convert to USD for persistence.
      // In reduce mode we shrink basis at current avg cost (already USD), no conversion needed.
      const deltaCostInput = parseFloat(additionalTotalCost);
      const deltaCostAddUsd =
        costCurrency === 'SGD' ? deltaCostInput / fxSgdPerUsd : deltaCostInput;
      const deltaCost =
        deltaMode === 'reduce' ? deltaQty * position.avgCostUsd : deltaCostAddUsd;

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

    // Check position limit before submitting (crypto + stables only; equities + unit trusts unbounded)
    if (!isEditing && (category === 'crypto' || category === 'cash')) {
      const currentCount = category === 'crypto' ? cryptoCount : stablesCount;
      if (currentCount >= MAX_POSITIONS_PER_CATEGORY) {
        setError(
          `Maximum ${MAX_POSITIONS_PER_CATEGORY} ${category === 'crypto' ? 'crypto' : 'stables'} positions allowed`
        );
        return;
      }
    }

    // Fund-level (unit trust) create path: create asset + initial NAV, then create position
    if (!isEditing && category === 'equity' && equityMode === 'fund') {
      const navNum = parseFloat(utNav);
      const qtyNum = parseFloat(quantity);
      const costNumInput = parseFloat(calculatedTotalCost);
      if (!(navNum > 0)) {
        setValidationError('NAV must be positive');
        return;
      }
      if (!(qtyNum > 0)) {
        setValidationError('Please enter a valid units quantity');
        return;
      }
      if (!(costNumInput >= 0)) {
        setValidationError('Total cost must be a non-negative number');
        return;
      }

      // Inputs are in the native currency (SGD or USD). The backend stores USD.
      const totalCostUsd =
        utNativeCurrency === 'USD' ? costNumInput : costNumInput * utUsdPerNative;

      const finalStorageLocation =
        storageLocation === 'Others' ? customLocation : storageLocation;

      try {
        const newAsset = await createUnitTrust.mutateAsync({
          symbol: utSymbol.trim().toUpperCase(),
          name: utName.trim(),
          nativeCurrency: utNativeCurrency,
          isin: utIsin.trim() || undefined,
          factsheetUrl: utFactsheetUrl.trim() || undefined,
          initialNav: navNum,
          navAsOfDate: new Date(utNavAsOfDate).toISOString(),
          yahooSymbol: utYahooSymbol ?? undefined,
        });

        if (!newAsset?.id) {
          throw new Error('Unit trust asset creation did not return an id');
        }

        await createPosition.mutateAsync({
          assetId: newAsset.id,
          quantity: qtyNum,
          avgCostUsd: qtyNum > 0 ? totalCostUsd / qtyNum : 0,
          storageType: 'BROKERAGE',
          storageLocation: finalStorageLocation || undefined,
          notes: notes.trim() || undefined,
          custodyOf: isCustody ? custodyOf.trim() || 'Someone' : undefined,
        });
        handleCustodySave();
        onSuccess();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create unit trust');
      }
      return;
    }

    // Determine final storage location value
    const finalStorageLocation = storageLocation === 'Others' ? customLocation : storageLocation;

    // Convert equity-SGD input to USD before persisting (backend stores USD).
    // Applies to both create and edit (single stocks and unit trusts).
    const rawAvgCost = category === 'cash' ? 1 : parseFloat(avgCostUsd) || 0;
    const finalAvgCostUsd =
      category === 'equity' && costCurrency === 'SGD'
        ? rawAvgCost / fxSgdPerUsd
        : rawAvgCost;

    const data = {
      assetId,
      quantity: parseFloat(quantity),
      avgCostUsd: finalAvgCostUsd,
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

  const custodyCheckbox = (
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
  );

  return (
    <div className="space-y-3">
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
          footerSlot={custodyCheckbox}
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
                    Additional Total Cost ({costCurrency})
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

              <div className="pt-3 border-t border-border/60">{custodyCheckbox}</div>

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
                      <SelectItem value="equity">Equities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Equity sub-type: Single stock vs Fund-level (unit trust) */}
              {!isEditing && category === 'equity' && (
                <div className="space-y-1">
                  <Label className="text-sm">Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEquityMode('single')}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        equityMode === 'single'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {equityMode === 'single' && <Check className="h-4 w-4" />}
                      Stock / ETF
                    </button>
                    <button
                      type="button"
                      onClick={() => setEquityMode('fund')}
                      className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                        equityMode === 'fund'
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {equityMode === 'fund' && <Check className="h-4 w-4" />}
                      Unit Trust
                    </button>
                  </div>
                </div>
              )}

              {/* Asset Selection - Single ticker vs Fund-level (PDF upload) vs Cash */}
              {category === 'equity' && equityMode === 'fund' && !isEditing ? (
                <div className="space-y-3">
                  <label
                    className={`block cursor-pointer rounded-md border border-dashed p-3 transition-colors ${
                      utDragOver
                        ? 'border-primary bg-primary/15'
                        : 'border-primary/40 bg-primary/5 hover:bg-primary/10'
                    }`}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!utUploading) setUtDragOver(true);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUtDragOver(false);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setUtDragOver(false);
                      if (utUploading) return;
                      const file = e.dataTransfer.files?.[0];
                      if (!file) return;
                      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
                        setUtUploadError('Please drop a PDF file');
                        return;
                      }
                      handleUploadStatement(file);
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">Upload monthly statement (PDF)</p>
                        <p className="text-xs text-muted-foreground">
                          Drag &amp; drop or click to upload. Supports UOB Kay Hian and FSMOne.
                        </p>
                      </div>
                      <input
                        type="file"
                        accept="application/pdf"
                        className="sr-only"
                        disabled={utUploading}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleUploadStatement(file);
                          e.target.value = '';
                        }}
                      />
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                        <Upload className="h-3.5 w-3.5" />
                        {utUploading ? 'Parsing...' : 'Upload PDF'}
                      </span>
                    </div>
                    {utUploadError && (
                      <p className="mt-2 text-xs text-destructive">{utUploadError}</p>
                    )}
                  </label>

                  {utMultipleHoldings && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <p className="text-sm font-medium">
                        Multiple holdings found — pick one to auto-fill:
                      </p>
                      <div className="space-y-1">
                        {utMultipleHoldings.map((h) => (
                          <button
                            key={h.isin}
                            type="button"
                            onClick={() => applyParsedHolding(h, utPrefilledFrom || '')}
                            className="w-full rounded border bg-background p-2 text-left text-sm hover:bg-accent"
                          >
                            <div className="font-medium">{h.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {formatNumber(h.units, 2)} units · NAV {h.nativeCurrency}{' '}
                              {h.navNative} · {h.isin}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {utPrefilledFrom && !utMultipleHoldings && (
                    <div className="space-y-1">
                      <div className="rounded-md border border-emerald-500/30 bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                        Pre-filled from {utPrefilledFrom} statement — please review before saving.
                      </div>
                      {utYahooSymbol && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-primary">
                          Auto-refreshing via Yahoo Finance ({utYahooSymbol}). Future NAV updates
                          will be pulled automatically.
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ut-symbol" className="text-sm">
                        Symbol / Code
                      </Label>
                      <Input
                        id="ut-symbol"
                        value={utSymbol}
                        onChange={(e) => setUtSymbol(e.target.value)}
                        placeholder="e.g. AMOVA"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ut-currency" className="text-sm">
                        Currency
                      </Label>
                      <Select
                        value={utNativeCurrency}
                        onValueChange={(v) => setUtNativeCurrency(v as 'SGD' | 'USD')}
                      >
                        <SelectTrigger id="ut-currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="SGD">SGD</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="ut-name" className="text-sm">
                      Fund Name
                    </Label>
                    <Input
                      id="ut-name"
                      value={utName}
                      onChange={(e) => setUtName(e.target.value)}
                      placeholder="e.g. AMOVA Singapore Equity"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ut-isin" className="text-sm">
                        ISIN (Optional)
                      </Label>
                      <Input
                        id="ut-isin"
                        value={utIsin}
                        onChange={(e) => setUtIsin(e.target.value)}
                        placeholder="SG9999000001"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ut-factsheet" className="text-sm">
                        Factsheet URL (Optional)
                      </Label>
                      <Input
                        id="ut-factsheet"
                        value={utFactsheetUrl}
                        onChange={(e) => {
                          const value = e.target.value;
                          setUtFactsheetUrl(value);
                          // Auto-fill the fund name from FSM factsheet URLs. Symbol stays
                          // user-controlled — the FSM numeric code (e.g. "370007") would
                          // collide with the mnemonic symbol used by the statement-import
                          // path, breaking dedup in /assets/unit-trust.
                          const parsed = parseFundUrl(value);
                          if (!parsed?.name) return;
                          // Overwrite when the field is empty or still holds the previous
                          // auto-fill — but never when the user has typed something else.
                          const isEmpty = !utName.trim();
                          const isStaleAutoFill =
                            lastAutoFilledFundName.current !== '' &&
                            utName === lastAutoFilledFundName.current;
                          if (isEmpty || isStaleAutoFill) {
                            setUtName(parsed.name);
                            lastAutoFilledFundName.current = parsed.name;
                          }
                        }}
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="ut-nav" className="text-sm">
                        NAV ({utNativeCurrency})
                      </Label>
                      <Input
                        id="ut-nav"
                        type="number"
                        step="any"
                        value={utNav}
                        onChange={(e) => setUtNav(e.target.value)}
                        placeholder="1.234"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ut-nav-date" className="text-sm">
                        NAV Date
                      </Label>
                      <Input
                        id="ut-nav-date"
                        type="date"
                        value={utNavAsOfDate}
                        onChange={(e) => setUtNavAsOfDate(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : category !== 'cash' ? (
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
                  {category === 'cash'
                    ? 'Amount'
                    : category === 'equity'
                      ? equityMode === 'fund'
                        ? 'Units'
                        : 'Shares'
                      : 'Quantity'}
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
                        Total Cost ({costCurrency})
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
                        Average Cost ({costCurrency})
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
                  {!isEditing &&
                    category === 'equity' &&
                    equityMode === 'fund' &&
                    utNativeCurrency !== 'USD' && (
                      <p className="text-xs text-muted-foreground">
                        Stored internally as USD ({utUsdPerNative.toFixed(4)} USD per{' '}
                        {utNativeCurrency}).
                      </p>
                    )}
                  {category === 'equity' &&
                    !(equityMode === 'fund' && !isEditing) &&
                    costCurrency === 'SGD' && (
                      <p className="text-xs text-muted-foreground">
                        Stored internally as USD ({(1 / fxSgdPerUsd).toFixed(4)} USD per SGD).
                      </p>
                    )}
                </div>
              )}

              {/* Storage Type — for equities the dropdown holds broker names
                  (storageType is always BROKERAGE behind the scenes, set via category effect) */}
              <div className="space-y-1">
                <Label htmlFor="pos-storage-type" className="text-sm">
                  Storage Type
                </Label>
                {category === 'equity' ? (
                  <>
                    <Select
                      value={storageLocation}
                      onValueChange={(v) => {
                        setStorageLocation(v);
                        if (v !== 'Others') setCustomLocation('');
                      }}
                    >
                      <SelectTrigger id="pos-storage-type">
                        <SelectValue placeholder="Select broker" />
                      </SelectTrigger>
                      <SelectContent>
                        {BROKERAGE_LOCATIONS.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {storageLocation === 'Others' && (
                      <Input
                        value={customLocation}
                        onChange={(e) => setCustomLocation(e.target.value)}
                        placeholder="Enter custom broker..."
                        className="mt-2"
                      />
                    )}
                  </>
                ) : (
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
                      {STORAGE_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Storage Location — hidden for equities (broker already captured above) */}
              {category !== 'equity' && (
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
              )}

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

              <div className="pt-3 border-t border-border/60">{custodyCheckbox}</div>

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
