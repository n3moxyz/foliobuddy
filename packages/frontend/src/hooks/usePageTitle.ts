import { useEffect } from 'react';

/** Per-route document title so tabs and screen readers can tell pages apart (WCAG 2.4.2). */
export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · FolioBuddy`;
    return () => {
      document.title = 'FolioBuddy';
    };
  }, [title]);
}
