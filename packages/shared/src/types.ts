export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: PaginationMeta;
}

// ── Domain constants ────────────────────────────────────────────────────

/** Fallback USD/SGD exchange rate when FX API is unavailable */
export const USD_SGD_FALLBACK_RATE = 1.35;

/**
 * Rough fallback USD->native rates for the supported Asian equity currencies,
 * used only to keep position-form cost entry working before live /fx/rates load
 * (and never persisted). Real rates from /fx/rates always override these.
 */
export const USD_JPY_FALLBACK_RATE = 155;
export const USD_TWD_FALLBACK_RATE = 32;
export const USD_KRW_FALLBACK_RATE = 1380;

/** Maximum positions allowed per asset category */
export const MAX_POSITIONS_PER_CATEGORY = 20;

// ── Domain enums ────────────────────────────────────────────────────────

export const AssetCategory = {
  LIQUID_CRYPTO: 'LIQUID_CRYPTO',
  STABLECOIN: 'STABLECOIN',
  NFT: 'NFT',
  ANGEL: 'ANGEL',
  CASH: 'CASH',
  EQUITY: 'EQUITY',
  UNIT_TRUST: 'UNIT_TRUST',
} as const;
export type AssetCategory = (typeof AssetCategory)[keyof typeof AssetCategory];
export const ASSET_CATEGORIES = Object.values(AssetCategory) as [AssetCategory, ...AssetCategory[]];

export const StorageType = {
  WALLET: 'WALLET',
  CEX: 'CEX',
  DEFI: 'DEFI',
  BANK: 'BANK',
  BROKERAGE: 'BROKERAGE',
} as const;
export type StorageType = (typeof StorageType)[keyof typeof StorageType];
export const STORAGE_TYPES = Object.values(StorageType) as [StorageType, ...StorageType[]];

export const TradeDirection = {
  LONG: 'LONG',
  SHORT: 'SHORT',
} as const;
export type TradeDirection = (typeof TradeDirection)[keyof typeof TradeDirection];
export const TRADE_DIRECTIONS = Object.values(TradeDirection) as [
  TradeDirection,
  ...TradeDirection[],
];

export const TradeStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];
export const TRADE_STATUSES = Object.values(TradeStatus) as [TradeStatus, ...TradeStatus[]];

export const SnapshotType = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type SnapshotType = (typeof SnapshotType)[keyof typeof SnapshotType];
export const SNAPSHOT_TYPES = Object.values(SnapshotType) as [SnapshotType, ...SnapshotType[]];

export const SnapshotSource = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
} as const;
export type SnapshotSource = (typeof SnapshotSource)[keyof typeof SnapshotSource];

export const STABLECOIN_CATEGORIES: AssetCategory[] = [
  AssetCategory.STABLECOIN,
  AssetCategory.CASH,
];

export const CategoryGroup = {
  CRYPTO: 'crypto',
  STABLES: 'stables',
  EQUITIES: 'equities',
  UNIT_TRUSTS: 'unit_trusts',
} as const;
export type CategoryGroup = (typeof CategoryGroup)[keyof typeof CategoryGroup];

export function categoryGroup(category: string | undefined | null): CategoryGroup {
  if (category === AssetCategory.STABLECOIN || category === AssetCategory.CASH) {
    return CategoryGroup.STABLES;
  }
  if (category === AssetCategory.EQUITY) return CategoryGroup.EQUITIES;
  if (category === AssetCategory.UNIT_TRUST) return CategoryGroup.UNIT_TRUSTS;
  return CategoryGroup.CRYPTO;
}

export const CATEGORIES_IN_GROUP: Record<CategoryGroup, AssetCategory[]> = {
  [CategoryGroup.STABLES]: [AssetCategory.STABLECOIN, AssetCategory.CASH],
  [CategoryGroup.EQUITIES]: [AssetCategory.EQUITY],
  [CategoryGroup.UNIT_TRUSTS]: [AssetCategory.UNIT_TRUST],
  [CategoryGroup.CRYPTO]: [AssetCategory.LIQUID_CRYPTO, AssetCategory.NFT, AssetCategory.ANGEL],
};

export const PriceProvider = {
  COINGECKO: 'coingecko',
  YAHOO: 'yahoo',
  MANUAL: 'manual',
} as const;
export type PriceProvider = (typeof PriceProvider)[keyof typeof PriceProvider];

