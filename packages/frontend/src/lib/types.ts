export * from '@foliobuddy/shared';

// -- Frontend-only types --

/** Time-period selector used by PortfolioChart and BenchmarkComparisonChart */
export type TimePeriod = '7D' | '1M' | '3M' | '1Y' | 'YTD' | 'Max';

/** A single item in a position/trade bulk-import result (frontend display) */
export type PositionImportResultItem = {
  success: boolean;
  symbol: string;
  error?: string;
};

/** A single item in a snapshot bulk-import result (frontend display) */
export type SnapshotImportResultItem = {
  success: boolean;
  timestamp: string;
  error?: string;
};

export interface ParsedStatementHolding {
  symbol: string;
  name: string;
  isin: string;
  nativeCurrency: string;
  units: number;
  avgCostNative: number;
  navNative: number;
  navUsd: number;
  currentValueNative: number;
  totalCostNative: number;
  totalCostUsd: number;
  fxRateToUsd: number | null;
  navAsOfDate: string | null;
  yahooSymbol: string | null;
}

export interface ParsedStatementResponse {
  broker: string;
  periodEnd: string | null;
  holdings: ParsedStatementHolding[];
}

// -- News tab (GET /news) --

export type NewsSourceTier = 1 | 2 | 3 | 4;
export type NewsImportance = 'high' | 'medium' | 'low';

export interface NewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
  /** 1 = primary/authoritative … 4 = low-confidence or unrated */
  sourceTier: NewsSourceTier;
  /** Interpretable source label ("Primary source", "Trusted press", …); null when unrated */
  sourceLabel: string | null;
  primarySource: boolean;
  /** Likely decision relevance from the headline — never verified truth */
  importance: NewsImportance;
  eventType: string;
  /** Every holding the clustered story touches, most relevant first */
  affectedSymbols: string[];
  /** Concise user-safe explanations — no values, no scoring weights */
  rankingReasons: string[];
}

export interface AssetNewsGroup {
  assetId: string;
  symbol: string;
  name: string;
  category: string;
  /** True when the asset is only present via an open trade, not a held position */
  openTradeOnly: boolean;
  items: NewsItem[];
}

export interface PortfolioNewsResponse {
  /** Highest-ranked genuinely material stories; empty on quiet days */
  topStories: NewsItem[];
  crypto: AssetNewsGroup[];
  equities: AssetNewsGroup[];
  macro: NewsItem[];
  fetchedAt: string;
}
