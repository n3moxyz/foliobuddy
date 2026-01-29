import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateTradeData } from '@/lib/api';

export function useTrades(params?: {
  status?: string;
  assetId?: string;
  from?: string;
  to?: string;
}) {
  return useQuery({
    queryKey: ['trades', params],
    queryFn: () => api.getTrades(params),
  });
}

export function useTrade(id: string) {
  return useQuery({
    queryKey: ['trades', id],
    queryFn: () => api.getTrade(id),
    enabled: !!id,
  });
}

export function useTradeAnalytics(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['trades', 'analytics', params],
    queryFn: () => api.getTradeAnalytics(params),
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

export function useCloseTrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { exitPrice: number; exitDate?: string; notes?: string };
    }) => api.closeTrade(id, data),
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
    onSuccess: () => {
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