export const PriceSource = {
  COINGECKO: 'coingecko',
  YAHOO: 'yahoo',
  MANUAL: 'manual',
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];

// ── Domain math helpers ─────────────────────────────────────────────────

export interface PositionValueInput {
  quantity: number;
  avgCostUsd: number;
  currentPriceUsd: number | null | undefined;
}

export interface PositionValueFields {
  marketValueUsd: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
}

export function calculatePositionValue({
  quantity,
  avgCostUsd,
  currentPriceUsd,
}: PositionValueInput): PositionValueFields {
  if (currentPriceUsd === null || currentPriceUsd === undefined) {
    return {
      marketValueUsd: null,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    };
  }

  const marketValueUsd = quantity * currentPriceUsd;
  const costBasis = quantity * avgCostUsd;
  const unrealizedPnL = marketValueUsd - costBasis;

  return {
    marketValueUsd,
    unrealizedPnL,
    unrealizedPnLPct: costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0,
  };
}

export type PositionDeltaMode = 'add' | 'reduce';

export interface PositionDeltaInput {
  currentQuantity: number;
  currentAvgCostUsd: number;
  deltaQuantity: number;
  mode: PositionDeltaMode;
  /**
   * Required for add mode. Ignored for reduce mode because reductions remove
   * cost basis at the current average cost.
   */
  deltaTotalCostUsd?: number;
}

export interface PositionDeltaResult {
  currentTotalCostUsd: number;
  deltaCostUsd: number;
  nextQuantity: number;
  nextTotalCostUsd: number;
  nextAvgCostUsd: number;
}

export function applyPositionDelta({
  currentQuantity,
  currentAvgCostUsd,
  deltaQuantity,
  mode,
  deltaTotalCostUsd,
}: PositionDeltaInput): PositionDeltaResult {
  if (!(currentQuantity >= 0) || !(currentAvgCostUsd >= 0)) {
    throw new Error('Current position values must be non-negative');
  }
  if (!(deltaQuantity > 0)) {
    throw new Error('Delta quantity must be positive');
  }
  if (mode === 'add' && !(deltaTotalCostUsd !== undefined && deltaTotalCostUsd >= 0)) {
    throw new Error('Add cost must be non-negative');
  }

  const currentTotalCostUsd = currentQuantity * currentAvgCostUsd;
  const deltaCostUsd =
    mode === 'reduce' ? deltaQuantity * currentAvgCostUsd : (deltaTotalCostUsd as number);
  const multiplier = mode === 'add' ? 1 : -1;
  const nextQuantity = currentQuantity + deltaQuantity * multiplier;
  const nextTotalCostUsd = currentTotalCostUsd + deltaCostUsd * multiplier;

  if (nextQuantity < 0) {
    throw new Error('You cannot reduce below zero quantity');
  }
  if (nextTotalCostUsd < -Number.EPSILON) {
    throw new Error('You cannot reduce more cost basis than the position has');
  }

  const normalizedTotalCostUsd = Math.max(0, nextTotalCostUsd);

  return {
    currentTotalCostUsd,
    deltaCostUsd,
    nextQuantity,
    nextTotalCostUsd: normalizedTotalCostUsd,
    nextAvgCostUsd: nextQuantity > 0 ? normalizedTotalCostUsd / nextQuantity : 0,
  };
}

export function isExternalProviderCategoryCompatible(
  provider: PriceProvider,
  category: AssetCategory
): boolean {
  const group = categoryGroup(category);
  if (provider === PriceProvider.YAHOO) {
    return group === CategoryGroup.EQUITIES || group === CategoryGroup.UNIT_TRUSTS;
  }
  if (provider === PriceProvider.MANUAL) {
    return group === CategoryGroup.UNIT_TRUSTS;
  }
  return true;
}

export interface DbHealth {
  status: 'ok' | 'error';
  latency_ms: number;
  message?: string;
}

export interface Asset {
  id: string;
  coingeckoId: string | null;
  priceProvider: PriceProvider;
  providerAssetId: string | null;
  nativeCurrency: string;
  exchange: string | null;
  factsheetUrl: string | null;
  isin: string | null;
  symbol: string;
  name: string;
  category: AssetCategory;
  currentPriceUsd: number | null;
  priceUpdatedAt: string | null;
}

