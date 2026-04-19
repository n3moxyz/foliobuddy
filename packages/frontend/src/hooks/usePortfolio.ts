import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreatePositionData, Position } from '@/lib/types';

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: api.getPositions,
  });
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: api.getPositionSummary,
  });
}

export function useTopPerformers(limit = 5) {
  return useQuery({
    queryKey: ['portfolio', 'performers', 'top', limit],
    queryFn: () => api.getTopPerformers(limit),
  });
}

export function useWorstPerformers(limit = 5) {
  return useQuery({
    queryKey: ['portfolio', 'performers', 'worst', limit],
    queryFn: () => api.getWorstPerformers(limit),
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePositionData) => api.createPosition(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreatePositionData> }) =>
      api.updatePosition(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['positions', id] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeletePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deletePosition(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['positions'] });
      const previous = queryClient.getQueryData<Position[]>(['positions']);
      queryClient.setQueryData<Position[]>(['positions'], (old) =>
        old ? old.filter((p) => p.id !== id) : []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['positions'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useDeleteAllPositions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteAllPositions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function usePerformanceHistory(params?: { days?: number; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['portfolio', 'performance', params],
    queryFn: () => api.getPerformanceHistory(params),
  });
}

export function useInvestors() {
  return useQuery({
    queryKey: ['investors'],
    queryFn: api.getInvestors,
  });
}

export function useBenchmarkHistory(coingeckoId: string, days: number, enabled = true) {
  return useQuery({
    queryKey: ['benchmark', 'history', coingeckoId, days],
    queryFn: () => api.getBenchmarkHistory(coingeckoId, days),
    enabled: enabled && !!coingeckoId,
    staleTime: 5 * 60 * 1000,
  });
}
