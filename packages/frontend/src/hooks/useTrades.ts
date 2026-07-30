import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateTradeData, Trade } from '@/lib/types';

function sameDate(stored: string | null, requested: string | undefined): boolean {
  return requested === undefined || (stored !== null && stored.slice(0, 10) === requested);
}

function sameTags(stored: string | null, requested: string[] | undefined): boolean {
  if (requested === undefined) return true;

  try {
    const parsed = stored ? JSON.parse(stored) : [];
    return (
      Array.isArray(parsed) &&
      parsed.length === requested.length &&
      parsed.every((tag, index) => tag === requested[index])
    );
  } catch {
    return false;
  }
}

export function tradeReflectsUpdate(trade: Trade, update: Partial<CreateTradeData>): boolean {
  return (
    (update.assetId === undefined || trade.assetId === update.assetId) &&
    (update.direction === undefined || trade.direction === update.direction) &&
    (update.entryPrice === undefined || trade.entryPrice === update.entryPrice) &&
    (update.exitPrice === undefined || trade.exitPrice === update.exitPrice) &&
    (update.quantity === undefined || trade.quantity === update.quantity) &&
    sameDate(trade.entryDate, update.entryDate) &&
    sameDate(trade.exitDate, update.exitDate) &&
    (update.fundingCost === undefined || trade.fundingCost === update.fundingCost) &&
    (update.notes === undefined || trade.notes === update.notes) &&
    sameTags(trade.tags, update.tags)
  );
}

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
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateTradeData> }) => {
      try {
        return await api.updateTrade(id, data);
      } catch (updateError) {
        // A proxy can lose the response after the backend commits the update. Re-read the
        // trade before surfacing an error so an idempotent save cannot become a false failure.
        try {
          const persistedTrade = await api.getTrade(id);
          if (tradeReflectsUpdate(persistedTrade, data)) {
            return persistedTrade;
          }
        } catch {
          // Preserve the original update failure; it is the actionable error for the user.
        }

        throw updateError;
      }
    },
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
