import type { Position } from './types';
import { isMarketExposureCategory } from './utils';

/**
 * Exposure: owned market-risk positions (everything but stablecoins and cash) plus perp exposure,
 * as a percentage of total value. Held-for-others positions never count.
 *
 * Returns undefined until positions, the total and the perp setting have all loaded, so screens
 * show "-" instead of a false 0.0% or a figure that leaves perps out. A loaded but empty
 * portfolio is 0.
 */
export function calculateExposurePct({
  positions,
  totalValueUsd,
  perpExposureUsd,
}: {
  positions: readonly Position[] | undefined;
  totalValueUsd: number | undefined;
  perpExposureUsd: number | undefined;
}): number | undefined {
  if (positions === undefined || totalValueUsd === undefined || perpExposureUsd === undefined) {
    return undefined;
  }
  if (totalValueUsd <= 0) return 0;

  const ownedMarketValueUsd = positions
    .filter((position) => !position.custodyOf && isMarketExposureCategory(position.asset.category))
    .reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);
  return ((ownedMarketValueUsd + perpExposureUsd) / totalValueUsd) * 100;
}
