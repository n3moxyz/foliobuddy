import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreatePositionData, Position, ProviderName, UpdatePositionData } from '@/lib/types';

const portfolioFocusRefreshOptions = {
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
} as const;

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: api.getPositions,
    ...portfolioFocusRefreshOptions,
  });
}

export function usePositionHistory(positionId: string | null | undefined) {
  return useQuery({
    queryKey: ['positions', positionId, 'history'],
    queryFn: () => api.getPositionHistory(positionId!),
    enabled: !!positionId,
    ...portfolioFocusRefreshOptions,
  });
}

export function usePortfolioSummary() {
  return useQuery({
    queryKey: ['portfolio', 'summary'],
    queryFn: api.getPositionSummary,
    ...portfolioFocusRefreshOptions,
  });
}

export function useFxRates() {
  return useQuery({
    queryKey: ['fx', 'rates'],
    queryFn: api.getFxRates,
    staleTime: 60 * 60 * 1000,
    ...portfolioFocusRefreshOptions,
  });
}

export function useTopPerformers(limit = 5) {
  return useQuery({
    queryKey: ['portfolio', 'performers', 'top', limit],
    queryFn: () => api.getTopPerformers(limit),
    ...portfolioFocusRefreshOptions,
  });
}

export function useWorstPerformers(limit = 5) {
  return useQuery({
    queryKey: ['portfolio', 'performers', 'worst', limit],
    queryFn: () => api.getWorstPerformers(limit),
    ...portfolioFocusRefreshOptions,
  });
}

export function useCreatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreatePositionData) => api.createPosition(data),
    onSuccess: (_, data) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      if (data.fundingCashPositionId) {
        queryClient.invalidateQueries({ queryKey: ['positions', data.fundingCashPositionId] });
        queryClient.invalidateQueries({
          queryKey: ['positions', data.fundingCashPositionId, 'history'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useUpdatePosition() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdatePositionData }) =>
      api.updatePosition(id, data),
    onSuccess: (_, { id, data }) => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['positions', id] });
      queryClient.invalidateQueries({ queryKey: ['positions', id, 'history'] });
      if (data.fundingCashPositionId) {
        queryClient.invalidateQueries({ queryKey: ['positions', data.fundingCashPositionId] });
        queryClient.invalidateQueries({
          queryKey: ['positions', data.fundingCashPositionId, 'history'],
        });
      }
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useCancelPositionHistory() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, historyId }: { id: string; historyId: string }) =>
      api.cancelPositionHistory(id, historyId),
    onSuccess: (position, { id }) => {
      queryClient.setQueryData(['positions', id], position);
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['positions', id, 'history'] });
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

export function usePerformanceHistory(params?: {
  days?: number;
  from?: string;
  to?: string;
  all?: boolean;
}) {
  return useQuery({
    queryKey: ['portfolio', 'performance', params],
    queryFn: () => api.getPerformanceHistory(params),
    ...portfolioFocusRefreshOptions,
  });
}

export function useInvestors() {
  return useQuery({
    queryKey: ['investors'],
    queryFn: api.getInvestors,
  });
}

export function useBenchmarkHistory(
  provider: ProviderName,
  providerAssetId: string,
  days: number,
  enabled = true
) {
  return useQuery({
    queryKey: ['benchmark', 'history', provider, providerAssetId, days],
    queryFn: () => api.getBenchmarkHistory({ provider, providerAssetId, days }),
    enabled: enabled && !!providerAssetId,
    staleTime: 5 * 60 * 1000,
    ...portfolioFocusRefreshOptions,
  });
}