export interface Position {
  id: string;
  assetId: string;
  asset: Asset;
  quantity: number;
  avgCostUsd: number;
  storageType: StorageType;
  storageLocation: string | null;
  notes: string | null;
  custodyOf: string | null;
  marketValueUsd: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PositionDeltaMetadata {
  mode: PositionDeltaMode;
  quantity: number;
  totalCostUsd?: number;
}

export interface PositionHistoryEntry {
  id: string;
  positionId: string;
  assetId: string;
  mode: PositionDeltaMode;
  quantity: number;
  costBasisUsd: number;
  previousQuantity: number;
  previousAvgCostUsd: number;
  previousTotalCostUsd: number;
  nextQuantity: number;
  nextAvgCostUsd: number;
  nextTotalCostUsd: number;
  createdAt: string;
}

export interface Trade {
  id: string;
  assetId: string;
  asset: Asset;
  direction: TradeDirection;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  positionSizeUsd: number;
  entryDate: string;
  exitDate: string | null;
  status: TradeStatus;
  realizedPnL: number | null;
  realizedPnLPct: number | null;
  notes: string | null;
  tags: string | null;
}

export interface Investor {
  id: string;
  name: string;
  stakePercentage: number;
  initialCapital: number;
  currentValue: number | null;
  capitalAtYearStart: number | null;
  ytdReturn: number | null;
  ytdReturnPct: number | null;
  joinDate: string;
  notes: string | null;
  isOwner: boolean;
}

export interface Snapshot {
  id: string;
  timestamp: string;
  snapshotType: SnapshotType;
  source: SnapshotSource;
  totalValueUsd: number;
  totalValueSgd: number | null;
  usdSgdRate: number | null;
  totalCostBasis: number | null;
  monthlyReturn: number | null;
  ytdReturn: number | null;
  btcOutperform: number | null;
  ethOutperform: number | null;
  notes: string | null;
}

export interface SnapshotPosition {
  id: string;
  snapshotId: string;
  assetSymbol: string;
  quantity: number;
  priceUsd: number;
  valueUsd: number;
  allocation: number;
  asset: {
    coingeckoId: string | null;
    symbol: string;
    name: string;
    category: string;
  };
}

export interface PortfolioSummary {
  totalValueUsd: number;
  totalValueSgd: number;
  totalCostBasis: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  positionCount: number;
  lastUpdated: string;
  ytdStartDate: string | null;
}

export interface CategoryAllocation {
  category: string;
  valueUsd: number;
  percentage: number;
  positionCount: number;
}

export interface StorageAllocation {
  storageType: string;
  storageLocation: string | null;
  valueUsd: number;
  percentage: number;
  positionCount: number;
}

export interface Performer {
  assetId: string;
  symbol: string;
  name: string;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  marketValueUsd: number;
}

export interface TradeAnalytics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnL: number;
  avgPnL: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  breakdown: {
    long: { count: number; winRate: number; pnl: number };
    short: { count: number; winRate: number; pnl: number };
  };
  bestTrade: { id: string; asset: string; pnl: number; pnlPct: number; date: string } | null;
  worstTrade: { id: string; asset: string; pnl: number; pnlPct: number; date: string } | null;
  monthlyBreakdown: Array<{ month: string; pnl: number; count: number; winRate: number }>;
}

export interface InvestorReport {
  investor: Investor;
  stakeHistory: Array<{ stakePercentage: number; valueAtTime: number; timestamp: string }>;
  performanceHistory: Array<{
    timestamp: string;
    portfolioValue: number;
    investorValue: number;
    monthlyReturn: number | null;
    ytdReturn: number | null;
  }>;
  summary: {
    initialCapital: number;
    currentValue: number;
    totalReturn: number;
    totalReturnPct: number;
    stakePercentage: number;
    joinDate: string;
  };
}

export interface PerformancePoint {
  timestamp: string;
  totalValueUsd: number;
  totalValueSgd: number | null;
  unrealizedPnL: number | null;
  btcPrice: number | null;
  ethPrice: number | null;
}

