import { create } from 'zustand';

export const PRIVACY_VALUES_HIDDEN_KEY = 'foliobuddy-values-hidden';
export const LEGACY_DASHBOARD_VALUES_HIDDEN_KEY = 'foliobuddy-dashboard-values-hidden';
export const MASKED_MONEY_VALUE = '••••';

function readInitialValuesHidden(): boolean {
  try {
    const saved = localStorage.getItem(PRIVACY_VALUES_HIDDEN_KEY);
    if (saved !== null) return saved === 'true';

    const legacy = localStorage.getItem(LEGACY_DASHBOARD_VALUES_HIDDEN_KEY);
    if (legacy !== null) {
      localStorage.setItem(PRIVACY_VALUES_HIDDEN_KEY, legacy);
      localStorage.removeItem(LEGACY_DASHBOARD_VALUES_HIDDEN_KEY);
      return legacy === 'true';
    }
  } catch {
    // Default to visible when storage is unavailable.
  }

  return false;
}

function persistValuesHidden(valuesHidden: boolean): void {
  try {
    localStorage.setItem(PRIVACY_VALUES_HIDDEN_KEY, String(valuesHidden));
  } catch {
    // The in-memory setting still works for this session.
  }
}

interface PrivacyState {
  valuesHidden: boolean;
  toggleValuesHidden: () => void;
  setValuesHidden: (valuesHidden: boolean) => void;
}

export const usePrivacyStore = create<PrivacyState>((set) => ({
  valuesHidden: readInitialValuesHidden(),
  toggleValuesHidden: () =>
    set((state) => {
      const valuesHidden = !state.valuesHidden;
      persistValuesHidden(valuesHidden);
      return { valuesHidden };
    }),
  setValuesHidden: (valuesHidden) => {
    persistValuesHidden(valuesHidden);
    set({ valuesHidden });
  },
}));
