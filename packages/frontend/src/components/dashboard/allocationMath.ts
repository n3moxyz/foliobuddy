// Pure allocation math for the dashboard donuts, kept out of AllocationCharts.tsx
// so the component file stays Fast Refresh-safe and this stays unit-testable.

export type CategoryBucket = 'Crypto' | 'Equities' | 'Cash';

export const PERPS_SLICE = 'Perps';

const CATEGORY_BUCKETS: readonly string[] = ['Crypto', 'Equities', 'Cash'];

/** True for slice names that have a detail-chart breakdown to drill into (Perps does not). */
export function isCategoryBucket(name: string): name is CategoryBucket {
  return CATEGORY_BUCKETS.includes(name);
}

/**
 * The detail chart's "Auto" mode follows the largest drillable bucket. Cash is
 * skipped (it has its own dedicated Cash Breakdown donut) and non-bucket slices
 * like Perps are skipped too — resolving to one would break the detail lookup.
 * Falls back to Equities when nothing else qualifies.
 */
export function resolveDominantBucket(sliceNamesByValueDesc: string[]): CategoryBucket {
  return (
    sliceNamesByValueDesc.find(
      (name): name is CategoryBucket => isCategoryBucket(name) && name !== 'Cash'
    ) ?? 'Equities'
  );
}

/**
 * Carves perp exposure out of the Cash bucket into its own slice. Perp margin sits
 * in cash positions but is deployed market exposure, not dry powder. The perp slice
 * is clamped to available cash so a leveraged perp book can't push the donut's
 * slices past the portfolio total — the chart allocates net worth, not leverage.
 */
export function splitCashAndPerps(
  cashValue: number,
  perpExposure: number
): { cash: number; perps: number } {
  const safeCash = Number.isFinite(cashValue) && cashValue > 0 ? cashValue : 0;
  const safePerp = Number.isFinite(perpExposure) && perpExposure > 0 ? perpExposure : 0;
  const perps = Math.min(safePerp, safeCash);
  return { cash: safeCash - perps, perps };
}
