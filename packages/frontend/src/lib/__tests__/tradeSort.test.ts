import { describe, expect, it } from 'vitest';
import { isTradeSortOrder, sortTradesByDefault } from '../tradeSort';
import type { Trade } from '@/lib/types';

const rows = [
  {
    id: 'early-entry',
    entryDate: '2026-10-04T03:00:00+08:00',
    exitDate: '2026-10-24T23:00:00+08:00',
    createdAt: '2026-10-25T01:00:00+08:00',
  },
  {
    id: 'late-entry',
    entryDate: '2026-10-04T16:00:00+08:00',
    exitDate: '2026-10-08T19:00:00+08:00',
    createdAt: '2026-10-24T01:00:00+08:00',
  },
] as Trade[];

describe('default trade order', () => {
  it('uses the full opening timestamp, rather than closing or import order', () => {
    expect(sortTradesByDefault(rows, 'entryDate-desc').map((row) => row.id)).toEqual([
      'late-entry',
      'early-entry',
    ]);
    expect(sortTradesByDefault(rows, 'entryDate-asc').map((row) => row.id)).toEqual([
      'early-entry',
      'late-entry',
    ]);
    expect(rows.map((row) => row.id)).toEqual(['early-entry', 'late-entry']);
  });

  it('can order by closing date or date logged independently', () => {
    for (const order of ['exitDate-desc', 'createdAt-desc'] as const) {
      expect(sortTradesByDefault(rows, order).map((row) => row.id)).toEqual([
        'early-entry',
        'late-entry',
      ]);
    }
    for (const order of ['exitDate-asc', 'createdAt-asc'] as const) {
      expect(sortTradesByDefault(rows, order).map((row) => row.id)).toEqual([
        'late-entry',
        'early-entry',
      ]);
    }
  });

  it.each(['exitDate-desc', 'exitDate-asc'] as const)(
    'puts open and invalid dates last for %s',
    (order) => {
      const mixed = [
        { ...rows[0], id: 'open', exitDate: null },
        ...rows,
        { ...rows[0], id: 'invalid', exitDate: 'not-a-date' },
      ];
      const sorted = sortTradesByDefault(mixed, order);
      expect(
        sorted
          .slice(-2)
          .map((row) => row.id)
          .sort()
      ).toEqual(['invalid', 'open']);
    }
  );

  it('keeps legacy records without a logged timestamp last and breaks ties consistently', () => {
    const mixed = [{ ...rows[0], id: 'legacy', createdAt: undefined }, rows[1], rows[0]];
    expect(sortTradesByDefault(mixed, 'createdAt-desc').at(-1)?.id).toBe('legacy');
    const tied = [
      { ...rows[0], id: 'b' },
      { ...rows[0], id: 'a' },
    ];
    expect(sortTradesByDefault(tied, 'entryDate-desc').map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('accepts only supported saved orders', () => {
    expect(isTradeSortOrder('exitDate-desc')).toBe(true);
    for (const value of [null, {}, 'pnl-desc', 'entryDate', ''])
      expect(isTradeSortOrder(value)).toBe(false);
  });
});
