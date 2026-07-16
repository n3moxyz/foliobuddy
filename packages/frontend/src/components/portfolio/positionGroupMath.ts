import type { Position } from '@/lib/types';

export interface PositionGroupPnL {
  pnlUsd: number | null;
  pnlPct: number | null;
}

export function calculatePositionGroupPnL(positions: Position[]): PositionGroupPnL {
  let pnlUsd = 0;
  let costBasisUsd = 0;
  let knownPositionCount = 0;

  positions.forEach((position) => {
    if (position.unrealizedPnL === null || position.unrealizedPnL === undefined) return;

    knownPositionCount += 1;
    pnlUsd += position.unrealizedPnL;
    costBasisUsd += position.quantity * position.avgCostUsd;
  });

  if (knownPositionCount === 0) {
    return { pnlUsd: null, pnlPct: null };
  }

  return {
    pnlUsd,
    pnlPct: costBasisUsd > 0 ? (pnlUsd / costBasisUsd) * 100 : 0,
  };
}
