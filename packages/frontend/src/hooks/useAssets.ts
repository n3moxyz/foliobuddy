import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { CreateAssetFromProviderData, ProviderName } from '@/lib/types';

export function useAssets(params?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => api.getAssets(params),
  });
}

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useSearchCoins(query: string) {
  const debouncedQuery = useDebounce(query, 150);

  const result = useQuery({
    queryKey: ['coins', 'search', debouncedQuery],
    queryFn: () => api.searchCoins(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30000,
  });

  return {
    ...result,
    isLoading: result.isFetching && debouncedQuery.length >= 1,
  };
}

export function useCreateAssetFromCoinGecko() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { coingeckoId: string; symbol: string; name: string; category?: string }) =>
      api.createAssetFromCoinGecko(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useSearchAssets(
  query: string,
  params: { category?: string; provider?: ProviderName }
) {
  const debouncedQuery = useDebounce(query, 200);

  const result = useQuery({
    queryKey: ['assets', 'search', debouncedQuery, params.category, params.provider],
    queryFn: () => api.searchAssets(debouncedQuery, params),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30_000,
  });

  return {
    ...result,
    isLoading: result.isFetching && debouncedQuery.length >= 1,
  };
}

export function useCreateAssetFromProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetFromProviderData) => api.createAssetFromProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useRefreshAssetPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => api.refreshAssetPrice(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
