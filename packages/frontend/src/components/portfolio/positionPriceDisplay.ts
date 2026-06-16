import { formatNativePrice } from '@/lib/utils';

export type DisplayCurrency = 'USD' | 'SGD';
export type UsdFxRatesByCurrency = Record<string, number>;

export function localPriceLabel(params: {
  usdPrice: number | null | undefined;
  nativeCurrency: string | null | undefined;
  displayCurrency: DisplayCurrency;
  usdFxRates: UsdFxRatesByCurrency;
}): string | null {
  const { usdPrice, nativeCurrency, displayCurrency, usdFxRates } = params;
  if (usdPrice === null || usdPrice === undefined) return null;

  const native = nativeCurrency?.trim().toUpperCase();
  // Skip USD-native assets too: in SGD display mode they would otherwise render a
  // redundant "(USD …)" line that just repeats the already-shown USD price.
  if (!native || native === displayCurrency || native === 'USD') return null;

  const usdToNative = usdFxRates[native];
  if (!usdToNative || !Number.isFinite(usdToNative) || usdToNative <= 0) return null;

  return `(${formatNativePrice(usdPrice * usdToNative, native)})`;
}
