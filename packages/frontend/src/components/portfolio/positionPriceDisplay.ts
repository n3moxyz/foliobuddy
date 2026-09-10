import { formatNativeAmount, formatNativePrice } from '@/lib/utils';
import { MASKED_MONEY_VALUE } from '@/stores/privacyStore';
import type { Asset } from '@/lib/types';

export function displayedAssetPrice(asset: Asset, currency: DisplayCurrency, usdSgd: number) {
  if (
    asset.category === 'UNIT_TRUST' &&
    asset.nativeCurrency === currency &&
    asset.currentPriceNative != null
  ) {
    return asset.currentPriceNative;
  }
  return asset.currentPriceUsd == null
    ? null
    : asset.currentPriceUsd * (currency === 'SGD' ? usdSgd : 1);
}

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
  nativePrice?: number | null;
}): string | null {
  const { usdPrice, nativeCurrency, displayCurrency, usdFxRates, valuesHidden } = params;
  if (params.nativePrice != null && nativeCurrency && nativeCurrency !== displayCurrency) {
    if (valuesHidden) return `(${MASKED_MONEY_VALUE})`;
    return `(${nativeCurrency} ${params.nativePrice.toFixed(4)})`;
  }
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
