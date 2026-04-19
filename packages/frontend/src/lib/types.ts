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
