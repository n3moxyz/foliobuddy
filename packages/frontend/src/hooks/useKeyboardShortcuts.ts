import { useHotkeys } from 'react-hotkeys-hook';
import { useNavigate } from 'react-router-dom';
import { useThemeStore } from '@/stores/themeStore';

interface UseKeyboardShortcutsOptions {
  onShowHelp?: () => void;
}

export function useKeyboardShortcuts({ onShowHelp }: UseKeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const cycleTheme = useThemeStore((state) => state.cycleTheme);

  // Navigation shortcuts - don't fire when typing in inputs
  const options = { enableOnFormTags: false, preventDefault: true };

  useHotkeys('d', () => navigate('/'), options);
  useHotkeys('p', () => navigate('/portfolio'), options);
  useHotkeys('t', () => navigate('/trades'), options);
  useHotkeys('i', () => navigate('/investors'), options);
  useHotkeys('s', () => navigate('/settings'), options);

  // Show help modal
  useHotkeys('mod+k', () => onShowHelp?.(), { ...options, preventDefault: true });

  // Toggle theme
  useHotkeys('/', () => cycleTheme(), options);
}

export const shortcuts = [
  { key: 'D', description: 'Go to Dashboard' },
  { key: 'P', description: 'Go to Portfolio' },
  { key: 'T', description: 'Go to Trades' },
  { key: 'I', description: 'Go to Investors' },
  { key: 'S', description: 'Go to Settings' },
  { key: '/', description: 'Toggle theme' },
  { key: 'Cmd/Ctrl + K', description: 'Show keyboard shortcuts' },
];
