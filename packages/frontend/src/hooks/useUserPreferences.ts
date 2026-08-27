import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { UpdateUserPreferencesData, UserPreferences } from '@/lib/types';

export const USER_PREFERENCES_QUERY_KEY = ['user', 'preferences'] as const;

/** The signed-in user's server-backed app preferences. */
export function useUserPreferences() {
  return useQuery({
    queryKey: USER_PREFERENCES_QUERY_KEY,
    queryFn: api.getUserPreferences,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });
}

/**
 * Optimistic update with rollback so the Settings selects feel instant.
 * The global MutationCache.onError toast still fires on failure; success
 * gets its own confirmation here because a silent save is easy to miss.
 */
export function useUpdateUserPreferences() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserPreferencesData) => api.updateUserPreferences(data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
      const previous = queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY, {
          ...previous,
          ...data,
        });
      }
      return { previous };
    },
    onError: (_error, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, context.previous);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(USER_PREFERENCES_QUERY_KEY, saved);
      toast.success('Snapshot schedule saved');
    },
  });
}
