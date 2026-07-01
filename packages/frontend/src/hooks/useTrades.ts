import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateTradeData, Trade } from '@/lib/types';

export function useTrades(params?: {
  status?: string;
  assetId?: string;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ['trades', params],
    queryFn: () => api.getTrades(params),
    staleTime: 60 * 1000,
  });
}

export function useTradeAnalytics(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['trades', 'analytics', params],
    queryFn: () => api.getTradeAnalytics(params),
    staleTime: 60 * 1000,
  });
}

export function useCreateTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateTradeData) => api.createTrade(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });
}

export function useUpdateTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTradeData> }) =>
      api.updateTrade(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
      queryClient.invalidateQueries({ queryKey: ['trades', id] });
    },
  });
}

export function useDeleteTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.deleteTrade(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['trades'] });
      const previous = queryClient.getQueryData<Trade[]>(['trades']);
      queryClient.setQueryData<Trade[]>(['trades'], (old) =>
        old ? old.filter((t) => t.id !== id) : []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['trades'], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });
}

export function useDeleteAllTrades() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => api.deleteAllTrades(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trades'] });
    },
  });
}
