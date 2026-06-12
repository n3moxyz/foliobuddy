import {
  AssetCategory,
  CategoryGroup,
  PriceProvider,
  categoryGroup,
  type PriceProvider as PriceProviderType,
  type AssetCategory as AssetCategoryType,
} from './constants.js';

export interface PositionValueInput {
  quantity: number;
  avgCostUsd: number;
  currentPriceUsd: number | null | undefined;
}

export interface PositionValueFields {
  marketValueUsd: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
}

export function calculatePositionValue({
  quantity,
  avgCostUsd,
  currentPriceUsd,
}: PositionValueInput): PositionValueFields {
  if (currentPriceUsd === null || currentPriceUsd === undefined) {
    return {
      marketValueUsd: null,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    };
  }

  const marketValueUsd = quantity * currentPriceUsd;
  const costBasis = quantity * avgCostUsd;
  const unrealizedPnL = marketValueUsd - costBasis;

  return {
    marketValueUsd,
    unrealizedPnL,
    unrealizedPnLPct: costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0,
  };
}

export type PositionDeltaMode = 'add' | 'reduce';

export interface PositionDeltaInput {
  currentQuantity: number;
  currentAvgCostUsd: number;
  deltaQuantity: number;
  mode: PositionDeltaMode;
  /**
   * Required for add mode. Ignored for reduce mode because reductions remove
   * cost basis at the current average cost.
   */
  deltaTotalCostUsd?: number;
}

export interface PositionDeltaResult {
  currentTotalCostUsd: number;
  deltaCostUsd: number;
  nextQuantity: number;
  nextTotalCostUsd: number;
  nextAvgCostUsd: number;
}

export function applyPositionDelta({
  currentQuantity,
  currentAvgCostUsd,
  deltaQuantity,
  mode,
  deltaTotalCostUsd,
}: PositionDeltaInput): PositionDeltaResult {
  if (!(currentQuantity >= 0) || !(currentAvgCostUsd >= 0)) {
    throw new Error('Current position values must be non-negative');
  }
  if (!(deltaQuantity > 0)) {
    throw new Error('Delta quantity must be positive');
  }
  if (mode === 'add' && !(deltaTotalCostUsd !== undefined && deltaTotalCostUsd >= 0)) {
    throw new Error('Add cost must be non-negative');
  }

  const currentTotalCostUsd = currentQuantity * currentAvgCostUsd;
  const deltaCostUsd =
    mode === 'reduce' ? deltaQuantity * currentAvgCostUsd : (deltaTotalCostUsd as number);
  const multiplier = mode === 'add' ? 1 : -1;
  const nextQuantity = currentQuantity + deltaQuantity * multiplier;
  const nextTotalCostUsd = currentTotalCostUsd + deltaCostUsd * multiplier;

  if (nextQuantity < 0) {
    throw new Error('You cannot reduce below zero quantity');
  }
  if (nextTotalCostUsd < -Number.EPSILON) {
    throw new Error('You cannot reduce more cost basis than the position has');
  }

  const normalizedTotalCostUsd = Math.max(0, nextTotalCostUsd);

  return {
    currentTotalCostUsd,
    deltaCostUsd,
    nextQuantity,
    nextTotalCostUsd: normalizedTotalCostUsd,
    nextAvgCostUsd: nextQuantity > 0 ? normalizedTotalCostUsd / nextQuantity : 0,
  };
}

export function isExternalProviderCategoryCompatible(
  provider: PriceProviderType,
  category: AssetCategoryType
): boolean {
  const group = categoryGroup(category);
  if (provider === PriceProvider.YAHOO) {
    return group === CategoryGroup.EQUITIES || group === CategoryGroup.UNIT_TRUSTS;
  }
  if (provider === PriceProvider.MANUAL) {
    return group === CategoryGroup.UNIT_TRUSTS;
  }
  return true;
}

export function externalProviderCategoryError(
  provider: PriceProviderType,
  category: AssetCategoryType
): string | null {
  if (isExternalProviderCategoryCompatible(provider, category)) return null;
  if (provider === PriceProvider.YAHOO) {
    return 'Yahoo provider only supports EQUITY and UNIT_TRUST categories';
  }
  if (provider === PriceProvider.MANUAL) {
    return 'Manual provider only supports UNIT_TRUST category';
  }
  if (!Object.values(AssetCategory).includes(category)) {
    return `Unsupported asset category ${category}`;
  }
  return null;
}
