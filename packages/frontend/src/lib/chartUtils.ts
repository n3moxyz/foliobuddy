import type { TimePeriod } from '@/lib/types';

export interface DateRange {
  from?: string;
  to?: string;
  days?: number;
  all?: boolean;
}

export function getDateRange(period: TimePeriod): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case '7D':
      return { days: 7 };
    case '1M':
      return { days: 30 };
    case '3M':
      return { days: 90 };
    case '1Y':
      return { days: 365 };
    case 'YTD': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear.toISOString(), to: today.toISOString() };
    }
    case 'Max':
      return { all: true };
    default:
      return { days: 30 };
  }
}

export function getDaysFromPeriod(period: TimePeriod): number {
  switch (period) {
    case '7D':
      return 7;
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '1Y':
      return 365;
    case 'YTD': {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    case 'Max':
      return 365;
    default:
      return 30;
  }
}

/** X-axis label format adapts to total span: short range shows "23 Jan", long range shows "Jan 2026". */
export function formatXAxisDate(timestamp: string, totalDays: number): string {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  if (totalDays <= 60) return `${day} ${month}`;
  return `${month} ${year}`;
}

export function formatTooltipDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Normalize values to percentage change from the first positive value. */
export function normalizeToPercentChange(values: number[]): number[] {
  if (values.length === 0) return [];
  const baseline = values[0];
  if (!Number.isFinite(baseline) || baseline <= 0) return values.map(() => 0);
  return values.map((value) => ((value - baseline) / baseline) * 100);
}

/**
 * Current decline from the all-time-high value as a positive percentage magnitude.
 * The last valid value is treated as the current portfolio value, so the result
 * is 0 when the portfolio sits at its all-time high.
 * Returns null until at least two valid positive portfolio values are available.
 */
export function calculateCurrentDrawdown(values: number[]): number | null {
  const validValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (validValues.length < 2) return null;

  const athValue = Math.max(...validValues);
  const currentValue = validValues[validValues.length - 1];

  return ((athValue - currentValue) / athValue) * 100;
}

/**
 * Largest decline between consecutive portfolio values as a positive percentage magnitude.
 * Returns null until at least one consecutive pair of valid positive values is available.
 */
export function calculateMaxDailyDrawdown(values: number[]): number | null {
  let previousValue: number | null = null;
  let maxDrawdown: number | null = null;

  for (const value of values) {
    if (!Number.isFinite(value) || value <= 0) {
      previousValue = null;
      continue;
    }

    if (previousValue !== null) {
      const drawdown = ((previousValue - value) / previousValue) * 100;
      maxDrawdown = Math.max(maxDrawdown ?? 0, drawdown);
    }

    previousValue = value;
  }

  return maxDrawdown;
}

/**
 * Largest-Triangle-Three-Buckets (LTTB) downsampling.
 * Reduces a data series to `threshold` points while preserving visual shape.
 * Always keeps the first and last points.
 * Returns the original array unchanged when data.length <= threshold or threshold < 3.
 */
export function downsampleLTTB<T>(
  data: T[],
  threshold: number,
  getX: (d: T) => number,
  getY: (d: T) => number
): T[] {
  if (data.length <= threshold || threshold < 3) return data;

  const sampled: T[] = [];
  // Always include the first point
  sampled.push(data[0]);

  // Number of buckets for the middle section (exclude first and last points)
  const bucketCount = threshold - 2;
  const bucketSize = (data.length - 2) / bucketCount;

  let prevSelected = 0;

  for (let i = 0; i < bucketCount; i++) {
    // Current bucket range
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1, data.length - 1);

    // Next bucket average (used as the third point of the triangle)
    const nextBucketStart = bucketEnd;
    const nextBucketEnd = Math.min(Math.floor((i + 3) * bucketSize) + 1, data.length - 1);
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += getX(data[j]);
      avgY += getY(data[j]);
      avgCount++;
    }
    // Fall back to the last point if next bucket is empty
    if (avgCount === 0) {
      avgX = getX(data[data.length - 1]);
      avgY = getY(data[data.length - 1]);
    } else {
      avgX /= avgCount;
      avgY /= avgCount;
    }

    // Pick the point in the current bucket that forms the largest triangle
    const ax = getX(data[prevSelected]);
    const ay = getY(data[prevSelected]);
    let maxArea = -1;
    let maxIndex = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const bx = getX(data[j]);
      const by = getY(data[j]);
      // Triangle area × 2 (sign doesn't matter for comparison)
      const area = Math.abs((ax - avgX) * (by - ay) - (bx - ax) * (avgY - ay));
      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    prevSelected = maxIndex;
  }

  // Always include the last point
  sampled.push(data[data.length - 1]);
  return sampled;
}
