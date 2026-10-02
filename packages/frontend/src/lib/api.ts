import type {
  Asset,
  AssetNewsResponse,
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
  NativeReconciliationResult,
  IbkrReconciliationResult,
  IbkrSyncRun,
  IbkrSyncDevice,
  IbkrDeviceEnrollment,
  PaginatedResponse,
  ParsedStatementResponse,
  NewsEnrichmentResponse,
  NewsFeedbackPayload,
  PerformancePoint,
  Performer,
  PortfolioNewsResponse,
  PortfolioSummary,
  Position,
  PositionHistoryEntry,
  ProviderName,
  ProviderSearchResult,
  Snapshot,
  SnapshotPosition,
  StorageAllocation,
  Trade,
  TradeAnalytics,
  UpdatePositionData,
  UpdateSnapshotData,
  UpdateUserPreferencesData,
  UserPreferences,
} from './types';
import {
  assertAuthSession,
  assertAuthSessionToken,
  captureAuthSession,
  combinedSignal,
  isAuthSessionCurrent,
  AuthSessionChangedError,
  setSessionTokenGetter,
  type AuthSession,
} from './authSession';

export * from './types';

const API_BASE = import.meta.env.VITE_API_URL || '/api/v1';

function buildQuery(params: Record<string, string | number | boolean | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      sp.set(key, String(value));
    }
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : '';
}

export function setTokenGetter(getter: () => Promise<string | null>) {
  setSessionTokenGetter(getter);
}

async function request<T>(
  endpoint: string,
  options?: RequestInit,
  session = captureAuthSession(),
  onDispatch?: () => void
): Promise<T> {
  assertAuthSession(session);
  const getToken = session.getToken;
  const combined = combinedSignal(session.signal, options?.signal);
  try {
    const token = await getToken();
    assertAuthSessionToken(session, token);
    const headers = new Headers(options?.headers);
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    onDispatch?.();
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: Object.fromEntries(headers.entries()),
      signal: combined.signal,
    });
    assertAuthSession(session);
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      assertAuthSession(session);
      throw new Error(error?.error || `Request failed (HTTP ${response.status})`);
    }
    if (response.status === 204) return undefined as T;
    const data = await response.json();
    assertAuthSession(session);
    return data as T;
  } catch (error) {
    if (!isAuthSessionCurrent(session)) throw new AuthSessionChangedError();
    throw error;
  } finally {
    combined.dispose();
  }
}

async function writePosition<T>(
  endpoint: string,
  method: 'POST' | 'PUT',
  data: CreatePositionData | UpdatePositionData | { positions: BulkImportPosition[] }
) {
  const session = captureAuthSession();
  const rows = 'positions' in data ? data.positions : [data];
  if (
    rows.some(
      (row) =>
        row.avgCostNative !== undefined ||
        row.costCurrency !== undefined ||
        ('positionDelta' in row && row.positionDelta?.nativeAmount !== undefined)
    )
  ) {
    // A frontend can finish deploying before the backend. Older servers silently
    // strip unknown fields, so prove support before submitting a native write.
    let supported: boolean;
    try {
      supported = (
        await request<{ supported: boolean }>(
          '/positions/native-cost-capabilities',
          undefined,
          session
        )
      ).supported;
    } catch {
      assertAuthSession(session);
      throw new Error('Native cost support could not be verified. Refresh and try again.');
    }
    if (!supported) throw new Error('Native cost support is not ready. Refresh and try again.');
  }
  return request<T>(endpoint, { method, body: JSON.stringify(data) }, session);
}

