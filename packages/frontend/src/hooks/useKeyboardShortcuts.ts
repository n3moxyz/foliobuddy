import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores/themeStore';
import { useShortcutsStore } from '@/stores/shortcutsStore';

interface UseKeyboardShortcutsOptions {
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts({ onShowHelp }: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const cycleTheme = useThemeStore((state) => state.cycleTheme);
  const singleKeysEnabled = useShortcutsStore((state) => state.enabled);

  // Navigation shortcuts - don't fire when typing in inputs. Single-letter keys
  // honor the Settings toggle (WCAG 2.1.4 Character Key Shortcuts).
  const options = { enableOnFormTags: false, preventDefault: true, enabled: singleKeysEnabled };

  useHotkeys('d', () => navigate('/'), options);
  useHotkeys('p', () => navigate('/portfolio'), options);
  useHotkeys('t', () => navigate('/trades'), options);
  useHotkeys('n', () => navigate('/news'), options);
  useHotkeys('h', () => navigate('/history'), options);
  useHotkeys('i', () => navigate('/investors'), options);
  useHotkeys('s', () => navigate('/settings'), options);

  // Show help modal — has a modifier, so it stays active regardless of the toggle.
  useHotkeys('mod+k', () => onShowHelp?.(), { enableOnFormTags: false, preventDefault: true });

  // Toggle theme
  useHotkeys('/', () => cycleTheme(), options);
}

export const shortcuts = [
  { key: 'D', description: 'Go to Dashboard' },
  { key: 'P', description: 'Go to Portfolio' },
  { key: 'T', description: 'Go to Trades' },
  { key: 'N', description: 'Go to News' },
  { key: 'H', description: 'Go to History' },
  { key: 'I', description: 'Go to Investors' },
  { key: 'S', description: 'Go to Settings' },
  { key: '/', description: 'Toggle theme' },
  { key: 'Cmd/Ctrl + K', description: 'Show keyboard shortcuts' },
];
