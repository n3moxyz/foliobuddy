import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/** Resolve 'system' to the OS preference; concrete themes pass through. */
export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
}

interface ThemeState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (resolveTheme(theme) === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
      cycleTheme: () => {
        // From 'system', flip relative to the currently resolved appearance.
        const next: Theme = resolveTheme(get().theme) === 'light' ? 'dark' : 'light';
        set({ theme: next });
        applyTheme(next);
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) {
          // If there was no persisted theme (fresh user), the FOUC blocking script
          // in index.html already resolved the correct theme from prefers-color-scheme
          // and may have added .dark to <html>. Read the DOM result instead of forcing
          // the store's 'dark' default, so a light-OS new user doesn't see a flash.
          const hasPersisted =
            typeof document !== 'undefined' && localStorage.getItem('theme-storage') !== null;
          if (!hasPersisted && typeof document !== 'undefined') {
            const resolved: Theme = document.documentElement.classList.contains('dark')
              ? 'dark'
              : 'light';
            state.theme = resolved;
            // DOM is already correct — no applyTheme call needed.
          } else {
            applyTheme(state.theme);
          }
        }
      },
    }
  )
);

export { applyTheme };
