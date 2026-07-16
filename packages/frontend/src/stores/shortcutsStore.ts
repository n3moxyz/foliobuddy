import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Single-letter shortcuts must be user-disableable (WCAG 2.1.4): speech-input
// and some keyboard users can trigger them accidentally outside form fields.
interface ShortcutsState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set) => ({
      enabled: true,
      setEnabled: (enabled) => set({ enabled }),
    }),
    { name: 'foliobuddy-shortcuts' }
  )
);
