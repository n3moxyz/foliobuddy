import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateManualSnapshotData, UpdateSnapshotData } from '@/lib/api';

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      queryClient.invalidateQueries({ queryKey: ['performance'] });
    },
  });
}
