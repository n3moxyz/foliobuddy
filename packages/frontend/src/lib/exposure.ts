import type { Position } from './types';
import { isMarketExposureCategory } from './utils';

/**
 * Exposure: owned market-risk positions (everything but stablecoins and cash) plus perp exposure,
 * as a percentage of total value. Held-for-others positions never count.
 *
 * Returns undefined until positions, the total and the perp setting have all loaded, so screens
 * show "-" instead of a false 0.0% or a figure that leaves perps out. It also stays undefined when
 * something is exposed but the total is zero (perps with nothing owned): there is no share to
 * show, and 0.0% would call that account safe. A loaded portfolio with nothing exposed is 0.
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

  const ownedMarketValueUsd = positions
    .filter((position) => !position.custodyOf && isMarketExposureCategory(position.asset.category))
    .reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);
  const exposedUsd = ownedMarketValueUsd + perpExposureUsd;
  if (totalValueUsd <= 0) return exposedUsd === 0 ? 0 : undefined;
  return (exposedUsd / totalValueUsd) * 100;
}
