import { applyPositionDelta, type PositionDeltaMode } from '@foliobuddy/shared';

export type CostInputMode = 'total' | 'avg';
export type CostCurrency = 'USD' | 'SGD' | 'JPY' | 'TWD' | 'KRW' | 'NOK';
export type CostFxRatesByCurrency = Record<string, number>;

const SUPPORTED_COST_CURRENCIES: CostCurrency[] = ['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK'];
const SUPPORTED_COST_CURRENCY_SET = new Set<string>(SUPPORTED_COST_CURRENCIES);
const YAHOO_SUFFIX_COST_CURRENCIES: Array<[suffix: string, currency: CostCurrency]> = [
  ['.SI', 'SGD'],
  ['.T', 'JPY'],
  ['.TW', 'TWD'],
  ['.TWO', 'TWD'],
  ['.KS', 'KRW'],
  ['.KQ', 'KRW'],
  ['.OL', 'NOK'],
];

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

// Keep at least two decimals for input presentation, without rounding native
// weighted averages to two decimals before persistence.
function calculatedInput(value: number): string {
  const precise = Number(value.toPrecision(15)).toString();
  if (precise.includes('e')) return precise;
  const [integer, fraction = ''] = precise.split('.');
  return `${integer}.${fraction.padEnd(2, '0')}`;
}

export function normalizeCostCurrency(value: string | null | undefined): CostCurrency {
  const currency = value?.trim().toUpperCase();
  return currency && SUPPORTED_COST_CURRENCY_SET.has(currency) ? (currency as CostCurrency) : 'USD';
}

function inferCurrencyFromYahooSymbol(value: string | null | undefined): CostCurrency | null {
  const symbol = value?.trim().toUpperCase();
  if (!symbol) return null;
  const match = YAHOO_SUFFIX_COST_CURRENCIES.find(([suffix]) => symbol.endsWith(suffix));
  return match?.[1] ?? null;
}

export function inferListedEquityCostCurrency(params: {
  nativeCurrency: string | null | undefined;
  symbol: string | null | undefined;
  providerAssetId: string | null | undefined;
}): CostCurrency {
  const nativeCurrency = normalizeCostCurrency(params.nativeCurrency);
  const inferred =
    inferCurrencyFromYahooSymbol(params.providerAssetId) ??
    inferCurrencyFromYahooSymbol(params.symbol);

  if (nativeCurrency === 'USD' && inferred) return inferred;
  return nativeCurrency;
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
    return calculatedInput(total / qty);
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
    return calculatedInput(qty * avg);
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
    return calculatedInput(total / qty);
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
    return calculatedInput(qty * avg);
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
  currentAvgCostNative?: number | null;
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

  try {
    const result = applyPositionDelta({
      currentQuantity: params.currentQuantity,
      currentAvgCostUsd: params.currentAvgCostNative ?? params.currentAvgCostUsd * displayRate,
      deltaQuantity,
      mode: params.mode,
      deltaTotalCostUsd: params.mode === 'add' ? rawDeltaCost : undefined,
    });

    return {
      currentQuantity: params.currentQuantity,
      currentAvgCost: params.currentAvgCostNative ?? params.currentAvgCostUsd * displayRate,
      currentTotalCost: result.currentTotalCostUsd,
      nextQuantity: result.nextQuantity,
      nextAvgCost: result.nextAvgCostUsd,
      nextTotalCost: result.nextTotalCostUsd,
    };
  } catch {
    return null;
  }
}
