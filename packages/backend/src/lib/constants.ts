/** Fallback USD/SGD exchange rate when FX API is unavailable */
export const USD_SGD_FALLBACK_RATE = 1.35;

/** Maximum positions allowed per asset category */
export const MAX_POSITIONS_PER_CATEGORY = 20;

/** Default limit for snapshot list queries */
export const DEFAULT_SNAPSHOT_LIMIT = 100;

/** Maximum days of historical price data from CoinGecko */
export const MAX_HISTORICAL_DAYS = 365;

/** Express JSON payload size limit */
export const MAX_PAYLOAD_SIZE = '1mb';

/** Rate limiting: requests per window (override with RATE_LIMIT_MAX env var) */
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '200', 10);

// ── Domain enums ────────────────────────────────────────────────────────

/** Asset categories */
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

/** Position storage types */
export const StorageType = {
  WALLET: 'WALLET',
  CEX: 'CEX',
  DEFI: 'DEFI',
  BANK: 'BANK',
  BROKERAGE: 'BROKERAGE',
} as const;
export type StorageType = (typeof StorageType)[keyof typeof StorageType];
export const STORAGE_TYPES = Object.values(StorageType) as [StorageType, ...StorageType[]];

/** Trade direction */
export const TradeDirection = {
  LONG: 'LONG',
  SHORT: 'SHORT',
} as const;
export type TradeDirection = (typeof TradeDirection)[keyof typeof TradeDirection];
export const TRADE_DIRECTIONS = Object.values(TradeDirection) as [
  TradeDirection,
  ...TradeDirection[],
];

/** Trade status */
export const TradeStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
} as const;
export type TradeStatus = (typeof TradeStatus)[keyof typeof TradeStatus];
export const TRADE_STATUSES = Object.values(TradeStatus) as [TradeStatus, ...TradeStatus[]];

/** Snapshot types */
export const SnapshotType = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  MONTHLY: 'MONTHLY',
} as const;
export type SnapshotType = (typeof SnapshotType)[keyof typeof SnapshotType];
export const SNAPSHOT_TYPES = Object.values(SnapshotType) as [SnapshotType, ...SnapshotType[]];

/** Snapshot sources */
export const SnapshotSource = {
  AUTOMATIC: 'AUTOMATIC',
  MANUAL: 'MANUAL',
} as const;
export type SnapshotSource = (typeof SnapshotSource)[keyof typeof SnapshotSource];

/** Stablecoin-like categories (for grouping in UI) */
export const STABLECOIN_CATEGORIES: AssetCategory[] = [
  AssetCategory.STABLECOIN,
  AssetCategory.CASH,
];

/** Category groups — single source of truth for position-limit and UI bucketing */
export const CategoryGroup = {
  CRYPTO: 'crypto',
  STABLES: 'stables',
  EQUITIES: 'equities',
  UNIT_TRUSTS: 'unit_trusts',
} as const;
export type CategoryGroup = (typeof CategoryGroup)[keyof typeof CategoryGroup];

export function categoryGroup(category: string): CategoryGroup {
  if (category === AssetCategory.STABLECOIN || category === AssetCategory.CASH) {
    return CategoryGroup.STABLES;
  }
  if (category === AssetCategory.EQUITY) return CategoryGroup.EQUITIES;
  if (category === AssetCategory.UNIT_TRUST) return CategoryGroup.UNIT_TRUSTS;
  return CategoryGroup.CRYPTO;
}

/** Asset categories that belong to each group — for Prisma `in` filters */
export const CATEGORIES_IN_GROUP: Record<CategoryGroup, AssetCategory[]> = {
  [CategoryGroup.STABLES]: [AssetCategory.STABLECOIN, AssetCategory.CASH],
  [CategoryGroup.EQUITIES]: [AssetCategory.EQUITY],
  [CategoryGroup.UNIT_TRUSTS]: [AssetCategory.UNIT_TRUST],
  [CategoryGroup.CRYPTO]: [AssetCategory.LIQUID_CRYPTO, AssetCategory.NFT, AssetCategory.ANGEL],
};

/** Price provider identifier stored on Asset.priceProvider */
export const PriceProvider = {
  COINGECKO: 'coingecko',
  YAHOO: 'yahoo',
  MANUAL: 'manual',
} as const;
export type PriceProvider = (typeof PriceProvider)[keyof typeof PriceProvider];

/** Source attribution for PriceHistory rows */
export const PriceSource = {
  COINGECKO: 'coingecko',
  YAHOO: 'yahoo',
  MANUAL: 'manual',
} as const;
export type PriceSource = (typeof PriceSource)[keyof typeof PriceSource];
