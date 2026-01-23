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

export function useSearchCoins(query: string) {
  return useQuery({
    queryKey: ['coins', 'search', query],
    queryFn: () => api.searchCoins(query),
    enabled: query.length >= 1,
    staleTime: 60000, // 1 minute
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
