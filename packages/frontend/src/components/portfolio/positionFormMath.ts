import { applyPositionDelta, type PositionDeltaMode } from '@foliobuddy/shared';

export type CostInputMode = 'total' | 'avg';
export type CostCurrency = 'USD' | 'SGD';

export interface DeltaPreview {
  currentQuantity: number;
  currentAvgCost: number;
  currentTotalCost: number;
  nextQuantity: number;
  nextAvgCost: number;
  nextTotalCost: number;
}

function parseNumber(value: string): number {
  return parseFloat(value);
}

export function calculateAverageCostInput(
  mode: CostInputMode,
  quantity: string,
  totalCost: string,
  avgCost: string
): string {
  if (mode === 'avg') return avgCost;

  const qty = parseNumber(quantity);
  const total = parseNumber(totalCost);
  if (qty > 0 && total > 0) {
    return (total / qty).toFixed(2);
  }
  return '';
}

export function calculateTotalCostInput(
  mode: CostInputMode,
  quantity: string,
  avgCost: string,
  totalCost: string
): string {
  if (mode === 'total') return totalCost;

  const qty = parseNumber(quantity);
  const avg = parseNumber(avgCost);
  if (qty > 0 && avg > 0) {
    return (qty * avg).toFixed(2);
  }
  return '';
}

export function calculateNonNegativeAverageCostInput(
  mode: CostInputMode,
  quantity: string,
  totalCost: string,
  avgCost: string
): string {
  if (mode === 'avg') return avgCost;

  const qty = parseNumber(quantity);
  const total = parseNumber(totalCost);
  if (qty > 0 && Number.isFinite(total) && total >= 0) {
    return (total / qty).toFixed(2);
  }
  return '';
}

export function calculateNonNegativeTotalCostInput(
  mode: CostInputMode,
  quantity: string,
  avgCost: string,
  totalCost: string
): string {
  if (mode === 'total') return totalCost;

  const qty = parseNumber(quantity);
  const avg = parseNumber(avgCost);
  if (qty > 0 && Number.isFinite(avg) && avg >= 0) {
    return (qty * avg).toFixed(2);
  }
  return '';
}

export function toUsdCost(amount: number, currency: CostCurrency, fxSgdPerUsd: number): number {
  return currency === 'SGD' ? amount / fxSgdPerUsd : amount;
}

export function buildPositionDeltaPreview(params: {
  currentQuantity: number;
  currentAvgCostUsd: number;
  deltaQuantity: string;
  deltaTotalCostInput: string;
  mode: PositionDeltaMode;
  costCurrency: CostCurrency;
  fxSgdPerUsd: number;
}): DeltaPreview | null {
  const deltaQuantity = parseNumber(params.deltaQuantity);
  const rawDeltaCost = parseNumber(params.deltaTotalCostInput);
  const deltaTotalCostUsd =
    params.mode === 'reduce'
      ? undefined
      : toUsdCost(rawDeltaCost, params.costCurrency, params.fxSgdPerUsd);

  try {
    const result = applyPositionDelta({
      currentQuantity: params.currentQuantity,
      currentAvgCostUsd: params.currentAvgCostUsd,
      deltaQuantity,
      mode: params.mode,
      deltaTotalCostUsd,
    });
    const displayRate = params.costCurrency === 'SGD' ? params.fxSgdPerUsd : 1;

    return {
      currentQuantity: params.currentQuantity,
      currentAvgCost: params.currentAvgCostUsd * displayRate,
      currentTotalCost: result.currentTotalCostUsd * displayRate,
      nextQuantity: result.nextQuantity,
      nextAvgCost: result.nextAvgCostUsd * displayRate,
      nextTotalCost: result.nextTotalCostUsd * displayRate,
    };
  } catch {
    return null;
  }
}
