import { applyPositionDelta, type PositionDeltaMode } from '@foliobuddy/shared';

export type CostInputMode = 'total' | 'avg';
export type CostCurrency = 'USD' | 'SGD' | 'JPY' | 'TWD' | 'KRW';
export type CostFxRatesByCurrency = Record<string, number>;

const SUPPORTED_COST_CURRENCIES: CostCurrency[] = ['USD', 'SGD', 'JPY', 'TWD', 'KRW'];
const SUPPORTED_COST_CURRENCY_SET = new Set<string>(SUPPORTED_COST_CURRENCIES);

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

export function normalizeCostCurrency(value: string | null | undefined): CostCurrency {
  const currency = value?.trim().toUpperCase();
  return currency && SUPPORTED_COST_CURRENCY_SET.has(currency) ? (currency as CostCurrency) : 'USD';
}

export function costCurrencyDisplayRate(
  currency: CostCurrency,
  usdFxRates: CostFxRatesByCurrency
): number | null {
  if (currency === 'USD') return 1;
  const rate = usdFxRates[currency];
  return Number.isFinite(rate) && rate > 0 ? rate : null;
}

export function usdPerCostCurrency(
  currency: CostCurrency,
  usdFxRates: CostFxRatesByCurrency
): number | null {
  const displayRate = costCurrencyDisplayRate(currency, usdFxRates);
  return displayRate === null ? null : 1 / displayRate;
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

export function toUsdCost(
  amount: number,
  currency: CostCurrency,
  usdFxRates: CostFxRatesByCurrency
): number {
  const displayRate = costCurrencyDisplayRate(currency, usdFxRates);
  return displayRate === null ? Number.NaN : amount / displayRate;
}

export function buildPositionDeltaPreview(params: {
  currentQuantity: number;
  currentAvgCostUsd: number;
  deltaQuantity: string;
  deltaTotalCostInput: string;
  mode: PositionDeltaMode;
  costCurrency: CostCurrency;
  usdFxRates: CostFxRatesByCurrency;
}): DeltaPreview | null {
  const deltaQuantity = parseNumber(params.deltaQuantity);
  const rawDeltaCost = parseNumber(params.deltaTotalCostInput);
  const displayRate = costCurrencyDisplayRate(params.costCurrency, params.usdFxRates);
  if (displayRate === null) return null;

  const deltaTotalCostUsd =
    params.mode === 'reduce'
      ? undefined
      : toUsdCost(rawDeltaCost, params.costCurrency, params.usdFxRates);

  try {
    const result = applyPositionDelta({
      currentQuantity: params.currentQuantity,
      currentAvgCostUsd: params.currentAvgCostUsd,
      deltaQuantity,
      mode: params.mode,
      deltaTotalCostUsd,
    });

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
