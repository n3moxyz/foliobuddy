import type { ExchangeRates } from '../services/providers/CoinGeckoProvider.js';

/**
 * USD-base FX pairs we persist and serve, mapped to their ExchangeRates field.
 * Shared by the /fx route and the scheduler so a new currency is added in one place.
 */
export const USD_RATE_FIELDS = [
  { currency: 'SGD', field: 'usdSgd' },
  { currency: 'JPY', field: 'usdJpy' },
  { currency: 'TWD', field: 'usdTwd' },
  { currency: 'KRW', field: 'usdKrw' },
  { currency: 'NOK', field: 'usdNok' },
] as const;

export type UsdRateCurrency = (typeof USD_RATE_FIELDS)[number]['currency'];
export type UsdRateEntry = { currency: UsdRateCurrency; rate: number };

export function usdRateEntries(rates: ExchangeRates): UsdRateEntry[] {
  const entries: UsdRateEntry[] = [];
  for (const { currency, field } of USD_RATE_FIELDS) {
    const rate = rates[field];
    if (rate) entries.push({ currency, rate });
  }
  return entries;
}
