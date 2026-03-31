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

  // Handle compact = number (for decimals) or boolean
  const decimals = typeof compact === 'number' ? compact : 2;
  const useCompact = compact === true;

  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD', // Always use USD formatting
    notation: useCompact ? 'compact' : 'standard',
    minimumFractionDigits: useCompact ? 0 : decimals,
    maximumFractionDigits: useCompact ? 1 : decimals,
  });

  const formatted = formatter.format(value);

  // For SGD, replace $ with S$
  if (currency === 'SGD') {
    return formatted.replace('$', 'S$');
  }

  return formatted;
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

export function formatCompactNumber(value: number): string {
  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });

  return formatter.format(value);
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

export function getPnLBgClass(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return value >= 0 ? 'bg-profit' : 'bg-loss';
}
