import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_TRADE_SORT, isTradeSortOrder, type TradeSortOrder } from '@/lib/tradeSort';

interface TradeSortState {
  defaultSort: TradeSortOrder;
  setDefaultSort: (defaultSort: TradeSortOrder) => void;
}

export const useTradeSortStore = create<TradeSortState>()(
  persist(
    (set) => ({
      defaultSort: DEFAULT_TRADE_SORT,
      setDefaultSort: (defaultSort) => {
        if (isTradeSortOrder(defaultSort)) set({ defaultSort });
      },
    }),
    {
      name: 'foliobuddy-trade-default-sort',
      partialize: ({ defaultSort }) => ({ defaultSort }),
      merge: (persisted, current) => {
        const saved = persisted as { defaultSort?: unknown } | null;
        return {
          ...current,
          defaultSort: isTradeSortOrder(saved?.defaultSort)
            ? saved.defaultSort
            : DEFAULT_TRADE_SORT,
        };
      },
    }
  )
);
