import { useCallback } from 'react';
import {
  formatCurrency as formatCurrencyValue,
  formatPrice as formatPriceValue,
} from '@/lib/utils';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';

export function useMoneyFormatter() {
  const valuesHidden = usePrivacyStore((state) => state.valuesHidden);

  const maskMoney = useCallback(
    (formattedValue: string) => (valuesHidden ? MASKED_MONEY_VALUE : formattedValue),
    [valuesHidden]
  );

  const formatCurrency = useCallback(
    (...args: Parameters<typeof formatCurrencyValue>) => maskMoney(formatCurrencyValue(...args)),
    [maskMoney]
  );

  const formatPrice = useCallback(
    (...args: Parameters<typeof formatPriceValue>) => maskMoney(formatPriceValue(...args)),
    [maskMoney]
  );

  const formatSignedCurrency = useCallback(
    (
      value: number | null | undefined,
      currency: 'USD' | 'SGD' = 'USD',
      decimals: number | boolean = 0
    ) => {
      if (valuesHidden) return MASKED_MONEY_VALUE;
      const sign = value != null && value > 0 ? '+' : '';
      return `${sign}${formatCurrencyValue(value, currency, decimals)}`;
    },
    [valuesHidden]
  );

  return { valuesHidden, maskMoney, formatCurrency, formatPrice, formatSignedCurrency };
}
