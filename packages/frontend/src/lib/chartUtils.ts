import type { TimePeriod } from '@/lib/types';

export interface DateRange {
  from?: string;
  to?: string;
  days?: number;
}

export function getDateRange(period: TimePeriod): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case '7D':
      return { days: 7 };
    case '1M':
      return { days: 30 };
    case '3M':
      return { days: 90 };
    case '1Y':
      return { days: 365 };
    case 'YTD': {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return { from: startOfYear.toISOString(), to: today.toISOString() };
    }
    case 'Max':
      return {};
    default:
      return { days: 30 };
  }
}

export function getDaysFromPeriod(period: TimePeriod): number {
  switch (period) {
    case '7D':
      return 7;
    case '1M':
      return 30;
    case '3M':
      return 90;
    case '1Y':
      return 365;
    case 'YTD': {
      const now = new Date();
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      return Math.ceil((now.getTime() - startOfYear.getTime()) / (1000 * 60 * 60 * 24));
    }
    case 'Max':
      return 365;
    default:
      return 30;
  }
}

/** X-axis label format adapts to total span: short range shows "23 Jan", long range shows "Jan 2026". */
export function formatXAxisDate(timestamp: string, totalDays: number): string {
  const date = new Date(timestamp);
  const day = date.getDate();
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  const year = date.getFullYear();

  if (totalDays <= 60) return `${day} ${month}`;
  return `${month} ${year}`;
}

export function formatTooltipDate(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
