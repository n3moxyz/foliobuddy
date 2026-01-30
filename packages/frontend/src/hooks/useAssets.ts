import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, CreateAssetData } from '@/lib/api';

export function useAssets(params?: { category?: string; search?: string }) {
  return useQuery({
    queryKey: ['assets', params],
    queryFn: () => api.getAssets(params),
  });
}

export function useAsset(id: string) {
  return useQuery({
    queryKey: ['assets', id],
    queryFn: () => api.getAsset(id),
    enabled: !!id,
  });
}

// Debounce hook for search input
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}

export function useSearchCoins(query: string) {
  // Debounce search query by 300ms to avoid excessive API calls while typing
  const debouncedQuery = useDebounce(query, 300);

  return useQuery({
    queryKey: ['coins', 'search', debouncedQuery],
    queryFn: () => api.searchCoins(debouncedQuery),
    enabled: debouncedQuery.length >= 2, // Require at least 2 chars
    staleTime: 60000, // 1 minute cache
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateAssetData) => api.createAsset(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
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
