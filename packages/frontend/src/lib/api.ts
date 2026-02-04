const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Token getter - will be set by the auth provider
let getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  getToken = getter;
}

async function request<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;

  // Get auth token if available
  const token = getToken ? await getToken() : null;

  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

export const api = {
  // Positions
  getPositions: () => request<Position[]>('/positions'),
  getPositionSummary: () => request<PortfolioSummary>('/positions/summary'),
  getAllocationByCategory: () => request<CategoryAllocation[]>('/positions/allocation/category'),
  getAllocationByStorage: () => request<StorageAllocation[]>('/positions/allocation/storage'),
  getTopPerformers: (limit = 5) => request<Performer[]>(`/positions/performers/top?limit=${limit}`),
  getWorstPerformers: (limit = 5) => request<Performer[]>(`/positions/performers/worst?limit=${limit}`),
  getPosition: (id: string) => request<Position>(`/positions/${id}`),
  createPosition: (data: CreatePositionData) =>
    request<Position>('/positions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updatePosition: (id: string, data: Partial<CreatePositionData>) =>
    request<Position>(`/positions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deletePosition: (id: string) =>
    request<void>(`/positions/${id}`, { method: 'DELETE' }),
  deleteAllPositions: () =>
    request<{ count: number }>('/positions', { method: 'DELETE' }),
  bulkImportPositions: (positions: BulkImportPosition[]) =>
    request<BulkImportResult>('/positions/bulk', {
      method: 'POST',
      body: JSON.stringify({ positions }),
    }),

  // Assets
  getAssets: (params?: { category?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return request<Asset[]>(`/assets${query ? `?${query}` : ''}`);
  },
  searchCoins: (query: string) => request<CoinSearchResult[]>(`/assets/search?q=${encodeURIComponent(query)}`),
  getAsset: (id: string) => request<Asset>(`/assets/${id}`),
  createAsset: (data: CreateAssetData) =>
    request<Asset>('/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createAssetFromCoinGecko: (data: { coingeckoId: string; symbol: string; name: string; category?: string; skipPriceFetch?: boolean }) =>
    request<Asset>('/assets/from-coingecko', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Trades
  getTrades: (params?: { status?: string; assetId?: string; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.assetId) searchParams.set('assetId', params.assetId);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return request<Trade[]>(`/trades${query ? `?${query}` : ''}`);
  },
  getTradeAnalytics: (params?: { from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return request<TradeAnalytics>(`/trades/analytics${query ? `?${query}` : ''}`);
  },
  getTrade: (id: string) => request<Trade>(`/trades/${id}`),
  createTrade: (data: CreateTradeData) =>
    request<Trade>('/trades', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateTrade: (id: string, data: Partial<CreateTradeData>) =>
    request<Trade>(`/trades/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  closeTrade: (id: string, data: { exitPrice: number; exitDate?: string; notes?: string }) =>
    request<Trade>(`/trades/${id}/close`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  deleteTrade: (id: string) =>
    request<void>(`/trades/${id}`, { method: 'DELETE' }),
  deleteAllTrades: () =>
    request<{ count: number }>('/trades', { method: 'DELETE' }),

  // Investors
  getInvestors: () => request<Investor[]>('/investors'),
  getInvestor: (id: string) => request<Investor>(`/investors/${id}`),
  getInvestorReport: (id: string) => request<InvestorReport>(`/investors/${id}/report`),
  createInvestor: (data: CreateInvestorData) =>
    request<Investor>('/investors', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateInvestor: (id: string, data: Partial<CreateInvestorData>) =>
    request<Investor>(`/investors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteInvestor: (id: string) =>
    request<void>(`/investors/${id}`, { method: 'DELETE' }),

  // Snapshots
  getSnapshots: (params?: { type?: string; source?: string; from?: string; to?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString();
    return request<Snapshot[]>(`/snapshots${query ? `?${query}` : ''}`);
  },
  getPerformanceHistory: (params?: { days?: number; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.days) searchParams.set('days', params.days.toString());
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return request<PerformancePoint[]>(`/snapshots/performance${query ? `?${query}` : ''}`);
  },
  getMonthlyReturns: (year?: number) =>
    request<MonthlyReturn[]>(`/snapshots/monthly${year ? `?year=${year}` : ''}`),
  createSnapshot: (type?: string) =>
    request<Snapshot>('/snapshots', {
      method: 'POST',
      body: JSON.stringify({ type }),
    }),
  createManualSnapshot: (data: CreateManualSnapshotData) =>
    request<Snapshot>('/snapshots', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateSnapshot: (id: string, data: UpdateSnapshotData) =>
    request<Snapshot>(`/snapshots/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteSnapshot: (id: string) =>
    request<void>(`/snapshots/${id}`, { method: 'DELETE' }),
  deleteAllSnapshots: () =>
    request<{ count: number }>('/snapshots', { method: 'DELETE' }),
  bulkImportSnapshots: (snapshots: BulkImportSnapshot[]) =>
    request<BulkImportSnapshotResult>('/snapshots/bulk', {
      method: 'POST',
      body: JSON.stringify({ snapshots }),
    }),
  getSnapshotPositions: (id: string) =>
    request<SnapshotPosition[]>(`/snapshots/${id}/positions`),

  // Prices
  getCurrentPrices: () => request<AssetPrice[]>('/prices/current'),
  refreshPrices: () =>
    request<{ updated: number; errors: number }>('/prices/refresh', { method: 'POST' }),

  // FX
  getFxRates: () => request<FxRate[]>('/fx/rates'),
  convertCurrency: (amount: number, from: string, to: string) =>
    request<CurrencyConversion>(`/fx/convert?amount=${amount}&from=${from}&to=${to}`),
  refreshFxRates: () =>
    request<{ rates: FxRate[] }>('/fx/refresh', { method: 'POST' }),

  // Export
  exportPositionsCsv: () => `${API_BASE}/export/csv/positions`,
  exportTradesCsv: (params?: { status?: string; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return `${API_BASE}/export/csv/trades${query ? `?${query}` : ''}`;
  },
  exportExcel: () => `${API_BASE}/export/excel`,
};

// Types
export interface Asset {
  id: string;
  coingeckoId: string | null;
  symbol: string;
  name: string;
  category: 'LIQUID_CRYPTO' | 'STABLECOIN' | 'NFT' | 'ANGEL' | 'CASH';
  currentPriceUsd: number | null;
  priceUpdatedAt: string | null;
}

export interface Position {
  id: string;
  assetId: string;
  asset: Asset;
  quantity: number;
  avgCostUsd: number;
  storageType: 'WALLET' | 'CEX' | 'DEFI' | 'BANK';
  storageLocation: string | null;
  notes: string | null;
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
  totalCostBasis: number; // YTD starting value (earliest snapshot of current year)
  unrealizedPnL: number;  // YTD P&L
  unrealizedPnLPct: number; // YTD return %
  positionCount: number;
  lastUpdated: string;
  ytdStartDate: string | null; // Date of the earliest snapshot used for YTD
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
  storageType?: 'WALLET' | 'CEX' | 'DEFI' | 'BANK';
  storageLocation?: string;
  notes?: string;
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
  stakePercentage: number;
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
  storageType: 'WALLET' | 'CEX' | 'DEFI' | 'BANK';
  storageLocation: string | null;
  notes: string | null;
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
