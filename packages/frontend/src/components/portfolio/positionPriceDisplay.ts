import { formatNativeAmount, formatNativePrice } from '@/lib/utils';

export type DisplayCurrency = 'USD' | 'SGD';
export type UsdFxRatesByCurrency = Record<string, number>;

function localNativeLabel(params: {
  usdValue: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
  kind: 'price' | 'amount';
}): string | null {
  const { usdValue, nativeCurrency, displayCurrency, usdFxRates, kind } = params;
  if (usdValue === null || usdValue === undefined) return null;

  const native = nativeCurrency?.trim().toUpperCase();
  // Skip USD-native assets too: in SGD display mode they would otherwise render a
  // redundant "(USD …)" line that just repeats the already-shown USD value.
  if (!native || native === displayCurrency || native === 'USD') return null;

  const usdToNative = usdFxRates[native];
  if (!usdToNative || !Number.isFinite(usdToNative) || usdToNative <= 0) return null;

  const formatter = kind === 'amount' ? formatNativeAmount : formatNativePrice;
  return `(${formatter(usdValue * usdToNative, native)})`;
}

export function localPriceLabel(params: {
  usdPrice: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
}): string | null {
  const { usdPrice, nativeCurrency, displayCurrency, usdFxRates } = params;
  return localNativeLabel({
    usdValue: usdPrice,
    nativeCurrency,
    displayCurrency,
    usdFxRates,
    kind: 'price',
  });
}

export function localAmountLabel(params: {
  usdValue: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
}): string | null {
  const { usdValue, nativeCurrency, displayCurrency, usdFxRates } = params;
  return localNativeLabel({
    usdValue,
    nativeCurrency,
    displayCurrency,
    usdFxRates,
    kind: 'amount',
  });
}
