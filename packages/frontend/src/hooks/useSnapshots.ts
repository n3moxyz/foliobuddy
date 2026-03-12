import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateManualSnapshotData, Snapshot, UpdateSnapshotData } from '@/lib/types';

export function useSnapshots(params?: {
  type?: string;
  source?: string;
  from?: string;
  to?: string;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['snapshots', params],
    queryFn: () => api.getSnapshots(params),
  });
}

export function useSnapshotsPaginated(params?: {
  type?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  return useQuery({
    queryKey: ['snapshots', 'paginated', params],
    queryFn: () => api.getSnapshotsPaginated(params),
  });
}

export function useCreateManualSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateManualSnapshotData) => api.createManualSnapshot(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}

export function useUpdateSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSnapshotData }) =>
      api.updateSnapshot(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}

export function useDeleteSnapshot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteSnapshot(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['snapshots'] });
      const previous = queryClient.getQueryData<Snapshot[]>(['snapshots']);
      queryClient.setQueryData<Snapshot[]>(['snapshots'], (old) =>
        old ? old.filter((s) => s.id !== id) : []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['snapshots'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}

export function useDeleteAllSnapshots() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteAllSnapshots(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}
