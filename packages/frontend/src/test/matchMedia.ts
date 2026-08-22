import { vi } from 'vitest';

type ChangeListener = (event: { matches: boolean; media: string }) => void;

/**
 * Installs a controllable `window.matchMedia` for tests (jsdom has none).
 * Every query shares one `matches` flag; `setMatches()` flips it and notifies listeners.
 */
export function installMatchMedia(initialMatches: boolean) {
  const listeners = new Set<ChangeListener>();
  let matches = initialMatches;

  const matchMedia = vi.fn((query: string) => ({
    media: query,
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: 'change', listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'change', listener: ChangeListener) => {
      listeners.delete(listener);
    },
    addListener: (listener: ChangeListener) => {
      listeners.add(listener);
    },
    removeListener: (listener: ChangeListener) => {
      listeners.delete(listener);
    },
    dispatchEvent: () => true,
  }));

  Object.defineProperty(window, 'matchMedia', {
    value: matchMedia,
    configurable: true,
    writable: true,
  });

  return {
    matchMedia,
    setMatches(next: boolean) {
      matches = next;
      listeners.forEach((listener) => listener({ matches: next, media: '' }));
    },
    listenerCount: () => listeners.size,
    uninstall() {
      delete (window as { matchMedia?: unknown }).matchMedia;
    },
  };
}
