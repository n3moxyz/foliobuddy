import { useCallback, useSyncExternalStore } from 'react';

function canMatchMedia(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * `true` while `query` matches; re-renders when the match changes.
 * Environments without `matchMedia` (SSR, bare jsdom) report `false`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!canMatchMedia()) return () => {};
      const mediaQueryList = window.matchMedia(query);
      mediaQueryList.addEventListener('change', onChange);
      return () => mediaQueryList.removeEventListener('change', onChange);
    },
    [query]
  );
  const getSnapshot = useCallback(
    () => (canMatchMedia() ? window.matchMedia(query).matches : false),
    [query]
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
