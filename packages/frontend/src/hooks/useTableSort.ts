import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc' | null;
export type SortType = 'number' | 'string' | 'date';

export interface ColumnConfig<T> {
  accessor: (item: T) => unknown;
  type: SortType;
}

interface UseTableSortResult<T> {
  sortedItems: T[];
  sortKey: string | null;
  sortDirection: SortDirection;
  onSort: (key: string) => void;
}

export function useTableSort<T>(
  items: T[],
  columns: Record<string, ColumnConfig<T>>
): UseTableSortResult<T> {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);

  const onSort = (key: string) => {
    if (sortKey !== key) {
      // New column: start with asc
      setSortKey(key);
      setSortDirection('asc');
    } else if (sortDirection === 'asc') {
      setSortDirection('desc');
    } else {
      // Third click: clear sort (back to default)
      setSortKey(null);
      setSortDirection(null);
    }
  };

  const sortedItems = useMemo(() => {
    if (!sortKey || !sortDirection || !columns[sortKey]) {
      return items;
    }

    const config = columns[sortKey];
    const sorted = [...items].sort((a, b) => {
      const aVal = config.accessor(a);
      const bVal = config.accessor(b);

      const comparableValue = (value: unknown): number | string | null => {
        if (value === null || value === undefined || value === '') return null;
        if (config.type === 'number') {
          return typeof value === 'number' && Number.isFinite(value) ? value : null;
        }
        if (config.type === 'date') {
          const timestamp = new Date(value as string).getTime();
          return Number.isFinite(timestamp) ? timestamp : null;
        }
        return String(value);
      };

      const aComparable = comparableValue(aVal);
      const bComparable = comparableValue(bVal);
      // Missing and corrupted values always sort to the bottom.
      const aNull = aComparable === null;
      const bNull = bComparable === null;
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      const comparison =
        typeof aComparable === 'number' && typeof bComparable === 'number'
          ? aComparable - bComparable
          : String(aComparable).localeCompare(String(bComparable));

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [items, sortKey, sortDirection, columns]);

  return { sortedItems, sortKey, sortDirection, onSort };
}
