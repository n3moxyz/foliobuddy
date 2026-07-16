import { useEffect } from 'react';
import { useThemeStore, applyTheme } from '@/stores/themeStore';

export function useThemeEffect() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    applyTheme(theme);

    // While on 'system', follow live OS appearance changes.
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme]);
}
