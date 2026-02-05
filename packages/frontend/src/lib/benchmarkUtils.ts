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
 * Merge additional benchmark data into the normalized data
 * Aligns timestamps to the nearest portfolio snapshot
 */
export function mergeAdditionalBenchmark(
  normalizedData: NormalizedDataPoint[],
  benchmarkData: BenchmarkHistoricalData,
  benchmarkId: string
): NormalizedDataPoint[] {
  if (normalizedData.length === 0 || benchmarkData.data.length === 0) {
    return normalizedData;
  }

  // Get first price for normalization
  const firstPrice = benchmarkData.data[0].price;
  if (firstPrice === 0) return normalizedData;

  // Create a map of benchmark prices by timestamp
  const priceMap = new Map<number, number>();
  benchmarkData.data.forEach(point => {
    priceMap.set(point.timestamp, point.price);
  });

  // Find the benchmark price closest to each portfolio timestamp
  return normalizedData.map(point => {
    const targetTime = point.date.getTime();

    // Find closest benchmark price
    let closestPrice: number | undefined;
    let minDiff = Infinity;

    for (const [ts, price] of priceMap.entries()) {
      const diff = Math.abs(ts - targetTime);
      if (diff < minDiff) {
        minDiff = diff;
        closestPrice = price;
      }
    }

    // Only include if we found a price within 24 hours
    const percentChange = closestPrice !== undefined && minDiff < 24 * 60 * 60 * 1000
      ? ((closestPrice - firstPrice) / firstPrice) * 100
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
