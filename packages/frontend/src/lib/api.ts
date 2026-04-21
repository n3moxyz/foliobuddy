import type {
  Asset,
  AssetPrice,
  BenchmarkHistoricalData,
  BulkImportPosition,
  BulkImportResult,
  BulkImportSnapshot,
  BulkImportSnapshotResult,
  BulkImportTrade,
  CategoryAllocation,
  CoinSearchResult,
  CreateAssetData,
  CreateAssetFromProviderData,
  CreateInvestorData,
  CreateManualSnapshotData,
  CreatePositionData,
  CreateTradeData,
  CurrencyConversion,
  DbHealth,
  FxRate,
  Investor,
  InvestorReport,
  MonthlyReturn,
  PaginatedResponse,
  PerformancePoint,
  Performer,
  PortfolioSummary,
  Position,
  ProviderName,
  ProviderSearchResult,
  Snapshot,
  SnapshotPosition,
  StorageAllocation,
  Trade,
  TradeAnalytics,
  UpdateSnapshotData,
} from './types';

export * from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

function buildQuery(
  params: Record<string, string | number | boolean | undefined | null>
): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

// Token getter - will be set by the auth provider
let getToken: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: () => Promise<string | null>) {
  getToken = getter;
}

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
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
  getWorstPerformers: (limit = 5) =>
    request<Performer[]>(`/positions/performers/worst?limit=${limit}`),
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
  deletePosition: (id: string) => request<void>(`/positions/${id}`, { method: 'DELETE' }),
  deleteAllPositions: () => request<{ count: number }>('/positions', { method: 'DELETE' }),
  bulkImportPositions: (positions: BulkImportPosition[]) =>
    request<BulkImportResult>('/positions/bulk', {
      method: 'POST',
      body: JSON.stringify({ positions }),
    }),

  // Assets
  getAssets: (params?: { category?: string; search?: string }) =>
    request<Asset[]>(`/assets${buildQuery({ category: params?.category, search: params?.search })}`),
  searchCoins: (query: string) =>
    request<CoinSearchResult[]>(`/assets/search?q=${encodeURIComponent(query)}`),
  searchAssets: (query: string, params?: { category?: string; provider?: ProviderName }) =>
    request<ProviderSearchResult[]>(
      `/assets/search${buildQuery({ q: query, category: params?.category, provider: params?.provider })}`
    ),
  getAsset: (id: string) => request<Asset>(`/assets/${id}`),
  createAsset: (data: CreateAssetData) =>
    request<Asset>('/assets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createAssetFromCoinGecko: (data: {
    coingeckoId: string;
    symbol: string;
    name: string;
    category?: string;
    skipPriceFetch?: boolean;
  }) =>
    request<Asset>('/assets/from-coingecko', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createAssetFromProvider: (data: CreateAssetFromProviderData) =>
    request<Asset>('/assets/from-provider', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  createUnitTrust: (data: {
    symbol: string;
    name: string;
    nativeCurrency: string;
    factsheetUrl?: string | null;
    isin?: string | null;
    initialNav?: number;
    navAsOfDate?: string;
  }) =>
    request<Asset>('/assets/unit-trust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateAssetNav: (id: string, data: { navPrice: number; asOfDate?: string; notes?: string }) =>
    request<Asset>(`/assets/${id}/nav`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  refreshAssetPrice: (id: string) =>
    request<Asset>(`/assets/${id}/refresh-price`, { method: 'POST' }),

  // Trades
  getTrades: (params?: { status?: string; assetId?: string; from?: string; to?: string }) =>
    request<Trade[]>(
      `/trades${buildQuery({ status: params?.status, assetId: params?.assetId, from: params?.from, to: params?.to })}`
    ),
  getTradesPaginated: (params?: {
    status?: string;
    assetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) =>
    request<PaginatedResponse<Trade>>(
      `/trades${buildQuery({ status: params?.status, assetId: params?.assetId, from: params?.from, to: params?.to, page: params?.page, limit: params?.limit })}`
    ),
  getTradeAnalytics: (params?: { from?: string; to?: string }) =>
    request<TradeAnalytics>(
      `/trades/analytics${buildQuery({ from: params?.from, to: params?.to })}`
    ),
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
  deleteTrade: (id: string) => request<void>(`/trades/${id}`, { method: 'DELETE' }),
  deleteAllTrades: () => request<{ count: number }>('/trades', { method: 'DELETE' }),
  bulkImportTrades: (trades: BulkImportTrade[]) =>
    request<BulkImportResult>('/trades/bulk-import', {
      method: 'POST',
      body: JSON.stringify(trades),
    }),

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
  deleteInvestor: (id: string, reassignTo?: string) =>
    request<void>(`/investors/${id}${reassignTo ? `?reassignTo=${reassignTo}` : ''}`, {
      method: 'DELETE',
    }),

  // Snapshots
  getSnapshots: (params?: {
    type?: string;
    source?: string;
    from?: string;
    to?: string;
    limit?: number;
  }) =>
    request<Snapshot[]>(
      `/snapshots${buildQuery({ type: params?.type, source: params?.source, from: params?.from, to: params?.to, limit: params?.limit })}`
    ),
  getSnapshotsPaginated: (params?: {
    type?: string;
    source?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) =>
    request<PaginatedResponse<Snapshot>>(
      `/snapshots${buildQuery({ type: params?.type, source: params?.source, from: params?.from, to: params?.to, page: params?.page, limit: params?.limit })}`
    ),
  getPerformanceHistory: (params?: { days?: number; from?: string; to?: string }) =>
    request<PerformancePoint[]>(
      `/snapshots/performance${buildQuery({ days: params?.days, from: params?.from, to: params?.to })}`
    ),
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
  deleteSnapshot: (id: string) => request<void>(`/snapshots/${id}`, { method: 'DELETE' }),
  deleteAllSnapshots: () => request<{ count: number }>('/snapshots', { method: 'DELETE' }),
  bulkImportSnapshots: (snapshots: BulkImportSnapshot[]) =>
    request<BulkImportSnapshotResult>('/snapshots/bulk', {
      method: 'POST',
      body: JSON.stringify({ snapshots }),
    }),
  getSnapshotPositions: (id: string) => request<SnapshotPosition[]>(`/snapshots/${id}/positions`),

  // Prices
  getCurrentPrices: () => request<AssetPrice[]>('/prices/current'),
  refreshPrices: () =>
    request<{ updated: number; errors: number }>('/prices/refresh', { method: 'POST' }),
  getBenchmarkHistory: (coingeckoId: string, days: number) =>
    request<BenchmarkHistoricalData>(`/prices/historical/${coingeckoId}?days=${days}`),

  // FX
  getFxRates: () => request<FxRate[]>('/fx/rates'),
  convertCurrency: (amount: number, from: string, to: string) =>
    request<CurrencyConversion>(`/fx/convert?amount=${amount}&from=${from}&to=${to}`),
  refreshFxRates: () => request<{ rates: FxRate[] }>('/fx/refresh', { method: 'POST' }),

  // Export
  exportPositionsCsv: () => `${API_BASE}/export/csv/positions`,
  exportTradesCsv: (params?: { status?: string; from?: string; to?: string }) =>
    `${API_BASE}/export/csv/trades${buildQuery({ status: params?.status, from: params?.from, to: params?.to })}`,
  exportExcel: () => `${API_BASE}/export/excel`,

  // Health
  getDbHealth: () => request<DbHealth>('/health/db'),
};
