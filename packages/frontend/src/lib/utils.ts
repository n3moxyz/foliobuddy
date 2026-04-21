import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(
  value: number | null | undefined,
  currency: 'USD' | 'SGD' = 'USD',
  compact: boolean | number = false
): string {
  if (value === null || value === undefined) return '-';

  const decimals = typeof compact === 'number' ? compact : 2;
  const useCompact = compact === true;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: useCompact ? 'compact' : 'standard',
    minimumFractionDigits: useCompact ? 0 : decimals,
    maximumFractionDigits: useCompact ? 1 : decimals,
  });

  const formatted = formatter.format(value);

  if (currency === 'SGD') {
    return formatted.replace('$', 'S$');
  }

  return formatted;
}

/** Smart decimals for prices: more decimals for smaller values */
export function formatPrice(
  value: number | null | undefined,
  currency: 'USD' | 'SGD' = 'USD'
): string {
  if (value === null || value === undefined) return '-';
  const abs = Math.abs(value);
  let decimals: number;
  if (abs < 0.01) decimals = 5;
  else if (abs < 0.1) decimals = 4;
  else if (abs < 10) decimals = 3;
  else if (abs < 1000) decimals = 2;
  else decimals = 0;
  return formatCurrency(value, currency, decimals);
}

export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined) return '-';

  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';

  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return '-';

  const d = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function getPnLColorClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value >= 0 ? 'text-profit' : 'text-loss';
}

/** Returns true if the asset category is a stablecoin or cash equivalent */
export function isStablecoinCategory(category: string | undefined | null): boolean {
  return category === 'STABLECOIN' || category === 'CASH';
}

/** Category groups — keep in sync with backend `categoryGroup()` in constants.ts */
export type CategoryGroup = 'crypto' | 'stables' | 'equities' | 'unit_trusts';

export function categoryGroup(category: string | undefined | null): CategoryGroup {
  if (category === 'STABLECOIN' || category === 'CASH') return 'stables';
  if (category === 'EQUITY') return 'equities';
  if (category === 'UNIT_TRUST') return 'unit_trusts';
  return 'crypto';
}

/** True only for true crypto categories — excludes stables, equities, unit trusts */
export function isCryptoCategory(category: string | undefined | null): boolean {
  return categoryGroup(category) === 'crypto';
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
  if (severity === 'aging') return 'text-amber-500';
  if (severity === 'stale') return 'text-loss';
  return 'text-muted-foreground';
}
