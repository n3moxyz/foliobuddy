import { useEffect } from 'react';
import { useThemeStore, applyTheme } from '@/stores/themeStore';

export function useThemeEffect() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);
}
