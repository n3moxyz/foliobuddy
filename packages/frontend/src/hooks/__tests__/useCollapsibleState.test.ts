import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useCollapsibleState } from '../useCollapsibleState';

const STORAGE_KEY = 'foliobuddy-collapse-state';
const LEGACY_KEY = 'pa-portfolio-collapse-state';

describe('useCollapsibleState', () => {
  it.each(['null', '[]', '"collapsed"', '{"section":"yes"}'])(
    'recovers from corrupted persisted state %s',
    (stored) => {
      localStorage.setItem(STORAGE_KEY, stored);
      const { result } = renderHook(() => useCollapsibleState());

      expect(result.current.isExpanded('section')).toBe(true);
      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    }
  );

  it('migrates a valid legacy state exactly once', () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ crypto: true }));
    const { result } = renderHook(() => useCollapsibleState());

    expect(result.current.isExpanded('crypto')).toBe(false);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"crypto":true}');
  });

  it('keeps interactive state working when localStorage writes fail', () => {
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useCollapsibleState());

    expect(() => act(() => result.current.toggle('crypto'))).not.toThrow();
    expect(result.current.isExpanded('crypto')).toBe(false);
    setItem.mockRestore();
  });

  it('removes expanded defaults from the persisted map', () => {
    const { result } = renderHook(() => useCollapsibleState());
    act(() => result.current.toggle('crypto'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{"crypto":true}');
    act(() => result.current.toggle('crypto'));
    expect(localStorage.getItem(STORAGE_KEY)).toBe('{}');
  });
});