export interface MonthlyReturn {
  timestamp: string;
  totalValueUsd: number;
  monthlyReturn: number | null;
  ytdReturn: number | null;
  btcOutperform: number | null;
  ethOutperform: number | null;
}

export interface CoinSearchResult {
  id: string;
  symbol: string;
  name: string;
  rank: number | null;
}

export type ProviderName = PriceProvider;

export interface ProviderSearchResult {
  id: string;
  providerAssetId: string;
  provider: ProviderName;
  symbol: string;
  name: string;
  exchange: string | null;
  nativeCurrency: string | null;
  rank: number | null;
}

export interface CreateAssetFromProviderData {
  provider: ProviderName;
  providerAssetId: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  nativeCurrency?: string;
  exchange?: string | null;
  skipPriceFetch?: boolean;
}

export interface AssetPrice {
  id: string;
  symbol: string;
  name: string;
  coingeckoId: string | null;
  currentPriceUsd: number | null;
  priceUpdatedAt: string | null;
}

export interface FxRate {
  id: string;
  fromCcy: string;
  toCcy: string;
  rate: number;
  timestamp: string;
}

export interface CurrencyConversion {
  amount: number;
  from: string;
  to: string;
  converted: number;
  rate: number;
  timestamp: string;
}

export interface CreatePositionData {
  assetId: string;
  quantity: number;
  avgCostUsd?: number;
  storageType?: StorageType;
  storageLocation?: string;
  notes?: string;
  custodyOf?: string;
}

export interface UpdatePositionData extends Partial<CreatePositionData> {
  positionDelta?: PositionDeltaMetadata;
}

export interface CreateAssetData {
  coingeckoId?: string;
  symbol: string;
  name: string;
  category?: AssetCategory;
  priceProvider?: PriceProvider;
  providerAssetId?: string | null;
  nativeCurrency?: string;
  exchange?: string | null;
  currentPriceUsd?: number;
}

export interface CreateTradeData {
  assetId: string;
  direction?: TradeDirection;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  entryDate: string;
  exitDate?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateInvestorData {
  name: string;
  stakePercentage?: number;
  initialCapital?: number;
  joinDate?: string;
  notes?: string;
  isOwner?: boolean;
}

export interface CreateManualSnapshotData {
  manual: true;
  timestamp: string;
  snapshotType?: SnapshotType;
  totalValueUsd: number;
  totalCostBasis?: number;
  notes?: string;
}

export interface UpdateSnapshotData {
  timestamp?: string;
  snapshotType?: SnapshotType;
  totalValueUsd?: number;
  totalCostBasis?: number;
  notes?: string;
}

export interface BulkImportPosition {
  asset: {
    coingeckoId: string | null;
    symbol: string;
    name: string;
    category: AssetCategory;
    // Optional fields — carried through on copy/paste so re-importing a non-existent
    // equity still wires up price feeds. Backend only uses these when creating a
    // brand-new Asset row; ignored if the symbol already exists.
    priceProvider?: PriceProvider | null;
    providerAssetId?: string | null;
    nativeCurrency?: string | null;
    exchange?: string | null;
  };
  quantity: number;
  avgCostUsd: number;
  storageType: StorageType;
  storageLocation: string | null;
  notes: string | null;
  custodyOf?: string | null;
}

export interface BulkImportResult {
  results: Array<{ success: boolean; symbol: string; error?: string }>;
  successCount: number;
  totalCount: number;
}

export interface BulkImportSnapshot {
  timestamp: string;
  snapshotType?: SnapshotType;
  totalValueUsd: number;
  totalCostBasis?: number | null;
  notes?: string | null;
}

export interface BulkImportSnapshotResult {
  results: Array<{ success: boolean; timestamp: string; error?: string }>;
  successCount: number;
  totalCount: number;
}

export interface BulkImportTrade {
  asset: {
    coingeckoId: string | null;
    symbol: string;
    name: string;
    category: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH';
  };
  direction: TradeDirection;
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  entryDate: string;
  exitDate?: string | null;
  status?: TradeStatus;
  notes?: string | null;
  tags?: string[] | null;
}

export interface BenchmarkHistoricalData {
  coingeckoId?: string;
  provider?: ProviderName;
  providerAssetId?: string;
  days: number;
  data: Array<{ timestamp: number; price: number }>;
}
