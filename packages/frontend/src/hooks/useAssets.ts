import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type {
  CoinSearchResult,
  CreateAssetData,
  CreateAssetFromProviderData,
  ProviderName,
  ProviderSearchResult,
} from '@/lib/types';

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

/** What a search box can say about its current input. */
export interface SearchState<T> {
  /** Results for the current input. Undefined until its search succeeds. */
  data: T[] | undefined;
  /**
   * The current input has no answer yet: the debounce wait, a request or its retry
   * in flight, or a request paused while offline.
   */
  isSearching: boolean;
  /** The search for the current input failed, so its results are unknown, not empty. */
  isError: boolean;
  /** Runs the failed search again. */
  retry: () => void;
}

/**
 * Reads a debounced search against the input the user sees now. Only a successful
 * response for that input may show an empty result.
 */
function useSearchState<T>(
  query: string,
  debouncedQuery: string,
  result: UseQueryResult<T[]>
): SearchState<T> {
  const { data, isPending, isFetching, isError, refetch } = result;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const current = query.length > 0 && debouncedQuery === query;
  const isSearching = query.length > 0 && (!current || isPending || isFetching);

  return {
    data: current ? data : undefined,
    isSearching,
    isError: current && !isSearching && isError,
    retry,
  };
}

export function useSearchCoins(query: string): SearchState<CoinSearchResult> {
  // Whitespace alone never searches, and padded input shares the trimmed request.
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebounce(trimmedQuery, 150);

  const result = useQuery({
    queryKey: ['coins', 'search', debouncedQuery],
    queryFn: () => api.searchCoins(debouncedQuery),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30000,
  });

  return useSearchState(trimmedQuery, debouncedQuery, result);
}

export function useCreateAssetFromCoinGecko() {
  const queryClient = useQueryClient();

  return useMutation({
    // Every caller reports the failure itself ("Couldn't select …" or an inline error).
    meta: { showsOwnError: true },
    mutationFn: (data: { coingeckoId: string; symbol: string; name: string; category?: string }) =>
      api.createAssetFromCoinGecko(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useCreateAsset() {
  const queryClient = useQueryClient();

  return useMutation({
    // PositionForm shows the failure inline.
    meta: { showsOwnError: true },
    mutationFn: (data: CreateAssetData) => api.createAsset(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useSearchAssets(
  query: string,
  params: { category?: string; provider?: ProviderName }
): SearchState<ProviderSearchResult> {
  // Whitespace alone never searches, and padded input shares the trimmed request.
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebounce(trimmedQuery, 200);

  const result = useQuery({
    queryKey: ['assets', 'search', debouncedQuery, params.category, params.provider],
    queryFn: () => api.searchAssets(debouncedQuery, params),
    enabled: debouncedQuery.length >= 1,
    staleTime: 30_000,
  });

  return useSearchState(trimmedQuery, debouncedQuery, result);
}

export function useCreateAssetFromProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    // Callers report the failure themselves; the background catalog repair stays quiet.
    meta: { showsOwnError: true },
    mutationFn: (data: CreateAssetFromProviderData) => api.createAssetFromProvider(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useRefreshAssetPrice() {
  const queryClient = useQueryClient();

  return useMutation({
    // UpdateNavModal shows the failure inline.
    meta: { showsOwnError: true },
    mutationFn: (id: string) => api.refreshAssetPrice(id),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}

export function useCreateUnitTrust() {
  const queryClient = useQueryClient();

  return useMutation({
    // PositionForm shows the failure inline.
    meta: { showsOwnError: true },
    mutationFn: (data: Parameters<typeof api.createUnitTrust>[0]) => api.createUnitTrust(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useUpdateAssetNav() {
  const queryClient = useQueryClient();

  return useMutation({
    // UpdateNavModal and PositionForm show the failure inline.
    meta: { showsOwnError: true },
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateAssetNav>[1] }) =>
      api.updateAssetNav(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['portfolio'] });
    },
  });
}
