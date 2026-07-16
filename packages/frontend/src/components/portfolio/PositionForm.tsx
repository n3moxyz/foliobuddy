import { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateAsset,
  useAssets,
  useSearchCoins,
  useSearchAssets,
  useCreateAssetFromCoinGecko,
  useCreateAssetFromProvider,
  useCreateUnitTrust,
  useUpdateAssetNav,
} from '@/hooks/useAssets';
import {
  useCreatePosition,
  useUpdatePosition,
  usePositions,
  usePortfolioSummary,
  useFxRates,
} from '@/hooks/usePortfolio';
import {
  USD_SGD_FALLBACK_RATE,
  USD_JPY_FALLBACK_RATE,
  USD_TWD_FALLBACK_RATE,
  USD_KRW_FALLBACK_RATE,
  USD_NOK_FALLBACK_RATE,
  applyPositionDelta,
} from '@foliobuddy/shared';
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
import { Checkbox } from '@/components/ui/checkbox';
import { isNonNegativeNumberInput, isPositiveNumberInput } from '@/lib/formValidation';
import { formatCurrency, formatNumber, isStablecoinCategory, currencyDecimals } from '@/lib/utils';
import { Check, Upload } from 'lucide-react';
import type { ParsedStatementHolding } from '@/lib/types';
import { PositionCostFields } from './PositionCostFields';
import { PositionDeltaEditor } from './PositionDeltaEditor';
import { PositionStorageFields } from './PositionStorageFields';
import {
  CRYPTO_STORAGE_TYPES,
  FIAT_CASH_STORAGE_TYPES,
  customLocationOptionsForStorageType,
  deleteLocationOptionForStorageType,
  locationLabelForStorageType,
  locationOptionsForStorageType,
  renameLocationOptionForStorageType,
  saveLocationOptionForStorageType,
} from './positionOptions';
import {
  buildPositionDeltaPreview,
  calculateAverageCostInput,
  calculateNonNegativeAverageCostInput,
  calculateNonNegativeTotalCostInput,
  calculateTotalCostInput,
  costCurrencyDisplayRate,
  inferListedEquityCostCurrency,
  normalizeCostCurrency,
  toUsdCost,
  usdPerCostCurrency,
  type CostCurrency,
  type CostInputMode,
} from './positionFormMath';
import {
  findMatchingUnitTrustPosition,
  statementBrokerStorageLocation,
  type UnitTrustStatementMatch,
} from './statementMatching';
import type { CategoryType, EquityMode, FormMode, PositionStorageType } from './positionFormTypes';
import type { PositionDeltaMode } from '@foliobuddy/shared';

const CUSTODY_NAMES_KEY = 'foliobuddy-custody-names';
const LEGACY_CUSTODY_NAMES_KEY = 'pa-portfolio-custody-names';
const STATEMENT_MATCH_REASON_LABEL: Record<UnitTrustStatementMatch['reason'], string> = {
  isin: 'ISIN',
  'provider-symbol': 'Yahoo symbol',
  'asset-symbol': 'fund code',
  name: 'fund name',
};

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
  cashCount?: number;
  /** Existing custody names derived from positions */
  existingCustodyNames?: string[];
}

type ImportedPosition = BulkImportPosition;

// Custom order: USDT, USDC, USDe, FDUSD, DAI
const TOP_STABLECOINS = [
  { id: 'tether', symbol: 'USDT', name: 'Tether' },
  { id: 'usd-coin', symbol: 'USDC', name: 'USD Coin' },
  { id: 'ethena-usde', symbol: 'USDe', name: 'Ethena USDe' },
  { id: 'first-digital-usd', symbol: 'FDUSD', name: 'First Digital USD' },
  { id: 'dai', symbol: 'DAI', name: 'Dai' },
];

const FIAT_CASH_TYPE_ID = 'cash-fiat';
type FiatCashCurrency = 'USD' | 'SGD' | 'GBP';
const DEFAULT_FIAT_CASH_CURRENCY: FiatCashCurrency = 'USD';
const DEFAULT_FIAT_CASH_STORAGE_TYPE: PositionStorageType = 'BROKERAGE';
const DEFAULT_STABLECOIN_STORAGE_TYPE: PositionStorageType = 'CEX';
const FIAT_CASH_CURRENCIES: FiatCashCurrency[] = ['USD', 'SGD', 'GBP'];
const FIAT_CASH_USD_FALLBACKS: Record<Exclude<FiatCashCurrency, 'SGD'>, number> = {
  USD: 1,
  GBP: 1.27,
};

const MAX_POSITIONS_PER_CATEGORY = 20;
const EMPTY_CUSTODY_NAMES: string[] = [];
const NO_FUNDING_CASH_POSITION = 'none';
const CASH_FUNDING_TOLERANCE = 1e-6;
const SKIP_FUNDING_CONFIRM_KEY = 'foliobuddy-skip-funded-position-confirm';

interface FundingConfirmationState {
  positionLabel: string;
  purchaseCostUsd: number;
  cashLabel: string;
  cashAvailableUsd: number;
  cashRemainingUsd: number;
  onConfirm: () => Promise<void>;
}

function isFiatCashCurrency(value: string): value is FiatCashCurrency {
  return FIAT_CASH_CURRENCIES.includes(value as FiatCashCurrency);
}

function cashFundingValueUsd(position: Position): number {
  return (
    position.marketValueUsd ??
    position.quantity * (position.asset.currentPriceUsd ?? position.avgCostUsd)
  );
}

function cashFundingLabel(position: Position): string {
  return position.storageLocation
    ? `${position.asset.symbol} · ${position.storageLocation}`
    : position.asset.symbol;
}

