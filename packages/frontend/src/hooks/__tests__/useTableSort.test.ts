import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTableSort, type ColumnConfig } from '../useTableSort';

type Row = { id: string; value: number | null; date: string | null };

const rows: Row[] = [
  { id: 'two', value: 2, date: '2026-02-01' },
  { id: 'nan', value: Number.NaN, date: 'not-a-date' },
  { id: 'missing', value: null, date: null },
  { id: 'one', value: 1, date: '2026-01-01' },
];
const columns: Record<string, ColumnConfig<Row>> = {
  value: { accessor: (row) => row.value, type: 'number' },
  date: { accessor: (row) => row.date, type: 'date' },
};

describe('useTableSort', () => {
  it('cycles ascending, descending, and original order without mutating input', () => {
    const { result } = renderHook(() => useTableSort(rows, columns));
    const original = [...rows];

    act(() => result.current.onSort('value'));
    expect(result.current.sortedItems.map((row) => row.id)).toEqual([
      'one',
      'two',
      'nan',
      'missing',
    ]);
    act(() => result.current.onSort('value'));
    expect(result.current.sortedItems.map((row) => row.id)).toEqual([
      'two',
      'one',
      'nan',
      'missing',
    ]);
    act(() => result.current.onSort('value'));
    expect(result.current.sortedItems).toBe(rows);
    expect(rows).toEqual(original);
  });

  it('puts invalid dates at the bottom rather than returning a NaN comparator', () => {
    const { result } = renderHook(() => useTableSort(rows, columns));
    act(() => result.current.onSort('date'));

    expect(result.current.sortedItems.map((row) => row.id)).toEqual([
      'one',
      'two',
      'nan',
      'missing',
    ]);
  });
});
