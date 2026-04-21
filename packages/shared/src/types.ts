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

export interface DbHealth {
  status: 'ok' | 'error';
  latency_ms: number;
  message?: string;
}

export interface Asset {
  id: string;
  coingeckoId: string | null;
  priceProvider: 'coingecko' | 'yahoo' | 'manual';
  providerAssetId: string | null;
  nativeCurrency: string;
  exchange: string | null;
  factsheetUrl: string | null;
  isin: string | null;
  symbol: string;
  name: string;
  category: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH' | 'EQUITY' | 'UNIT_TRUST';
  currentPriceUsd: number | null;
  priceUpdatedAt: string | null;
}

export interface Position {
  id: string;
  assetId: string;
  asset: Asset;
  quantity: number;
  avgCostUsd: number;
  storageType: 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE';
  storageLocation: string | null;
  notes: string | null;
  custodyOf: string | null;
  marketValueUsd: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Trade {
  id: string;
  assetId: string;
  asset: Asset;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  positionSizeUsd: number;
  entryDate: string;
  exitDate: string | null;
  status: 'OPEN' | 'CLOSED';
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
  snapshotType: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  source: 'AUTOMATIC' | 'MANUAL';
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

export type ProviderName = 'coingecko' | 'yahoo' | 'manual';

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
  category: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH' | 'EQUITY' | 'UNIT_TRUST';
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
  storageType?: 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE';
  storageLocation?: string;
  notes?: string;
  custodyOf?: string;
}

export interface CreateAssetData {
  coingeckoId?: string;
  symbol: string;
  name: string;
  category?: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH';
}

export interface CreateTradeData {
  assetId: string;
  direction?: 'LONG' | 'SHORT';
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
  snapshotType?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  totalValueUsd: number;
  totalCostBasis?: number;
  notes?: string;
}

export interface UpdateSnapshotData {
  timestamp?: string;
  snapshotType?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  totalValueUsd?: number;
  totalCostBasis?: number;
  notes?: string;
}

export interface BulkImportPosition {
  asset: {
    coingeckoId: string | null;
    symbol: string;
    name: string;
    category: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH';
  };
  quantity: number;
  avgCostUsd: number;
  storageType: 'WALLET' | 'CEX' | 'DEFI' | 'BANK' | 'BROKERAGE';
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
  snapshotType?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
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
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number | null;
  quantity: number;
  entryDate: string;
  exitDate?: string | null;
  status?: 'OPEN' | 'CLOSED';
  notes?: string | null;
  tags?: string[] | null;
}

export interface BenchmarkHistoricalData {
  coingeckoId: string;
  days: number;
  data: Array<{ timestamp: number; price: number }>;
}
