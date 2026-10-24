import { beforeEach, describe, expect, it } from 'vitest';
import { useTradeSortStore } from '@/stores/tradeSortStore';

describe('saved default trade order', () => {
  beforeEach(() => {
    useTradeSortStore.setState({ defaultSort: 'entryDate-desc' });
    localStorage.clear();
  });

  it('restores the selected order after rehydration', async () => {
    useTradeSortStore.getState().setDefaultSort('exitDate-desc');
    const saved = localStorage.getItem('foliobuddy-trade-default-sort');
    expect(saved).toContain('exitDate-desc');
    useTradeSortStore.setState({ defaultSort: 'entryDate-desc' });
    localStorage.setItem('foliobuddy-trade-default-sort', saved!);
    await useTradeSortStore.persist.rehydrate();
    expect(useTradeSortStore.getState().defaultSort).toBe('exitDate-desc');
    expect(typeof useTradeSortStore.getState().setDefaultSort).toBe('function');
  });

  it.each([null, { defaultSort: 'corrupted' }, { defaultSort: 2 }])(
    'falls back safely for invalid persisted state %j',
    async (state) => {
      localStorage.setItem('foliobuddy-trade-default-sort', JSON.stringify({ state, version: 0 }));
      await useTradeSortStore.persist.rehydrate();
      expect(useTradeSortStore.getState().defaultSort).toBe('entryDate-desc');
    }
  );
});
