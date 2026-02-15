import type { PerformancePoint, BenchmarkHistoricalData } from './api';

export interface NormalizedDataPoint {
  timestamp: string;
  date: Date;
  portfolio?: number;
  btc?: number;
  eth?: number;
  [key: string]: number | string | Date | undefined;
}

export interface BenchmarkConfig {
  id: string;
  coingeckoId: string;
  symbol: string;
  color: string;
  enabled: boolean;
}

export const DEFAULT_BENCHMARKS: BenchmarkConfig[] = [
  { id: 'btc', coingeckoId: 'bitcoin', symbol: 'BTC', color: '#F7931A', enabled: true },
  { id: 'eth', coingeckoId: 'ethereum', symbol: 'ETH', color: '#627EEA', enabled: true },
];

export const ADDITIONAL_COLORS = ['#14B8A6', '#EF4444', '#8B5CF6', '#F59E0B'];

/**
 * Normalize a series of values to percentage change from the first value
 */
export function normalizeToPercentChange(values: number[]): number[] {
  if (values.length === 0) return [];
  const firstValue = values[0];
  if (firstValue === 0) return values.map(() => 0);
  return values.map(v => ((v - firstValue) / firstValue) * 100);
}

/**
 * Convert performance history to normalized % change data
 * Only handles portfolio data - BTC/ETH are fetched separately from CoinGecko API
 */
export function normalizePerformanceHistory(
  performanceData: PerformancePoint[]
): NormalizedDataPoint[] {
  if (performanceData.length === 0) return [];

  const portfolioValues = performanceData.map(p => p.totalValueUsd);
  const portfolioNorm = normalizeToPercentChange(portfolioValues);

  return performanceData.map((point, i) => ({
    timestamp: point.timestamp,
    date: new Date(point.timestamp),
    portfolio: portfolioNorm[i],
  }));
}

/**
 * Binary search for the closest timestamp in sorted data.
 * Returns the price and time difference of the closest match.
 */
function findClosestPrice(
  sortedData: Array<{ timestamp: number; price: number }>,
  targetTime: number
): { price: number; diff: number } | undefined {
  if (sortedData.length === 0) return undefined;

  let lo = 0;
  let hi = sortedData.length - 1;

  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (sortedData[mid].timestamp < targetTime) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  // Compare lo and lo-1 to find the actual closest
  let bestIdx = lo;
  if (lo > 0) {
    const diffLo = Math.abs(sortedData[lo].timestamp - targetTime);
    const diffPrev = Math.abs(sortedData[lo - 1].timestamp - targetTime);
    if (diffPrev < diffLo) bestIdx = lo - 1;
  }

  return {
    price: sortedData[bestIdx].price,
    diff: Math.abs(sortedData[bestIdx].timestamp - targetTime),
  };
}

/**
 * Merge additional benchmark data into the normalized data
 * Aligns timestamps to the nearest portfolio snapshot using binary search.
 * Normalizes from the benchmark price at the FIRST portfolio timestamp
 * so both lines start near 0% from the same reference point.
 */
export function mergeAdditionalBenchmark(
  normalizedData: NormalizedDataPoint[],
  benchmarkData: BenchmarkHistoricalData,
  benchmarkId: string
): NormalizedDataPoint[] {
  if (normalizedData.length === 0 || benchmarkData.data.length === 0) {
    return normalizedData;
  }

  // Sort by timestamp for binary search
  const sortedData = benchmarkData.data.slice().sort((a, b) => a.timestamp - b.timestamp);

  // Use the benchmark price closest to the FIRST portfolio timestamp as baseline.
  // This ensures both portfolio and benchmark start near 0% at the same point.
  const firstPortfolioTime = normalizedData[0].date.getTime();
  const baselineResult = findClosestPrice(sortedData, firstPortfolioTime);
  if (!baselineResult || baselineResult.price === 0) return normalizedData;
  const firstPrice = baselineResult.price;

  // Dynamic threshold: 3x the average data spacing, minimum 48 hours
  const avgSpacing = sortedData.length > 1
    ? (sortedData[sortedData.length - 1].timestamp - sortedData[0].timestamp) / (sortedData.length - 1)
    : 24 * 60 * 60 * 1000;
  const threshold = Math.max(avgSpacing * 3, 48 * 60 * 60 * 1000);

  return normalizedData.map(point => {
    const targetTime = point.date.getTime();
    const result = findClosestPrice(sortedData, targetTime);

    const percentChange = result && result.diff < threshold
      ? ((result.price - firstPrice) / firstPrice) * 100
      : undefined;

    return {
      ...point,
      [benchmarkId]: percentChange,
    };
  });
}

/**
 * Get the current % change for a benchmark (last data point)
 */
export function getCurrentChange(
  normalizedData: NormalizedDataPoint[],
  benchmarkId: string
): number | undefined {
  if (normalizedData.length === 0) return undefined;
  const lastPoint = normalizedData[normalizedData.length - 1];
  const value = lastPoint[benchmarkId];
  return typeof value === 'number' ? value : undefined;
}
