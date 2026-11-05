import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { UserPreferences } from '@/lib/types';
import { USER_PREFERENCES_QUERY_KEY, useUserPreferences } from './useUserPreferences';

export const DEFAULT_REDUCE_PERCENTAGES = [25, 50, 75, 100];

export function useReducePercentages() {
  const preferences = useUserPreferences();
  const queryClient = useQueryClient();
  const update = useMutation({
    meta: { showsOwnError: true },
    mutationFn: (reducePercentages: number[]) => api.updateUserPreferences({ reducePercentages }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
    },
    onSuccess: async (saved: UserPreferences) => {
      // Focus/reconnect can start another GET while PATCH is pending. Its old
      // response must not replace the defaults the server just confirmed.
      await queryClient.cancelQueries({ queryKey: USER_PREFERENCES_QUERY_KEY });
      queryClient.setQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY, (current) =>
        current ? { ...current, reducePercentages: saved.reducePercentages } : saved
      );
      toast.success('Reduce percentages saved');
    },
  });
  return {
    percentages: preferences.data?.reducePercentages ?? DEFAULT_REDUCE_PERCENTAGES,
    hasLoaded: preferences.data !== undefined,
    // An older backend can still serve preferences during a rolling deployment.
    canEdit: preferences.data?.reducePercentages !== undefined && !update.isPending,
    loadError: !preferences.data && preferences.isError,
    retry: () => {
      void preferences.refetch();
    },
    save: update.mutateAsync,
  };
}
