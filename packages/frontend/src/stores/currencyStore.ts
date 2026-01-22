import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface CurrencyState {
  currency: 'USD' | 'SGD';
  toggleCurrency: () => void;
  setCurrency: (currency: 'USD' | 'SGD') => void;
}

export const useCurrencyStore = create<CurrencyState>()(
  persist(
    (set) => ({
      currency: 'USD',
      toggleCurrency: () =>
        set((state) => ({
          currency: state.currency === 'USD' ? 'SGD' : 'USD',
        })),
      setCurrency: (currency) => set({ currency }),
    }),
    {
      name: 'currency-storage',
    }
  )
);