export const api = {
  // News
  getNews: () => request<PortfolioNewsResponse>('/news'),
  getNewsEnrichment: () => request<NewsEnrichmentResponse>('/news/enrichment'),
  getAssetNews: (assetId: string) =>
    request<AssetNewsResponse>(`/news/asset/${encodeURIComponent(assetId)}`),
  sendNewsFeedback: (data: NewsFeedbackPayload) =>
    request<void>('/news/feedback', { method: 'POST', body: JSON.stringify(data) }),

  // Positions
  getPositions: () => request<Position[]>('/positions'),
  createIbkrCashPosition: () => request<Position>('/ibkr/cash-position', { method: 'POST' }),
  reconcileIbkr: (payload: {
    action: 'preview' | 'apply';
    kind: 'cash' | 'sync';
    cashPositionId: string;
    input: unknown;
    expectedState?: string;
  }) =>
    request<IbkrReconciliationResult>('/ibkr/reconcile', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getIbkrRuns: () => request<IbkrSyncRun[]>('/ibkr/runs'),
  getIbkrDevices: (cashPositionId?: string) =>
    request<IbkrSyncDevice[]>(`/ibkr/devices${buildQuery({ cashPositionId })}`),
  registerIbkrDevice: (payload: { cashPositionId: string; enrollment: IbkrDeviceEnrollment }) =>
    request<IbkrSyncDevice>('/ibkr/devices', { method: 'POST', body: JSON.stringify(payload) }),
  revokeIbkrDevice: (deviceId: string) =>
    request<void>(`/ibkr/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }),
  restoreIbkr: (runId: string, action: 'preview' | 'apply') =>
    request<{
      applied: boolean;
      runId: string;
      before: unknown;
      after: unknown;
      review: Array<{
        id: string;
        symbol: string;
        cash: boolean;
        previousQuantity: number;
        quantity: number;
        previousAvgCostNative: number | null;
        avgCostNative: number | null;
        costCurrency: string | null;
      }>;
    }>('/ibkr/restore', {
      method: 'POST',
      body: JSON.stringify({ runId, action }),
    }),
  reconcileNativeCosts: (payload: unknown) =>
    request<NativeReconciliationResult>('/positions/native-cost-reconciliation', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  getPositionSummary: () => request<PortfolioSummary>('/positions/summary'),
  getAllocationByCategory: () => request<CategoryAllocation[]>('/positions/allocation/category'),
  getAllocationByStorage: () => request<StorageAllocation[]>('/positions/allocation/storage'),
  getTopPerformers: (limit = 5) => request<Performer[]>(`/positions/performers/top?limit=${limit}`),
  getWorstPerformers: (limit = 5) =>
    request<Performer[]>(`/positions/performers/worst?limit=${limit}`),
  getPosition: (id: string) => request<Position>(`/positions/${id}`),
  getPositionHistory: (id: string) => request<PositionHistoryEntry[]>(`/positions/${id}/history`),
  cancelPositionHistory: (id: string, historyId: string) =>
    request<Position>(`/positions/${id}/history/${historyId}`, { method: 'DELETE' }),
  createPosition: (data: CreatePositionData) => writePosition<Position>('/positions', 'POST', data),
  updatePosition: (id: string, data: UpdatePositionData) =>
    writePosition<Position>(`/positions/${id}`, 'PUT', data),
  deletePosition: (id: string) => request<void>(`/positions/${id}`, { method: 'DELETE' }),
  deleteAllPositions: () => request<{ count: number }>('/positions', { method: 'DELETE' }),
  bulkImportPositions: (positions: BulkImportPosition[]) =>
    writePosition<BulkImportResult>('/positions/bulk', 'POST', { positions }),

  // Assets
  getAssets: (params?: { category?: string; search?: string }) =>
    request<Asset[]>(
      `/assets${buildQuery({ category: params?.category, search: params?.search })}`
    ),
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
    yahooSymbol?: string | null;
  }) =>
    request<Asset>('/assets/unit-trust', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  parseUnitTrustStatement: async (file: File): Promise<ParsedStatementResponse> => {
    const session = captureAuthSession();
    const arrayBuffer = await file.arrayBuffer();
    return request<ParsedStatementResponse>(
      '/assets/parse-unit-trust-statement',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/pdf' },
        body: arrayBuffer,
      },
      session
    );
  },
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
  closeTrade: (
    id: string,
    data: { exitPrice: number; exitDate?: string; fundingCost?: number; notes?: string }
  ) =>
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
  getPerformanceHistory: (params?: { days?: number; from?: string; to?: string; all?: boolean }) =>
    request<PerformancePoint[]>(
      `/snapshots/performance${buildQuery({ days: params?.days, from: params?.from, to: params?.to, all: params?.all })}`
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
  getBenchmarkHistory: (params: {
    provider?: ProviderName;
    providerAssetId: string;
    days: number;
  }) =>
    request<BenchmarkHistoricalData>(
      `/prices/historical/${encodeURIComponent(params.providerAssetId)}${buildQuery({
        days: params.days,
        provider: params.provider,
      })}`
    ),

  // FX
  getFxRates: () => request<FxRate[]>('/fx/rates'),
  convertCurrency: (amount: number, from: string, to: string) =>
    request<CurrencyConversion>(`/fx/convert?amount=${amount}&from=${from}&to=${to}`),
  refreshFxRates: () => request<{ rates: FxRate[] }>('/fx/refresh', { method: 'POST' }),

  // User preferences (snapshot schedule + aggregate perp exposure)
  getUserPreferences: () => request<UserPreferences>('/users/me/preferences'),
  updateUserPreferences: (data: UpdateUserPreferencesData) =>
    request<UserPreferences>('/users/me/preferences', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // Export
  exportPositionsCsv: () => `${API_BASE}/export/csv/positions`,
  exportTradesCsv: (params?: { status?: string; from?: string; to?: string }) =>
    `${API_BASE}/export/csv/trades${buildQuery({ status: params?.status, from: params?.from, to: params?.to })}`,
  exportExcel: () => `${API_BASE}/export/excel`,

  // Health
  getDbHealth: () => request<DbHealth>('/health/db'),
};

export type IbkrHelperOperation = 'pair' | 'capture' | 'checkpoint' | 'verify' | 'finish';
export interface IbkrHelperChallenge {
  challenge: string;
  connectorFingerprint: string;
  operation: IbkrHelperOperation;
  cashPositionId: string;
  jobId: string | null;
}

/** A multi-step sync must never acquire a different login between its requests. */
export function apiForSession(session: AuthSession) {
  return {
    getPositions: () => request<Position[]>('/positions', undefined, session),
    reconcileIbkr: (payload: Parameters<typeof api.reconcileIbkr>[0], onDispatch?: () => void) =>
      request<IbkrReconciliationResult>(
        '/ibkr/reconcile',
        { method: 'POST', body: JSON.stringify(payload) },
        session,
        onDispatch
      ),
    restoreIbkr: (runId: string, action: 'preview' | 'apply') =>
      request<Awaited<ReturnType<typeof api.restoreIbkr>>>(
        '/ibkr/restore',
        { method: 'POST', body: JSON.stringify({ runId, action }) },
        session
      ),
    helperPermit: (challenge: IbkrHelperChallenge) =>
      request<{ permit: string; expiresAt: string }>(
        '/ibkr/helper-permits',
        { method: 'POST', body: JSON.stringify(challenge) },
        session
      ),
  };
}
