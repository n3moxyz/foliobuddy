import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { installMatchMedia } from '@/test/matchMedia';

const QUERY = '(max-width: 639.98px)';

describe('useMediaQuery', () => {
  let media: ReturnType<typeof installMatchMedia> | null = null;

  afterEach(() => {
    media?.uninstall();
    media = null;
  });

  it('reports false when matchMedia is unavailable', () => {
    const { result } = renderHook(() => useMediaQuery(QUERY));
    expect(result.current).toBe(false);
  });

  it('reflects the current match and follows change events', () => {
    media = installMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery(QUERY));
    expect(result.current).toBe(false);
    expect(media.matchMedia).toHaveBeenCalledWith(QUERY);

    act(() => media!.setMatches(true));
    expect(result.current).toBe(true);

    act(() => media!.setMatches(false));
    expect(result.current).toBe(false);
  });

  it('unsubscribes on unmount', () => {
    media = installMatchMedia(true);
    const { unmount } = renderHook(() => useMediaQuery(QUERY));
    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it('re-subscribes to the new query when it changes', () => {
    media = installMatchMedia(false);
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: QUERY },
    });
    expect(media.listenerCount()).toBe(1);

    rerender({ query: '(prefers-color-scheme: dark)' });
    expect(media.listenerCount()).toBe(1);
    expect(media.matchMedia).toHaveBeenLastCalledWith('(prefers-color-scheme: dark)');
  });
});
