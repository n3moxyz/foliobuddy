import { useState, useCallback } from 'react';

const STORAGE_KEY = 'foliobuddy-collapse-state';
const LEGACY_KEY = 'pa-portfolio-collapse-state';

type CollapseState = Record<string, boolean>;

function loadState(): CollapseState {
  try {
    // Migrate from legacy key on first load
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      localStorage.setItem(STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_KEY);
      return JSON.parse(legacy);
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveState(state: CollapseState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useCollapsibleState() {
  const [state, setState] = useState<CollapseState>(loadState);

  const isExpanded = useCallback(
    (id: string) => !state[id], // default = expanded (not in map = not collapsed)
    [state]
  );

  const toggle = useCallback((id: string) => {
    setState((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      // Clean up expanded entries (default) to keep storage lean
      if (!next[id]) delete next[id];
      saveState(next);
      return next;
    });
  }, []);

  return { isExpanded, toggle };
}
