import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useIsMutating, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { failureDescription } from '@/lib/mutationFeedback';
import type { UserPreferences } from '@/lib/types';
import { USER_PREFERENCES_QUERY_KEY, useUserPreferences } from './useUserPreferences';

const PERP_EXPOSURE_KEY = 'foliobuddy-perp-exposure';
const LEGACY_PERP_EXPOSURE_KEY = 'pa-portfolio-perp-exposure';
const PERP_EXPOSURE_MUTATION_KEY = ['user', 'preferences', 'perpExposure'] as const;

type PerpExposureUpdate = {
  value: number;
  source: 'manual' | 'migration';
};

function readLegacyPerpExposure(): number | null {
  if (typeof localStorage === 'undefined') return null;

  try {
    for (const key of [PERP_EXPOSURE_KEY, LEGACY_PERP_EXPOSURE_KEY]) {
      const stored = localStorage.getItem(key);
      if (stored === null) continue;

      const value = Number(stored);
      if (Number.isFinite(value) && value > 0) return value;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted browser contexts.
  }

  return null;
}

function clearLegacyPerpExposure() {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.removeItem(PERP_EXPOSURE_KEY);
    localStorage.removeItem(LEGACY_PERP_EXPOSURE_KEY);
  } catch {
    // The server remains authoritative even when local cleanup is unavailable.
  }
}

/**
 * The signed-in user's aggregate perpetual-futures exposure in USD.
 *
 * A nullable server value is a migration sentinel for accounts created before
 * this setting was synced. A positive legacy browser value is uploaded once;
 * any numeric server value, including zero, is authoritative.
 *
 * Gate editing on hasLoaded, not on the latest refresh: a save sends the whole
 * value, and a failed save rolls back and says so.
 */
export function usePerpExposure() {
  const preferences = useUserPreferences();
  const queryClient = useQueryClient();
  const migrationAttempted = useRef(false);
  const activeMutationCount = useIsMutating({ mutationKey: PERP_EXPOSURE_MUTATION_KEY });

  const update = useMutation({
    mutationKey: PERP_EXPOSURE_MUTATION_KEY,
    // onError names the action itself: saving and removing need different words.
    meta: { showsOwnError: true },
    mutationFn: ({ value }: PerpExposureUpdate) =>
      api.updateUserPreferences({ perpExposureUsd: value }),
    onMutate: async ({ value, source }) => {
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY);

      // Keep the legacy browser value intact and the cache nullable until its PATCH succeeds.
      // Otherwise a newly mounted route could mistake an optimistic migration for server state
      // and clear the only recoverable copy before the request has actually completed.
      const didOptimisticallyUpdate = source === 'manual' && previous !== undefined;
      if (didOptimisticallyUpdate) {
        queryClient.setQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY, {
          ...previous,
          perpExposureUsd: value,
        });
      }

      return { previous, didOptimisticallyUpdate };
    },
    onError: (error, variables, context) => {
      if (context?.didOptimisticallyUpdate && context.previous !== undefined) {
        queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, context.previous);
      }
      // A failed background migration keeps the legacy value and retries on the next load,
      // so only a person's own save reports the failure (as only it reports success).
      if (variables.source === 'manual') {
        toast.error(
          variables.value === 0 ? "Couldn't remove perp exposure" : "Couldn't save perp exposure",
          { description: failureDescription(error) }
        );
      }
    },
    onSuccess: (saved, variables) => {
      queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, saved);
      clearLegacyPerpExposure();

      if (variables.source === 'manual') {
        toast.success(variables.value === 0 ? 'Perp exposure removed' : 'Perp exposure saved');
      }
    },
  });
  const { mutate } = update;
  const isSaving = activeMutationCount > 0;

  const serverValue = preferences.data?.perpExposureUsd;
  // True once the setting has loaded. Unlike isSuccess, a later refresh that fails keeps it
  // true (React Query keeps the data), so a value already on screen stays there and editable.
  const hasLoaded = preferences.data !== undefined;
  const legacyValue = useMemo(
    () => (hasLoaded && serverValue == null ? readLegacyPerpExposure() : null),
    [hasLoaded, serverValue]
  );

  useEffect(() => {
    if (!preferences.isSuccess) return;

    if (typeof serverValue === 'number') {
      // A successful GET or PATCH with a numeric value supersedes stale local data.
      if (!isSaving) clearLegacyPerpExposure();
      return;
    }

    // The mutation count is shared through React Query, so navigating between Dashboard and
    // Portfolio cannot start a duplicate migration or re-enable editing while one is in flight.
    if (legacyValue === null || migrationAttempted.current || isSaving) return;
    migrationAttempted.current = true;
    mutate({ value: legacyValue, source: 'migration' });
  }, [isSaving, legacyValue, mutate, preferences.isSuccess, serverValue]);

  const savePerpExposure = useCallback(
    (value: number) => {
      if (!Number.isFinite(value) || value < 0) return false;
      // A person's own value replaces the legacy one, so this mount never uploads it afterwards.
      // React Query records a failed save's rollback as a success. Without this, a save made
      // after a failed refresh could start the migration in a mount that has not tried it yet,
      // and send the old browser value the person had just tried to replace.
      migrationAttempted.current = true;
      mutate({ value, source: 'manual' });
      return true;
    },
    [mutate]
  );

  return {
    perpExposure: serverValue ?? legacyValue ?? 0,
    hasLoaded,
    isLoading: preferences.isLoading,
    isError: preferences.isError,
    isFetching: preferences.isFetching,
    refetch: preferences.refetch,
    isSaving,
    savePerpExposure,
  };
}
