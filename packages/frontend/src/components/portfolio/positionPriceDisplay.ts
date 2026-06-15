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
  if (!native || native === displayCurrency) return null;

  const usdToNative = native === 'USD' ? 1 : usdFxRates[native];
  if (!usdToNative || !Number.isFinite(usdToNative) || usdToNative <= 0) return null;

  return `(${formatNativePrice(usdPrice * usdToNative, native)})`;
}
