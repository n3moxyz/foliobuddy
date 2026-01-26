import { useEffect } from 'react';
import { useThemeStore, applyTheme } from '@/stores/themeStore';

export function useThemeEffect() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    // Apply theme on mount
    applyTheme(theme);

    // Listen for system preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);
}
