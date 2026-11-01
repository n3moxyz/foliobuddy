import { act, renderHook, waitFor } from '@testing-library/react';
import { onlineManager } from '@tanstack/react-query';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  useRefreshAssetPrice,
  useSearchAssets,
  useSearchCoins,
  type SearchState,
} from '@/hooks/useAssets';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';

// Both search hooks send their query through this one fake.
const { searchRequest } = vi.hoisted(() => ({
  searchRequest: vi.fn<(query: string) => Promise<unknown[]>>(),
}));

vi.mock('@/lib/api', () => ({
  api: {
    refreshAssetPrice: vi.fn(),
    searchCoins: (query: string) => searchRequest(query),
    searchAssets: (query: string) => searchRequest(query),
  },
}));

it('invalidates cached NAV metadata and valuations even when an explicit check fails', async () => {
  const client = createTestQueryClient();
  for (const key of ['assets', 'positions', 'portfolio'])
    client.setQueryData([key], { priceCheckStatus: 'ok' });
  vi.mocked(api.refreshAssetPrice).mockRejectedValue(new Error('NAV source unavailable'));
  const { result } = renderHook(() => useRefreshAssetPrice(), {
    wrapper: createQueryClientWrapper(client),
  });
  await act(async () => {
    await expect(result.current.mutateAsync('amova')).rejects.toThrow('unavailable');
  });
  for (const key of ['assets', 'positions', 'portfolio'])
    expect(client.getQueryState([key])?.isInvalidated).toBe(true);
});

// A search box may show "No matching …" only after a successful empty response for
// the text it shows now. These hooks used to report "not loading, no data" during
// the debounce wait and after a failed request, which every box read as no match.
describe.each<{ name: string; useSearch: (query: string) => SearchState<unknown> }>([
  { name: 'useSearchCoins', useSearch: (query) => useSearchCoins(query) },
  {
    name: 'useSearchAssets',
    useSearch: (query) => useSearchAssets(query, { provider: 'yahoo' }),
  },
])('$name', ({ useSearch }) => {
  beforeEach(() => {
    searchRequest.mockReset();
  });

  function renderSearch() {
    const client = createTestQueryClient();
    const view = renderHook(({ query }: { query: string }) => useSearch(query), {
      initialProps: { query: '' },
      wrapper: createQueryClientWrapper(client),
    });
    return { ...view, client };
  }

  it('reports the debounce wait as searching, before any request starts', async () => {
    searchRequest.mockResolvedValue([]);
    const { result, rerender } = renderSearch();

    rerender({ query: 'zzz' });

    expect(searchRequest).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ isSearching: true, isError: false, data: undefined });

    await waitFor(() => expect(result.current.isSearching).toBe(false));
    expect(searchRequest).toHaveBeenCalledWith('zzz');
    expect(result.current).toMatchObject({ isError: false, data: [] });
  });

  it('reports a failed search as an error, not an empty result, until a retry succeeds', async () => {
    searchRequest.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const { result, rerender } = renderSearch();

    rerender({ query: 'btc' });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current).toMatchObject({ isSearching: false, data: undefined });

    let answerRetry: (results: unknown[]) => void = () => {};
    searchRequest.mockImplementationOnce(() => new Promise((resolve) => (answerRetry = resolve)));
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.isSearching).toBe(true));
    expect(result.current.isError).toBe(false);

    act(() => answerRetry(['bitcoin']));
    await waitFor(() => expect(result.current.data).toEqual(['bitcoin']));
    expect(result.current).toMatchObject({ isSearching: false, isError: false });
    expect(searchRequest).toHaveBeenCalledTimes(2);
  });

  it('never searches whitespace alone and sends the trimmed query', async () => {
    searchRequest.mockResolvedValue([]);
    const { result, rerender } = renderSearch();

    rerender({ query: '   ' });
    expect(result.current).toMatchObject({ isSearching: false, isError: false, data: undefined });
    // Outlast both debounces (150 ms for coins, 200 ms for assets).
    await act(() => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(searchRequest).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ isSearching: false, isError: false, data: undefined });

    rerender({ query: '  btc ' });
    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(searchRequest).toHaveBeenCalledTimes(1);
    expect(searchRequest).toHaveBeenCalledWith('btc');
  });

  it('keeps a search paused offline as searching, not as an empty result', async () => {
    searchRequest.mockResolvedValue([]);
    onlineManager.setOnline(false);
    try {
      const { result, rerender, client } = renderSearch();

      rerender({ query: 'btc' });

      await waitFor(() =>
        expect(
          client
            .getQueryCache()
            .getAll()
            .some((query) => query.state.fetchStatus === 'paused')
        ).toBe(true)
      );
      expect(searchRequest).not.toHaveBeenCalled();
      expect(result.current).toMatchObject({ isSearching: true, isError: false, data: undefined });
    } finally {
      onlineManager.setOnline(true);
    }
  });
});
