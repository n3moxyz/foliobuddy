import { useState, useCallback } from 'react';

const STORAGE_KEY = 'foliobuddy-collapse-state';
const LEGACY_KEY = 'pa-portfolio-collapse-state';

type CollapseState = Record<string, boolean>;

function parseState(raw: string): CollapseState | null {
  const parsed: unknown = JSON.parse(raw);
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed) ||
    !Object.values(parsed).every((value) => typeof value === 'boolean')
  ) {
    return null;
  }
  return parsed as CollapseState;
}

function loadState(): CollapseState {
  try {
    // Migrate from legacy key on first load
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = parseState(legacy);
      localStorage.removeItem(LEGACY_KEY);
      if (parsed) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
        return parsed;
      }
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = parseState(raw);
    if (parsed) return parsed;
    localStorage.removeItem(STORAGE_KEY);
    return {};
  } catch {
    return {};
  }
}

function saveState(state: CollapseState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Persistence is best-effort in privacy-restricted browser contexts.
  }
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
