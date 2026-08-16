import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { UpdateUserPreferencesData, UserPreferences } from '@/lib/types';

const QUERY_KEY = ['user', 'preferences'] as const;

/** The signed-in user's snapshot schedule (hour + IANA timezone). */
export function useUserPreferences() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: api.getUserPreferences,
    staleTime: 5 * 60 * 1000,
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
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<UserPreferences>(QUERY_KEY);
      if (previous) {
        queryClient.setQueryData<UserPreferences>(QUERY_KEY, { ...previous, ...data });
      }
      return { previous };
    },
    onError: (_error, _data, context) => {
      if (context?.previous) {
        queryClient.setQueryData(QUERY_KEY, context.previous);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(QUERY_KEY, saved);
      toast.success('Snapshot schedule saved');
    },
  });
}
