import { formatNativeAmount, formatNativePrice } from '@/lib/utils';
import { MASKED_MONEY_VALUE } from '@/stores/privacyStore';

export type DisplayCurrency = 'USD' | 'SGD';
export type UsdFxRatesByCurrency = Record<string, number>;

function localNativeLabel(params: {
  usdValue: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
  valuesHidden?: boolean;
  kind: 'price' | 'amount';
}): string | null {
  const { usdValue, nativeCurrency, displayCurrency, usdFxRates, valuesHidden, kind } = params;
  if (usdValue === null || usdValue === undefined) return null;

  const native = nativeCurrency?.trim().toUpperCase();
  // Skip USD-native assets too: in SGD display mode they would otherwise render a
  // redundant "(USD …)" line that just repeats the already-shown USD value.
  if (!native || native === displayCurrency || native === 'USD') return null;

  const usdToNative = usdFxRates[native];
  if (!usdToNative || !Number.isFinite(usdToNative) || usdToNative <= 0) return null;

  if (valuesHidden) return `(${MASKED_MONEY_VALUE})`;

  const formatter = kind === 'amount' ? formatNativeAmount : formatNativePrice;
  return `(${formatter(usdValue * usdToNative, native)})`;
}

export function localPriceLabel(params: {
  usdPrice: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
  valuesHidden?: boolean;
}): string | null {
  const { usdPrice, nativeCurrency, displayCurrency, usdFxRates, valuesHidden } = params;
  return localNativeLabel({
    usdValue: usdPrice,
    nativeCurrency,
    displayCurrency,
    usdFxRates,
    valuesHidden,
    kind: 'price',
  });
}

export function localAmountLabel(params: {
  usdValue: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
  valuesHidden?: boolean;
}): string | null {
  const { usdValue, nativeCurrency, displayCurrency, usdFxRates, valuesHidden } = params;
  return localNativeLabel({
    usdValue,
    nativeCurrency,
    displayCurrency,
    usdFxRates,
    valuesHidden,
    kind: 'amount',
  });
}
