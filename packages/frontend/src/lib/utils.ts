import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AssetCategory, CategoryGroup, categoryGroup } from '@foliobuddy/shared';

export { AssetCategory, CategoryGroup, categoryGroup };

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const CURRENCY_FORMATTERS_BY_DECIMALS: Record<number, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  1: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }),
  2: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
  3: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }),
  4: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }),
  5: new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'standard',
    minimumFractionDigits: 5,
    maximumFractionDigits: 5,
  }),
};

const COMPACT_CURRENCY_FORMATTER = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

const NUMBER_FORMATTERS_BY_DECIMALS: Record<number, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  1: new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
  2: new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  3: new Intl.NumberFormat('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }),
  4: new Intl.NumberFormat('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
  5: new Intl.NumberFormat('en-US', { minimumFractionDigits: 5, maximumFractionDigits: 5 }),
};

const TRIMMED_NUMBER_FORMATTERS_BY_MAX_DECIMALS: Record<number, Intl.NumberFormat> = {
  0: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  2: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
  3: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }),
  4: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 4 }),
  8: new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 8 }),
};

const ZERO_DECIMAL_PRICE_CURRENCIES = new Set(['JPY', 'KRW']);

const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatCurrency(
  value: number | null | undefined,
  currency: 'USD' | 'SGD' = 'USD',
  compact: boolean | number = false
): string {
  if (value === null || value === undefined) return '-';

  const decimals = typeof compact === 'number' ? compact : 2;
  const useCompact = compact === true;

  const formatter = useCompact
    ? COMPACT_CURRENCY_FORMATTER
    : CURRENCY_FORMATTERS_BY_DECIMALS[decimals] || CURRENCY_FORMATTERS_BY_DECIMALS[2];

  const formatted = formatter.format(value);

  if (currency === 'SGD') {
    return formatted.replace('$', 'S$');
  }

  return formatted;
}

/** Smart decimals for prices: more decimals for smaller values */
export function priceDecimals(value: number, currency?: string): number {
  if (currency && ZERO_DECIMAL_PRICE_CURRENCIES.has(currency.toUpperCase())) return 0;
  const abs = Math.abs(value);
  if (abs < 0.01) return 5;
  if (abs < 0.1) return 4;
  if (abs < 10) return 3;
  if (abs < 1000) return 2;
  return 0;
}

/** Decimal places for a monetary amount by currency convention: 0 for zero-decimal
 *  currencies (JPY/KRW), 2 otherwise. Use for cost/total amounts, not per-unit prices. */
export function currencyDecimals(currency?: string): number {
  return currency && ZERO_DECIMAL_PRICE_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

export function formatPrice(
  value: number | null | undefined,
  currency: 'USD' | 'SGD' = 'USD'
): string {
  if (value === null || value === undefined) return '-';
  return formatCurrency(value, currency, priceDecimals(value, currency));
}

export function formatNativePrice(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value === null || value === undefined || !currency) return '-';

  const code = currency.toUpperCase();
  const decimals = priceDecimals(value, code);
  return formatNativeCurrency(value, code, decimals);
}

export function formatNativeAmount(
  value: number | null | undefined,
  currency: string | null | undefined
): string {
  if (value === null || value === undefined || !currency) return '-';

  const code = currency.toUpperCase();
  const decimals = currencyDecimals(code);
  return formatNativeCurrency(value, code, decimals);
}

function formatNativeCurrency(value: number, code: string, decimals: number): string {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      currencyDisplay: 'code',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  } catch {
    return `${code} ${formatNumber(value, decimals)}`;
  }
}

export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';

  const formatter = NUMBER_FORMATTERS_BY_DECIMALS[decimals] || NUMBER_FORMATTERS_BY_DECIMALS[2];
  return formatter.format(value);
}

export function formatTrimmedNumber(value: number | null | undefined, maxDecimals: number): string {
  if (value === null || value === undefined) return '-';

  const formatter =
    TRIMMED_NUMBER_FORMATTERS_BY_MAX_DECIMALS[maxDecimals] ||
    new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDecimals,
    });
  return formatter.format(value);
}

export function formatQuantity(value: number | null | undefined, category?: string | null): string {
  if (value === null || value === undefined) return '-';

  if (category === AssetCategory.STABLECOIN || category === AssetCategory.CASH) {
    return formatTrimmedNumber(value, 2);
  }

  if (category === AssetCategory.UNIT_TRUST) {
    return formatTrimmedNumber(value, 3);
  }

  if (category === AssetCategory.EQUITY) {
    return formatTrimmedNumber(value, 4);
  }

  if (categoryGroup(category) === CategoryGroup.CRYPTO) {
    return formatTrimmedNumber(value, 8);
  }

  return formatTrimmedNumber(value, 4);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;

  return DATE_FORMATTER.format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;

  return DATE_TIME_FORMATTER.format(d);
}

export function getPnLColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value >= 0 ? 'text-profit' : 'text-loss';
}

/** Returns true if the asset category is a stablecoin or cash equivalent */
export function isStablecoinCategory(category: string | undefined | null): boolean {
  return category === AssetCategory.STABLECOIN || category === AssetCategory.CASH;
}

/** True only for true crypto categories — excludes stables, equities, unit trusts */
export function isCryptoCategory(category: string | undefined | null): boolean {
  return categoryGroup(category) === CategoryGroup.CRYPTO;
}

/** True for market-risk assets — excludes stablecoins and cash equivalents */
export function isMarketExposureCategory(category: string | undefined | null): boolean {
  return categoryGroup(category) !== CategoryGroup.STABLES;
}

export type PriceAgeSeverity = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface PriceAgeInfo {
  days: number | null;
  label: string;
  severity: PriceAgeSeverity;
}

export function getPriceAgeInfo(priceUpdatedAt: string | null | undefined): PriceAgeInfo {
  if (!priceUpdatedAt) return { days: null, label: 'Never updated', severity: 'stale' };
  const then = new Date(priceUpdatedAt).getTime();
  if (Number.isNaN(then)) return { days: null, label: 'Unknown', severity: 'unknown' };
  const days = Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  if (days <= 0) return { days: 0, label: 'Today', severity: 'fresh' };
  if (days === 1) return { days, label: '1d ago', severity: 'fresh' };
  if (days < 7) return { days, label: `${days}d ago`, severity: 'fresh' };
  if (days < 30) return { days, label: `${days}d ago`, severity: 'aging' };
  return { days, label: `${days}d ago`, severity: 'stale' };
}

export function priceAgeClass(severity: PriceAgeSeverity): string {
  if (severity === 'fresh') return 'text-muted-foreground';
  if (severity === 'aging') return 'text-warning';
  if (severity === 'stale') return 'text-loss';
  return 'text-muted-foreground';
}
