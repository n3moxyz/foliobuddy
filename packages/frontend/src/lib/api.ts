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
  Snapshot,
  SnapshotPosition,
  StorageAllocation,
  Trade,
  TradeAnalytics,
  UpdateSnapshotData,
} from './types';

export * from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

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
  getAssets: (params?: { category?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.category) searchParams.set('category', params.category);
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return request<Asset[]>(`/assets${query ? `?${query}` : ''}`);
  },
  searchCoins: (query: string) =>
    request<CoinSearchResult[]>(`/assets/search?q=${encodeURIComponent(query)}`),
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
  getTradesPaginated: (params?: {
    status?: string;
    assetId?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.assetId) searchParams.set('assetId', params.assetId);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<PaginatedResponse<Trade>>(`/trades${query ? `?${query}` : ''}`);
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
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    const query = searchParams.toString();
    return request<Snapshot[]>(`/snapshots${query ? `?${query}` : ''}`);
  },
  getSnapshotsPaginated: (params?: {
    type?: string;
    source?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.type) searchParams.set('type', params.type);
    if (params?.source) searchParams.set('source', params.source);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.limit) searchParams.set('limit', String(params.limit));
    const query = searchParams.toString();
    return request<PaginatedResponse<Snapshot>>(`/snapshots${query ? `?${query}` : ''}`);
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
  exportTradesCsv: (params?: { status?: string; from?: string; to?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.from) searchParams.set('from', params.from);
    if (params?.to) searchParams.set('to', params.to);
    const query = searchParams.toString();
    return `${API_BASE}/export/csv/trades${query ? `?${query}` : ''}`;
  },
  exportExcel: () => `${API_BASE}/export/excel`,

  // Health
  getDbHealth: () => request<DbHealth>('/health/db'),
};
