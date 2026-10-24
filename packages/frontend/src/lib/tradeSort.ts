import type { Trade } from '@/lib/types';

export const TRADE_SORT_OPTIONS = [
  {
    value: 'entryDate-desc',
    label: 'Entry date: newest first',
    key: 'entryDate',
    direction: 'desc',
  },
  { value: 'entryDate-asc', label: 'Entry date: oldest first', key: 'entryDate', direction: 'asc' },
  { value: 'exitDate-desc', label: 'Exit date: newest first', key: 'exitDate', direction: 'desc' },
  { value: 'exitDate-asc', label: 'Exit date: oldest first', key: 'exitDate', direction: 'asc' },
  {
    value: 'createdAt-desc',
    label: 'Date logged: newest first',
    key: 'createdAt',
    direction: 'desc',
  },
  {
    value: 'createdAt-asc',
    label: 'Date logged: oldest first',
    key: 'createdAt',
    direction: 'asc',
  },
] as const;

export type TradeSortOrder = (typeof TRADE_SORT_OPTIONS)[number]['value'];
export const DEFAULT_TRADE_SORT: TradeSortOrder = 'entryDate-desc';

export function isTradeSortOrder(value: unknown): value is TradeSortOrder {
  return TRADE_SORT_OPTIONS.some((option) => option.value === value);
}

export function tradeSortOption(order: TradeSortOrder) {
  return TRADE_SORT_OPTIONS.find((option) => option.value === order) ?? TRADE_SORT_OPTIONS[0];
}

function timestamp(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Sort the full timestamp. Trades without a usable date stay last in either direction. */
export function sortTradesByDefault(trades: Trade[], order: TradeSortOrder): Trade[] {
  const { key, direction } = tradeSortOption(order);
  return [...trades].sort((a, b) => {
    const aTime = timestamp(a[key]);
    const bTime = timestamp(b[key]);
    if (aTime === null && bTime !== null) return 1;
    if (bTime === null && aTime !== null) return -1;
    if (aTime !== null && bTime !== null && aTime !== bTime) {
      return direction === 'desc' ? bTime - aTime : aTime - bTime;
    }
    return a.id.localeCompare(b.id);
  });
}
