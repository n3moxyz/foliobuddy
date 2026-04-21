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
