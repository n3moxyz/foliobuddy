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

      // Nulls always sort to bottom
      const aNull = aVal === null || aVal === undefined || aVal === '';
      const bNull = bVal === null || bVal === undefined || bVal === '';
      if (aNull && bNull) return 0;
      if (aNull) return 1;
      if (bNull) return -1;

      let comparison = 0;
      if (config.type === 'number') {
        comparison = (aVal as number) - (bVal as number);
      } else if (config.type === 'date') {
        comparison = new Date(aVal as string).getTime() - new Date(bVal as string).getTime();
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }

      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return sorted;
  }, [items, sortKey, sortDirection, columns]);

  return { sortedItems, sortKey, sortDirection, onSort };
}