function loadSkipFundingConfirm(): boolean {
  try {
    return localStorage.getItem(SKIP_FUNDING_CONFIRM_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveSkipFundingConfirm() {
  try {
    localStorage.setItem(SKIP_FUNDING_CONFIRM_KEY, 'true');
  } catch {
    // localStorage may be unavailable in privacy-restricted browser contexts.
  }
}

export function PositionForm({
  position,
  onSuccess,
  cryptoCount = 0,
  cashCount = 0,
  existingCustodyNames = EMPTY_CUSTODY_NAMES,
}: PositionFormProps) {
  const [mode, setMode] = useState<FormMode>('add');
  const [editMode, setEditMode] = useState<'edit' | 'delta'>('edit');
  const [deltaMode, setDeltaMode] = useState<PositionDeltaMode>('add');
  const queryClient = useQueryClient();
  const isEditing = !!position;

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
  const [utNavAsOfDate, setUtNavAsOfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [utUploading, setUtUploading] = useState(false);
  const [utUploadError, setUtUploadError] = useState<string | null>(null);
  const [utDragOver, setUtDragOver] = useState(false);
  const [utPrefilledFrom, setUtPrefilledFrom] = useState<string | null>(null);
  const [utMultipleHoldings, setUtMultipleHoldings] = useState<ParsedStatementHolding[] | null>(
    null
  );
  // usdPerNative: 1 unit of native currency = x USD. Overwritten by PDF parse when available.
  const [utUsdPerNative, setUtUsdPerNative] = useState<number>(1 / USD_SGD_FALLBACK_RATE);
  const [utYahooSymbol, setUtYahooSymbol] = useState<string | null>(null);
  const [utStatementMatch, setUtStatementMatch] = useState<UnitTrustStatementMatch | null>(null);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Asset selection state
  const [assetId, setAssetId] = useState(position?.assetId || '');
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(position?.asset || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [selectedCashTypeId, setSelectedCashTypeId] = useState<string>(() => {
    if (position?.asset.category === 'CASH') return FIAT_CASH_TYPE_ID;
    return position?.asset.coingeckoId || '';
  });
  const [selectedFiatCurrency, setSelectedFiatCurrency] = useState<FiatCashCurrency>(() => {
    if (position?.asset.category === 'CASH') {
      const symbol = position.asset.symbol.toUpperCase();
      return isFiatCashCurrency(symbol) ? symbol : DEFAULT_FIAT_CASH_CURRENCY;
    }
    return DEFAULT_FIAT_CASH_CURRENCY;
  });
  const [fundingCashPositionId, setFundingCashPositionId] = useState(NO_FUNDING_CASH_POSITION);
  const [fundingConfirmation, setFundingConfirmation] = useState<FundingConfirmationState | null>(
    null
  );
  const [dontAskFundingAgain, setDontAskFundingAgain] = useState(false);
  const [skipFundingConfirm, setSkipFundingConfirm] = useState(loadSkipFundingConfirm);
  const [confirmingFunding, setConfirmingFunding] = useState(false);

  // Validation state
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form fields
  const [quantity, setQuantity] = useState(position?.quantity?.toString() || '');
  const [costInputMode, setCostInputMode] = useState<CostInputMode>('total');
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
  const costInitializedRef = useRef(false);
  const [storageType, setStorageType] = useState<PositionStorageType>(
    (position?.storageType as PositionStorageType | undefined) || 'CEX'
  );
  const [storageLocation, setStorageLocation] = useState(position?.storageLocation || '');
  const [addingStorageLocation, setAddingStorageLocation] = useState(false);
  const [newStorageLocation, setNewStorageLocation] = useState('');
  const [storageLocationOptionsVersion, setStorageLocationOptionsVersion] = useState(0);
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
  const [additionalCostInputMode, setAdditionalCostInputMode] = useState<CostInputMode>('total');
  const [additionalTotalCost, setAdditionalTotalCost] = useState('');
  const [additionalAvgCostInput, setAdditionalAvgCostInput] = useState('');

  const resetAssetEntryState = (nextCategory: CategoryType) => {
    setAssetId('');
    setSelectedAsset(null);
    setSelectedCashTypeId('');
    setSelectedFiatCurrency(DEFAULT_FIAT_CASH_CURRENCY);
    setSearchQuery('');
    setShowDropdown(false);
    setHighlightedIndex(-1);
    setQuantity('');
    setTotalCost('');
    setFundingCashPositionId(NO_FUNDING_CASH_POSITION);
    setFundingConfirmation(null);
    setDontAskFundingAgain(false);
    setError(null);
    setStorageType(nextCategory === 'equity' ? 'BROKERAGE' : DEFAULT_STABLECOIN_STORAGE_TYPE);
    setStorageLocation('');
    setAddingStorageLocation(false);
    setNewStorageLocation('');
    setUtStatementMatch(null);
  };

  const handleCategoryChange = (value: string) => {
    const nextCategory = value as CategoryType;
    setCategory(nextCategory);
    if (!isEditing) {
      resetAssetEntryState(nextCategory);
    }
  };

  const handleEquityModeChange = (nextMode: EquityMode) => {
    setEquityMode(nextMode);
    if (!isEditing) {
      resetAssetEntryState('equity');
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setShowDropdown(true);
    setHighlightedIndex(-1);
  };

  const handleStorageTypeChange = (value: PositionStorageType) => {
    setStorageType(value);
    if (!isEditing) {
      setStorageLocation('');
      setAddingStorageLocation(false);
      setNewStorageLocation('');
    }
  };

  // Hooks
  const { data: positions } = usePositions();
  const { data: assets } = useAssets();
  const { data: searchResults, isLoading: searchLoading } = useSearchCoins(
    category === 'equity' ? '' : searchQuery
  );
  const { data: equitySearchResults, isLoading: equitySearchLoading } = useSearchAssets(
    category === 'equity' ? searchQuery : '',
    { category: 'EQUITY', provider: 'yahoo' }
  );
  const createAsset = useCreateAsset();
  const createAssetFromCoinGecko = useCreateAssetFromCoinGecko();
  const createAssetFromProvider = useCreateAssetFromProvider();
  const createUnitTrust = useCreateUnitTrust();
  const updateAssetNav = useUpdateAssetNav();
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();

  const isLoading =
    createPosition.isPending ||
    updatePosition.isPending ||
    createAsset.isPending ||
    createAssetFromCoinGecko.isPending ||
    createAssetFromProvider.isPending ||
    createUnitTrust.isPending ||
    updateAssetNav.isPending;

  const utStatementMatchedPosition = useMemo(() => {
    if (!utStatementMatch) return null;
    return (
      positions?.find((item) => item.id === utStatementMatch.position.id) ??
      utStatementMatch.position
    );
  }, [positions, utStatementMatch]);

  // Live FX rate (SGD per 1 USD) — derived from portfolio summary so it matches displayed values.
  // Other listed-equity local currencies come from /fx/rates.
  const { data: portfolioSummary } = usePortfolioSummary();
  const { data: fxRates } = useFxRates();
  const fxSgdPerUsd = useMemo(() => {
    if (
      portfolioSummary &&
      portfolioSummary.totalValueUsd > 0 &&
      portfolioSummary.totalValueSgd > 0
    ) {
      return portfolioSummary.totalValueSgd / portfolioSummary.totalValueUsd;
    }
    return USD_SGD_FALLBACK_RATE;
  }, [portfolioSummary]);

  const usdFxRates = useMemo(() => {
    // Seed fallbacks so cost entry works before live rates load; real /fx/rates
    // values below override them. SGD's seed is derived from the portfolio summary.
    const rates: Record<string, number> = {
      USD: 1,
      SGD: fxSgdPerUsd,
      JPY: USD_JPY_FALLBACK_RATE,
      TWD: USD_TWD_FALLBACK_RATE,
      KRW: USD_KRW_FALLBACK_RATE,
      NOK: USD_NOK_FALLBACK_RATE,
    };

    for (const rate of fxRates ?? []) {
      const from = rate.fromCcy.toUpperCase();
      const to = rate.toCcy.toUpperCase();
      if (from === 'USD' && rate.rate > 0) {
        rates[to] = rate.rate;
      } else if (to === 'USD' && rate.rate > 0) {
        rates[from] = 1 / rate.rate;
      }
    }

    return rates;
  }, [fxRates, fxSgdPerUsd]);

  // Currency the user is entering cost in. For listed equities, use the stock's
  // supported native currency; backend always stores USD.
  const costCurrency = useMemo<CostCurrency>(() => {
    if (category !== 'equity') return 'USD';
    if (equityMode === 'fund' && !isEditing) return normalizeCostCurrency(utNativeCurrency);
    return inferListedEquityCostCurrency({
      nativeCurrency: selectedAsset?.nativeCurrency,
      symbol: selectedAsset?.symbol,
      providerAssetId: selectedAsset?.providerAssetId,
    });
  }, [category, equityMode, isEditing, utNativeCurrency, selectedAsset]);

  const costDisplayRate = useMemo(
    () => costCurrencyDisplayRate(costCurrency, usdFxRates),
    [costCurrency, usdFxRates]
  );
  const costUsdPerNative = useMemo(
    () => usdPerCostCurrency(costCurrency, usdFxRates),
    [costCurrency, usdFxRates]
  );

  // True only once a REAL (non-fallback) USD<->costCurrency rate is loaded. We allow
  // fallback rates for display hints, but never for persisting non-USD cost basis.
  const costRateIsReal = useMemo(() => {
    if (costCurrency === 'USD') return true;
    const hasApiRate = (fxRates ?? []).some((rate) => {
      const from = rate.fromCcy.toUpperCase();
      const to = rate.toCcy.toUpperCase();
      return (
        rate.rate > 0 &&
        ((from === 'USD' && to === costCurrency) || (from === costCurrency && to === 'USD'))
      );
    });
    if (hasApiRate) return true;
    // SGD's real rate is also derivable from the portfolio summary, but only when both
    // totals are positive — this must mirror fxSgdPerUsd's guard exactly, otherwise a
    // non-null summary with zero totals would read as "real" while usdFxRates['SGD'] is
    // still the 1.35 fallback, re-opening the silent cost-basis drift.
    if (costCurrency === 'SGD') {
      return (
        portfolioSummary != null &&
        portfolioSummary.totalValueUsd > 0 &&
        portfolioSummary.totalValueSgd > 0
      );
    }
    return false;
  }, [costCurrency, fxRates, portfolioSummary]);

  // When editing a non-USD-native position, re-display the stored USD cost basis in
  // local currency. Runs once per position and waits until the real FX rate is loaded.
  useEffect(() => {
    if (!position || costInitializedRef.current) return;
    if (costCurrency === 'USD') {
      costInitializedRef.current = true;
      return;
    }
    if (costDisplayRate === null || !costRateIsReal) return;
    // Zero-decimal currencies (JPY/KRW) must not show ".00" sub-units.
    const dec = currencyDecimals(costCurrency);
    const displayAvg = position.avgCostUsd * costDisplayRate;
    const displayTotal = position.quantity * position.avgCostUsd * costDisplayRate;
    setAvgCostInput(displayAvg.toFixed(dec));
    setTotalCost(displayTotal.toFixed(dec));
    costInitializedRef.current = true;
  }, [position, costCurrency, costDisplayRate, costRateIsReal]);

  // Form validation
  const isFormValid = useMemo(() => {
    if (!isPositiveNumberInput(quantity)) return false;
    if (category === 'equity' && equityMode === 'fund' && !isEditing) {
      if (!utSymbol.trim() || !utName.trim()) return false;
      if (!isPositiveNumberInput(utNav)) return false;
      return true;
    }
    if (!assetId) return false;
    return true;
  }, [assetId, quantity, category, equityMode, isEditing, utSymbol, utName, utNav]);

  const isDeltaFormValid = useMemo(() => {
    if (!isPositiveNumberInput(additionalQuantity)) return false;
    if (deltaMode === 'reduce') return true;

    return additionalCostInputMode === 'total'
      ? isNonNegativeNumberInput(additionalTotalCost)
      : isNonNegativeNumberInput(additionalAvgCostInput);
  }, [
    additionalQuantity,
    deltaMode,
    additionalCostInputMode,
    additionalTotalCost,
    additionalAvgCostInput,
  ]);

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
    return calculateAverageCostInput(costInputMode, quantity, totalCost, avgCostInput);
  }, [quantity, totalCost, costInputMode, avgCostInput]);

  const calculatedTotalCost = useMemo(() => {
    return calculateTotalCostInput(costInputMode, quantity, avgCostInput, totalCost);
  }, [quantity, avgCostInput, costInputMode, totalCost]);

  // Final avg cost for form submission
  const avgCostUsd = costInputMode === 'total' ? calculatedAvgCost : avgCostInput;

  const calculatedAdditionalAvgCost = useMemo(() => {
    return calculateNonNegativeAverageCostInput(
      additionalCostInputMode,
      additionalQuantity,
      additionalTotalCost,
      additionalAvgCostInput
    );
  }, [additionalQuantity, additionalTotalCost, additionalCostInputMode, additionalAvgCostInput]);

  const calculatedAdditionalTotalCost = useMemo(() => {
    return calculateNonNegativeTotalCostInput(
      additionalCostInputMode,
      additionalQuantity,
      additionalAvgCostInput,
      additionalTotalCost
    );
  }, [additionalQuantity, additionalAvgCostInput, additionalCostInputMode, additionalTotalCost]);

  const additionalCostInput =
    additionalCostInputMode === 'total' ? additionalTotalCost : calculatedAdditionalTotalCost;

  const addPreview = useMemo(() => {
    if (!position || editMode !== 'delta') return null;
    return buildPositionDeltaPreview({
      currentQuantity: position.quantity,
      currentAvgCostUsd: position.avgCostUsd,
      deltaQuantity: additionalQuantity,
      deltaTotalCostInput: additionalCostInput,
      mode: deltaMode,
      costCurrency,
      usdFxRates,
    });
  }, [
    position,
    editMode,
    additionalQuantity,
    additionalCostInput,
    deltaMode,
    costCurrency,
    usdFxRates,
  ]);

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

  const canUseFundingCash = isEditing
    ? editMode === 'delta' && deltaMode === 'add' && !isStablecoinCategory(position?.asset.category)
    : category !== 'cash' && !utStatementMatch;

  const cashFundingOptions = useMemo(() => {
    if (!canUseFundingCash) return [];
    return (positions ?? [])
      .filter(
        (item) =>
          item.id !== position?.id &&
          !item.custodyOf &&
          isStablecoinCategory(item.asset.category) &&
          item.quantity > 0 &&
          cashFundingValueUsd(item) > 0
      )
      .sort((a, b) => cashFundingValueUsd(b) - cashFundingValueUsd(a));
  }, [canUseFundingCash, position?.id, positions]);

  const selectedFundingCashPosition = useMemo(
    () => cashFundingOptions.find((item) => item.id === fundingCashPositionId) ?? null,
    [cashFundingOptions, fundingCashPositionId]
  );

  useEffect(() => {
    if (fundingCashPositionId === NO_FUNDING_CASH_POSITION) return;
    if (cashFundingOptions.some((item) => item.id === fundingCashPositionId)) return;
    setFundingCashPositionId(NO_FUNDING_CASH_POSITION);
  }, [cashFundingOptions, fundingCashPositionId]);

  const withInferredListedEquityCurrency = (asset: Asset): Asset => {
    if (asset.category !== 'EQUITY') return asset;
    if (normalizeCostCurrency(asset.nativeCurrency) !== 'USD') return asset;
    const inferredCurrency = inferListedEquityCostCurrency({
      nativeCurrency: asset.nativeCurrency,
      symbol: asset.symbol,
      providerAssetId: asset.providerAssetId,
    });
    return inferredCurrency !== 'USD' && inferredCurrency !== asset.nativeCurrency
      ? { ...asset, nativeCurrency: inferredCurrency }
      : asset;
  };

  const repairExistingProviderAsset = async (asset: Asset, nativeCurrency: CostCurrency) => {
    if (asset.priceProvider !== 'yahoo') return null;
    if (asset.nativeCurrency === nativeCurrency) return null;
    return createAssetFromProvider.mutateAsync({
      provider: 'yahoo',
      providerAssetId: asset.providerAssetId ?? asset.symbol,
      symbol: asset.symbol,
      name: asset.name,
      category: 'EQUITY',
      nativeCurrency,
      exchange: asset.exchange ?? null,
    });
  };

  const handleSelectExistingAsset = (asset: Asset) => {
    const localAsset = withInferredListedEquityCurrency(asset);
    setAssetId(localAsset.id);
    setSelectedAsset(localAsset);
    setSearchQuery('');
    setHighlightedIndex(-1);
    setShowDropdown(false);

    void repairExistingProviderAsset(asset, localAsset.nativeCurrency as CostCurrency)
      .then((updatedAsset) => {
        if (updatedAsset) {
          const localizedUpdatedAsset = withInferredListedEquityCurrency(updatedAsset);
          setAssetId(localizedUpdatedAsset.id);
          setSelectedAsset(localizedUpdatedAsset);
        }
      })
      .catch(() => {
        // Keep the local suffix-inferred currency even if the catalog repair is delayed.
      });
  };

  const fiatCashPriceUsd = (currency: FiatCashCurrency) => {
    if (currency === 'SGD') return 1 / fxSgdPerUsd;
    return FIAT_CASH_USD_FALLBACKS[currency];
  };

  const ensureFiatCashAsset = async (currency: FiatCashCurrency) => {
    const existingCashAsset = assets?.find(
      (a) => a.category === 'CASH' && a.symbol.toUpperCase() === currency
    );
    if (existingCashAsset) {
      setAssetId(existingCashAsset.id);
      setSelectedAsset(existingCashAsset);
      return existingCashAsset;
    }

    try {
      const asset = await createAsset.mutateAsync({
        symbol: currency,
        name: `Cash ${currency}`,
        category: 'CASH',
        priceProvider: 'manual',
        nativeCurrency: currency,
        currentPriceUsd: fiatCashPriceUsd(currency),
      });

      setAssetId(asset.id);
      setSelectedAsset(asset);
      return asset;
    } catch {
      setAssetId('');
      setSelectedAsset(null);
      setError(`Failed to create ${currency} cash asset. Please try again.`);
      return null;
    }
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

    const localAsset = withInferredListedEquityCurrency(asset);
    setAssetId(localAsset.id);
    setSelectedAsset(localAsset);
    setSearchQuery('');
    setHighlightedIndex(-1);
    setShowDropdown(false);
  };

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

  const handleSelectCashType = async (cashTypeId: string) => {
    setSelectedCashTypeId(cashTypeId);
    setError(null);

    if (cashTypeId === FIAT_CASH_TYPE_ID) {
      setStorageType(DEFAULT_FIAT_CASH_STORAGE_TYPE);
      setStorageLocation('');
      setAddingStorageLocation(false);
      setNewStorageLocation('');
      const asset = await ensureFiatCashAsset(selectedFiatCurrency);
      if (!asset) {
        setSelectedCashTypeId('');
      }
      return;
    }

    const stablecoin = TOP_STABLECOINS.find((s) => s.id === cashTypeId);
    if (!stablecoin) return;

    setStorageType(DEFAULT_STABLECOIN_STORAGE_TYPE);
    setStorageLocation('');
    setAddingStorageLocation(false);
    setNewStorageLocation('');

    const existingAsset = assets?.find((a) => a.coingeckoId === cashTypeId);
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
    } catch {
      setError('Failed to load stablecoin data. Please try again.');
      setSelectedCashTypeId('');
    }
  };

  const handleFiatCurrencyChange = async (value: string) => {
    const nextCurrency = isFiatCashCurrency(value) ? value : DEFAULT_FIAT_CASH_CURRENCY;
    setSelectedFiatCurrency(nextCurrency);
    if (selectedCashTypeId === FIAT_CASH_TYPE_ID) {
      await ensureFiatCashAsset(nextCurrency);
    }
  };

  // Reset import state when mode changes
  useEffect(() => {
    if (mode === 'add') {
      resetImportState();
    }
  }, [mode]);

  // Memoized: these read + JSON.parse localStorage, and this form re-renders on
  // every keystroke in any field. The version counter invalidates the memo when
  // custom options are saved/renamed/deleted mid-form.
  const locationOptions = useMemo(
    () =>
      locationOptionsForStorageType(storageType, storageLocation ? [storageLocation] : undefined),
    [storageType, storageLocation, storageLocationOptionsVersion]
  );
  const editableLocationOptions = useMemo(
    () =>
      new Set(
        customLocationOptionsForStorageType(storageType).map((option) => option.toLocaleLowerCase())
      ),
    [storageType, storageLocationOptionsVersion]
  );
  const storageTypeOptions =
    category === 'cash' && selectedCashTypeId === FIAT_CASH_TYPE_ID
      ? FIAT_CASH_STORAGE_TYPES
      : CRYPTO_STORAGE_TYPES;
  const storageLocationLabel = locationLabelForStorageType(storageType);

  useEffect(() => {
    if (isEditing || category !== 'cash') return;

    const isFiatCash = selectedCashTypeId === FIAT_CASH_TYPE_ID;
    const validStorageTypes = isFiatCash ? FIAT_CASH_STORAGE_TYPES : CRYPTO_STORAGE_TYPES;
    if (validStorageTypes.some((type) => type.value === storageType)) return;

    setStorageType(isFiatCash ? DEFAULT_FIAT_CASH_STORAGE_TYPE : DEFAULT_STABLECOIN_STORAGE_TYPE);
    setStorageLocation('');
    setAddingStorageLocation(false);
    setNewStorageLocation('');
  }, [category, isEditing, selectedCashTypeId, storageType]);

  const handleStartAddingStorageLocation = () => {
    setAddingStorageLocation(true);
    setNewStorageLocation('');
  };

  const handleAddStorageLocation = () => {
    const option = saveLocationOptionForStorageType(storageType, newStorageLocation);
    if (!option) return null;

    setAddingStorageLocation(false);
    setNewStorageLocation('');
    setStorageLocationOptionsVersion((version) => version + 1);
    return option;
  };

  const handleCancelStorageLocation = () => {
    setAddingStorageLocation(false);
    setNewStorageLocation('');
  };

  const handleEditStorageLocation = (currentValue: string, nextValue: string) => {
    const option = renameLocationOptionForStorageType(storageType, currentValue, nextValue);
    if (!option) return null;

    setStorageLocationOptionsVersion((version) => version + 1);
    return option;
  };

  const handleDeleteStorageLocation = (value: string) => {
    const deleted = deleteLocationOptionForStorageType(storageType, value);
    if (!deleted) return false;

    setStorageLocationOptionsVersion((version) => version + 1);
    return true;
  };

  const handleClearStorageLocation = () => {
    setStorageLocation('');
    handleCancelStorageLocation();
  };

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
    const statementMatch = findMatchingUnitTrustPosition(h, positions, broker);
    setUtStatementMatch(statementMatch);
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
    const usdPerNative = h.fxRateToUsd ?? (ccy === 'USD' ? 1 : 1 / USD_SGD_FALLBACK_RATE);
    setUtUsdPerNative(usdPerNative);
    setTotalCost(ccy === 'USD' ? h.totalCostUsd.toFixed(2) : h.totalCostNative.toFixed(2));
    const parsedStorageLocation = statementBrokerStorageLocation(broker);
    setStorageLocation(parsedStorageLocation);
    if (parsedStorageLocation) {
      saveLocationOptionForStorageType('BROKERAGE', parsedStorageLocation);
      setStorageLocationOptionsVersion((version) => version + 1);
    }
    setUtPrefilledFrom(broker);
    setUtMultipleHoldings(null);
    setUtYahooSymbol(h.yahooSymbol ?? null);
    if (statementMatch) {
      setAssetId(statementMatch.position.assetId);
      setSelectedAsset(statementMatch.position.asset);
      setNotes(statementMatch.position.notes ?? '');
      setIsCustody(!!statementMatch.position.custodyOf);
      setCustodyOf(statementMatch.position.custodyOf ?? '');
    } else {
      setAssetId('');
      setSelectedAsset(null);
    }
  };

  const handleUploadStatement = async (file: File) => {
    setUtUploadError(null);
    setUtStatementMatch(null);
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

  const fundingCashPositionIdForSubmit =
    canUseFundingCash && fundingCashPositionId !== NO_FUNDING_CASH_POSITION
      ? fundingCashPositionId
      : undefined;

  const validateFundingCashSelection = (purchaseCostUsd: number) => {
    if (!fundingCashPositionIdForSubmit) return true;

    if (!selectedFundingCashPosition) {
      setValidationError('Selected cash pile is no longer available');
      return false;
    }

    if (!(purchaseCostUsd > 0)) {
      setValidationError('Funded positions need a positive total cost');
      return false;
    }

    const availableUsd = cashFundingValueUsd(selectedFundingCashPosition);
    if (availableUsd + CASH_FUNDING_TOLERANCE < purchaseCostUsd) {
      setValidationError(
        `${selectedFundingCashPosition.asset.symbol} cash pile has ${formatCurrency(
          availableUsd,
          'USD',
          0
        )} available, below the ${formatCurrency(purchaseCostUsd, 'USD', 0)} position cost`
      );
      return false;
    }

    return true;
  };

  const requestFundingConfirmation = async (
    purchaseCostUsd: number,
    positionLabel: string,
    onConfirm: () => Promise<void>
  ) => {
    if (!fundingCashPositionIdForSubmit || skipFundingConfirm) {
      await onConfirm();
      return;
    }

    if (!selectedFundingCashPosition) {
      throw new Error('Selected cash pile is no longer available');
    }

    const cashAvailableUsd = cashFundingValueUsd(selectedFundingCashPosition);
    setFundingConfirmation({
      positionLabel,
      purchaseCostUsd,
      cashLabel: cashFundingLabel(selectedFundingCashPosition),
      cashAvailableUsd,
      cashRemainingUsd: Math.max(0, cashAvailableUsd - purchaseCostUsd),
      onConfirm,
    });
  };

  const handleCancelFundingConfirmation = () => {
    setFundingConfirmation(null);
    setDontAskFundingAgain(false);
    setConfirmingFunding(false);
  };

  const handleConfirmFunding = async () => {
    if (!fundingConfirmation) return;

    if (dontAskFundingAgain) {
      saveSkipFundingConfirm();
      setSkipFundingConfirm(true);
    }

    setConfirmingFunding(true);
    setError(null);
    setValidationError(null);

    try {
      await fundingConfirmation.onConfirm();
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save position';
      setError(errorMessage);
      setConfirmingFunding(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationError(null);

    if (isEditing && editMode === 'delta' && position) {
      const deltaQty = parseFloat(additionalQuantity);
      if (deltaMode === 'add' && costCurrency !== 'USD' && !costRateIsReal) {
        setValidationError(`FX rate for ${costCurrency} is still loading. Please try again.`);
        return;
      }
      // In add mode the user enters cost in costCurrency — convert to USD for persistence.
      // In reduce mode we shrink basis at current avg cost (already USD), no conversion needed.
      // Only convert in add mode — reduce mode would otherwise leave a latent NaN here.
      const deltaCostInput = parseFloat(additionalCostInput);
      const deltaCostAddUsd =
        deltaMode === 'add' ? toUsdCost(deltaCostInput, costCurrency, usdFxRates) : 0;

      if (!(deltaQty > 0)) {
        setValidationError(`Please enter a valid ${deltaMode} quantity`);
        return;
      }

      if (deltaMode === 'add' && !(deltaCostAddUsd >= 0)) {
        setValidationError(`Please enter a valid ${deltaMode} cost`);
        return;
      }

      let deltaResult;
      try {
        deltaResult = applyPositionDelta({
          currentQuantity: position.quantity,
          currentAvgCostUsd: position.avgCostUsd,
          deltaQuantity: deltaQty,
          mode: deltaMode,
          deltaTotalCostUsd: deltaMode === 'add' ? deltaCostAddUsd : undefined,
        });
      } catch (err) {
        setValidationError(err instanceof Error ? err.message : 'Invalid position change');
        return;
      }

      if (deltaMode === 'add' && !validateFundingCashSelection(deltaCostAddUsd)) {
        return;
      }

      const saveDeltaPosition = async () => {
        await updatePosition.mutateAsync({
          id: position.id,
          data: {
            quantity: deltaResult.nextQuantity,
            avgCostUsd: deltaResult.nextAvgCostUsd,
            custodyOf: isCustody ? custodyOf.trim() || 'Someone' : '',
            fundingCashPositionId: fundingCashPositionIdForSubmit,
            positionDelta: {
              mode: deltaMode,
              quantity: deltaQty,
              ...(deltaMode === 'add' ? { totalCostUsd: deltaCostAddUsd } : {}),
            },
          },
        });
        handleCustodySave();
        onSuccess();
      };

      try {
        await requestFundingConfirmation(
          deltaCostAddUsd,
          `${position.asset.symbol} ${position.asset.name}`,
          saveDeltaPosition
        );
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
      } else if (!isPositiveNumberInput(quantity)) {
        setValidationError('Please enter a valid quantity');
      }
      return;
    }

    // Check position limit before submitting (crypto + cash only; equities + unit trusts unbounded)
    if (!isEditing && (category === 'crypto' || category === 'cash')) {
      const currentCount = category === 'crypto' ? cryptoCount : cashCount;
      if (currentCount >= MAX_POSITIONS_PER_CATEGORY) {
        setError(
          `Maximum ${MAX_POSITIONS_PER_CATEGORY} ${category === 'crypto' ? 'crypto' : 'cash'} positions allowed`
        );
        return;
      }
    }

    // Fund-level (unit trust) path: a matched monthly statement updates the existing row;
    // otherwise create the asset + initial NAV, then create a new position.
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

      if (!validateFundingCashSelection(totalCostUsd)) {
        return;
      }

      const saveFundPosition = async () => {
        if (utStatementMatchedPosition) {
          if (utStatementMatchedPosition.asset.priceProvider === 'manual') {
            await updateAssetNav.mutateAsync({
              id: utStatementMatchedPosition.assetId,
              data: {
                navPrice: navNum,
                asOfDate: new Date(utNavAsOfDate).toISOString(),
                notes: utPrefilledFrom ? `Statement import from ${utPrefilledFrom}` : undefined,
              },
            });
          }

          await updatePosition.mutateAsync({
            id: utStatementMatchedPosition.id,
            data: {
              assetId: utStatementMatchedPosition.assetId,
              quantity: qtyNum,
              avgCostUsd: qtyNum > 0 ? totalCostUsd / qtyNum : 0,
              storageType: 'BROKERAGE',
              storageLocation: storageLocation || undefined,
              notes: notes.trim() || undefined,
              custodyOf: isCustody ? custodyOf.trim() || 'Someone' : '',
            },
          });
        } else {
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
            storageLocation: storageLocation || undefined,
            notes: notes.trim() || undefined,
            custodyOf: isCustody ? custodyOf.trim() || 'Someone' : undefined,
            fundingCashPositionId: fundingCashPositionIdForSubmit,
          });
        }

        handleCustodySave();
        onSuccess();
      };

      try {
        await requestFundingConfirmation(
          totalCostUsd,
          utStatementMatchedPosition
            ? `${utStatementMatchedPosition.asset.symbol} ${utStatementMatchedPosition.asset.name}`
            : `${utSymbol.trim().toUpperCase()} ${utName.trim()}`.trim(),
          saveFundPosition
        );
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to save unit trust');
      }
      return;
    }

    // Never persist non-USD listed-equity cost basis through fallback FX rates.
    if (
      category === 'equity' &&
      !(equityMode === 'fund' && !isEditing) &&
      costCurrency !== 'USD' &&
      !costRateIsReal
    ) {
      setValidationError(`FX rate for ${costCurrency} is still loading. Please try again.`);
      return;
    }

    // Convert local equity input to USD before persisting (backend stores USD).
    // Applies to both create and edit (single stocks and existing unit trusts).
    const rawAvgCost =
      category === 'cash' ? (selectedAsset?.currentPriceUsd ?? 1) : parseFloat(avgCostUsd) || 0;
    const finalAvgCostUsd =
      category === 'equity' ? toUsdCost(rawAvgCost, costCurrency, usdFxRates) : rawAvgCost;

    const data = {
      assetId,
      quantity: parseFloat(quantity),
      avgCostUsd: finalAvgCostUsd,
      storageType: storageType as 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE',
      storageLocation: storageLocation || undefined,
      notes: notes.trim() || undefined,
      custodyOf: isCustody ? custodyOf.trim() || 'Someone' : isEditing ? '' : undefined,
      fundingCashPositionId: fundingCashPositionIdForSubmit,
    };

    if (!isEditing && !validateFundingCashSelection(data.quantity * data.avgCostUsd)) {
      return;
    }

    const savePosition = async () => {
      if (isEditing) {
        await updatePosition.mutateAsync({ id: position.id, data });
      } else {
        await createPosition.mutateAsync(data);
      }
      handleCustodySave();
      onSuccess();
    };

    try {
      await requestFundingConfirmation(
        data.quantity * data.avgCostUsd,
        selectedAsset ? `${selectedAsset.symbol} ${selectedAsset.name}` : 'New position',
        savePosition
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save position';
      setError(errorMessage);
    }
  };

  // If showing import results, show the results UI
  if (mode === 'import' && importResults) {
    return <ImportResultsList results={importResults} onDone={onSuccess} />;
  }

  if (fundingConfirmation) {
    return (
      <div className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">Confirm Funded Position</h3>
          <p className="text-sm text-muted-foreground">
            This will {isEditing ? 'add to this position' : 'add the new position'} and reduce the
            selected cash pile.
          </p>
        </div>

        <div className="space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{isEditing ? 'Add to position' : 'Add position'}</p>
              <p className="text-muted-foreground">{fundingConfirmation.positionLabel}</p>
            </div>
            <span className="shrink-0 font-medium tabular-nums">
              {formatCurrency(fundingConfirmation.purchaseCostUsd, 'USD', 0)}
            </span>
          </div>

          <div className="border-t border-border/60 pt-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Reduce cash pile</p>
                <p className="text-muted-foreground">{fundingConfirmation.cashLabel}</p>
              </div>
              <span className="shrink-0 font-medium text-loss tabular-nums">
                -{formatCurrency(fundingConfirmation.purchaseCostUsd, 'USD', 0)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Cash pile before</span>
              <span className="tabular-nums">
                {formatCurrency(fundingConfirmation.cashAvailableUsd, 'USD', 0)}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Cash pile after</span>
              <span className="tabular-nums">
                {formatCurrency(fundingConfirmation.cashRemainingUsd, 'USD', 0)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 py-1">
          <Checkbox
            id="dontAskFundingAgain"
            checked={dontAskFundingAgain}
            onCheckedChange={(checked) => setDontAskFundingAgain(checked === true)}
            disabled={confirmingFunding}
          />
          <label
            htmlFor="dontAskFundingAgain"
            className="cursor-pointer text-sm text-muted-foreground"
          >
            Don't ask me again
          </label>
        </div>

        {error && (
          <div role="alert" className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancelFundingConfirmation}
            disabled={confirmingFunding}
          >
            Back
          </Button>
          <Button type="button" onClick={handleConfirmFunding} disabled={confirmingFunding}>
            {confirmingFunding ? 'Saving...' : 'Confirm'}
          </Button>
        </div>
      </div>
    );
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

  const fundingCashSelector =
    canUseFundingCash && cashFundingOptions.length > 0 ? (
      <div className="space-y-1">
        <Label htmlFor="funding-cash-position" className="text-sm">
          Fund From (Optional)
        </Label>
        <Select value={fundingCashPositionId} onValueChange={setFundingCashPositionId}>
          <SelectTrigger id="funding-cash-position">
            <SelectValue placeholder="No cash pile" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_FUNDING_CASH_POSITION}>No cash pile</SelectItem>
            {cashFundingOptions.map((cashPosition) => {
              const valueUsd = cashFundingValueUsd(cashPosition);
              return (
                <SelectItem key={cashPosition.id} value={cashPosition.id}>
                  {cashFundingLabel(cashPosition)} · {formatCurrency(valueUsd, 'USD', 0)}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
    ) : null;

  return (
    <div className="space-y-3">
      {/* Mode Selection (Add New vs Import) */}
      {!isEditing && (
        <div className="flex border-b mb-2">
          <button
            type="button"
            aria-pressed={mode === 'add'}
            onClick={() => setMode('add')}
            className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
              mode === 'add'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            Add New
          </button>
          <button
            type="button"
            aria-pressed={mode === 'import'}
            onClick={() => setMode('import')}
            className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
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
            <div className="flex border-b mb-2">
              <button
                type="button"
                aria-pressed={editMode === 'edit'}
                onClick={() => setEditMode('edit')}
                className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
                  editMode === 'edit'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                Edit Totals
              </button>
              <button
                type="button"
                aria-pressed={editMode === 'delta'}
                onClick={() => setEditMode('delta')}
                className={`min-h-[44px] flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
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
            <PositionDeltaEditor
              position={position}
              deltaMode={deltaMode}
              onDeltaModeChange={setDeltaMode}
              additionalQuantity={additionalQuantity}
              onAdditionalQuantityChange={(value) => {
                setAdditionalQuantity(value);
                setValidationError(null);
              }}
              additionalCostInputMode={additionalCostInputMode}
              onAdditionalCostInputModeChange={(mode) => {
                setAdditionalCostInputMode(mode);
                setValidationError(null);
              }}
              additionalTotalCost={additionalTotalCost}
              calculatedAdditionalTotalCost={calculatedAdditionalTotalCost}
              onAdditionalTotalCostChange={(value) => {
                setAdditionalTotalCost(value);
                setValidationError(null);
              }}
              additionalAvgCostInput={additionalAvgCostInput}
              calculatedAdditionalAvgCost={calculatedAdditionalAvgCost}
              onAdditionalAvgCostChange={(value) => {
                setAdditionalAvgCostInput(value);
                setValidationError(null);
              }}
              costCurrency={costCurrency}
              preview={addPreview}
              error={error}
              validationError={validationError}
              custodySlot={custodyCheckbox}
              isLoading={isLoading}
              canSubmit={isDeltaFormValid}
              fundingSlot={fundingCashSelector}
            />
          ) : (
            <>
              {/* Category Selection */}
              {!isEditing && (
                <div className="space-y-1">
                  <Label htmlFor="pos-category" className="text-sm">
                    Category
                  </Label>
                  <Select value={category} onValueChange={handleCategoryChange}>
                    <SelectTrigger id="pos-category">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="crypto">Crypto</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="equity">Equities</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Equity sub-type: Single stock vs Fund-level (unit trust) */}
              {!isEditing && category === 'equity' && (
                <div className="space-y-1">
                  <Label id="equity-type-label" className="text-sm">
                    Type
                  </Label>
                  <div
                    role="group"
                    aria-labelledby="equity-type-label"
                    className="grid grid-cols-2 gap-2"
                  >
                    <button
                      type="button"
                      aria-pressed={equityMode === 'single'}
                      onClick={() => handleEquityModeChange('single')}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-h-9 ${
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
                      aria-pressed={equityMode === 'fund'}
                      onClick={() => handleEquityModeChange('fund')}
                      className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-h-9 ${
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
                      if (
                        file.type !== 'application/pdf' &&
                        !file.name.toLowerCase().endsWith('.pdf')
                      ) {
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
                      <p role="alert" className="mt-2 text-xs text-destructive">
                        {utUploadError}
                      </p>
                    )}
                  </label>

                  {utMultipleHoldings && (
                    <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                      <p className="text-sm font-medium">
                        Multiple holdings found. Pick one to auto-fill:
                      </p>
                      <div className="space-y-1">
                        {utMultipleHoldings.map((h) => (
                          <button
                            key={`${h.isin || h.yahooSymbol || h.symbol}-${h.name}`}
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
                      {utStatementMatch && utStatementMatchedPosition && (
                        <div className="rounded-md border border-info/30 bg-info/10 p-2 text-xs text-info">
                          Matched existing position by{' '}
                          {STATEMENT_MATCH_REASON_LABEL[utStatementMatch.reason]}:{' '}
                          {utStatementMatchedPosition.asset.symbol}
                          {utStatementMatchedPosition.storageLocation
                            ? ` at ${utStatementMatchedPosition.storageLocation}`
                            : ''}
                          . Saving will update this line instead of adding a new one.
                        </div>
                      )}
                      <div className="rounded-md border border-profit/30 bg-profit/10 p-2 text-xs text-profit">
                        Pre-filled from {utPrefilledFrom} statement. Please review before saving.
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
                      <FormattedNumberInput
                        id="ut-nav"
                        value={utNav}
                        onValueChange={setUtNav}
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
                    id="pos-asset"
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
                    onSearchChange={handleSearchChange}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
                    onKeyDown={handleSearchKeyDown}
                    onSelectExistingAsset={handleSelectExistingAsset}
                    onSelectCoin={handleSelectCoin}
                    onClearSelection={() => {
                      setAssetId('');
                      setSelectedAsset(null);
                      setSearchQuery('');
                      setHighlightedIndex(-1);
                    }}
                    setHighlightedIndex={setHighlightedIndex}
                    setValidationError={setValidationError}
                  />
                </div>
              ) : (
                /* Cash type selection */
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="pos-cash-type" className="text-sm">
                      Type
                    </Label>
                    {isEditing ? (
                      <Input
                        value={`${position.asset.symbol} - ${position.asset.name}`}
                        disabled
                        className="bg-muted"
                      />
                    ) : (
                      <Select
                        value={selectedCashTypeId}
                        onValueChange={handleSelectCashType}
                        disabled={createAssetFromCoinGecko.isPending || createAsset.isPending}
                      >
                        <SelectTrigger id="pos-cash-type">
                          <SelectValue
                            placeholder={
                              createAssetFromCoinGecko.isPending || createAsset.isPending
                                ? 'Loading...'
                                : 'Select a type'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {TOP_STABLECOINS.map((coin) => (
                            <SelectItem key={coin.id} value={coin.id}>
                              {coin.symbol}
                            </SelectItem>
                          ))}
                          <SelectItem value={FIAT_CASH_TYPE_ID}>Cash (fiat)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {!isEditing && selectedCashTypeId === FIAT_CASH_TYPE_ID && (
                    <div className="space-y-1">
                      <Label htmlFor="pos-fiat-currency" className="text-sm">
                        Currency
                      </Label>
                      <Select
                        value={selectedFiatCurrency}
                        onValueChange={handleFiatCurrencyChange}
                        disabled={createAsset.isPending}
                      >
                        <SelectTrigger id="pos-fiat-currency">
                          <SelectValue placeholder="Select currency" />
                        </SelectTrigger>
                        <SelectContent>
                          {FIAT_CASH_CURRENCIES.map((currency) => (
                            <SelectItem key={currency} value={currency}>
                              {currency}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                <FormattedNumberInput
                  id="quantity"
                  value={quantity}
                  onValueChange={(value) => {
                    setQuantity(value);
                    setValidationError(null);
                  }}
                  placeholder="0.00"
                  required
                />
              </div>

              {/* Total Cost & Average Cost (Crypto + Equity) */}
              {category !== 'cash' && (
                <PositionCostFields
                  costInputMode={costInputMode}
                  onCostInputModeChange={setCostInputMode}
                  totalCost={totalCost}
                  calculatedTotalCost={calculatedTotalCost}
                  onTotalCostChange={setTotalCost}
                  avgCostInput={avgCostInput}
                  calculatedAvgCost={calculatedAvgCost}
                  onAvgCostChange={setAvgCostInput}
                  costCurrency={costCurrency}
                  showUnitTrustConversion={
                    !isEditing &&
                    category === 'equity' &&
                    equityMode === 'fund' &&
                    utNativeCurrency !== 'USD'
                  }
                  unitTrustUsdPerNative={utUsdPerNative}
                  unitTrustNativeCurrency={utNativeCurrency}
                  showNativeConversion={
                    category === 'equity' &&
                    !(equityMode === 'fund' && !isEditing) &&
                    costCurrency !== 'USD'
                  }
                  nativeUsdPerUnit={costUsdPerNative}
                  nativeConversionCurrency={costCurrency}
                />
              )}

              {fundingCashSelector}

              <PositionStorageFields
                category={category}
                storageType={storageType}
                storageTypeOptions={storageTypeOptions}
                storageLocation={storageLocation}
                storageLocationLabel={storageLocationLabel}
                locationOptions={locationOptions}
                editableLocationOptions={editableLocationOptions}
                addingStorageLocation={addingStorageLocation}
                newStorageLocation={newStorageLocation}
                onStorageTypeChange={handleStorageTypeChange}
                onStorageLocationChange={(value) => {
                  setStorageLocation(value);
                  handleCancelStorageLocation();
                }}
                onStartAddingStorageLocation={handleStartAddingStorageLocation}
                onNewStorageLocationChange={setNewStorageLocation}
                onAddStorageLocation={handleAddStorageLocation}
                onCancelStorageLocation={handleCancelStorageLocation}
                onEditStorageLocation={handleEditStorageLocation}
                onDeleteStorageLocation={handleDeleteStorageLocation}
                onClearStorageLocation={handleClearStorageLocation}
              />

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
                <div
                  role="alert"
                  className="text-sm text-destructive bg-destructive/10 p-3 rounded-md"
                >
                  {error}
                </div>
              )}

              {validationError && (
                <div role="alert" className="text-sm text-warning bg-warning/10 p-2 rounded-md">
                  {validationError}
                </div>
              )}

              {/* Position Limit Info (crypto + cash only) */}
              {!isEditing && category !== 'equity' && (
                <div className="text-xs text-muted-foreground">
                  {category === 'crypto' ? cryptoCount : cashCount} / {MAX_POSITIONS_PER_CATEGORY}{' '}
                  {category === 'crypto' ? 'crypto' : 'cash'} positions
                </div>
              )}

              <div className="pt-3 border-t border-border/60">{custodyCheckbox}</div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="submit" disabled={isLoading || !isFormValid}>
                  {isLoading
                    ? 'Saving...'
                    : isEditing || utStatementMatch
                      ? 'Update Position'
                      : 'Add Position'}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </div>
  );
}
