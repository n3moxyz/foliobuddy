import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useTrades, useCreateTrade, useUpdateTrade, useDeleteTrade } from '@/hooks/useTrades';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { Trade } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: {
    getTrades: vi.fn(),
    getTrade: vi.fn(),
    createTrade: vi.fn(),
    updateTrade: vi.fn(),
    deleteTrade: vi.fn(),
  },
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useTrades hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns trades from successful fetch', async () => {
    const trades = [{ id: 't1', realizedPnL: 10 }] as Trade[];
    vi.mocked(api.getTrades).mockResolvedValue(trades);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useTrades(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(trades);
  });

  it('calls createTrade API on create mutation', async () => {
    vi.mocked(api.createTrade).mockResolvedValue({ id: 't2' } as Trade);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useCreateTrade(), { wrapper });

    const payload = {
      assetId: 'asset-1',
      entryPrice: 100,
      positionSize: 1,
      entryDate: '2026-01-01',
    };

    await act(async () => {
      await result.current.mutateAsync(payload as never);
    });

    expect(api.createTrade).toHaveBeenCalledWith(payload);
  });

  it('calls updateTrade API on update mutation', async () => {
    vi.mocked(api.updateTrade).mockResolvedValue({ id: 't1' } as Trade);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useUpdateTrade(), { wrapper });

    const payload = { id: 't1', data: { notes: 'updated' } };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(api.updateTrade).toHaveBeenCalledWith('t1', { notes: 'updated' });
  });

  it('recovers when an update commits but its response is lost', async () => {
    const updateError = new Error('Request failed (HTTP 502)');
    const persistedTrade = {
      id: 't1',
      assetId: 'asset-1',
      direction: 'LONG',
      entryPrice: 100,
      exitPrice: 90,
      quantity: 2,
      entryDate: '2026-01-01T00:00:00.000Z',
      exitDate: '2026-01-02T00:00:00.000Z',
      fundingCost: 23_000,
      notes: null,
      tags: null,
    } as Trade;

    vi.mocked(api.updateTrade).mockRejectedValue(updateError);
    vi.mocked(api.getTrade).mockResolvedValue(persistedTrade);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useUpdateTrade(), { wrapper });

    const payload = {
      id: 't1',
      data: {
        assetId: 'asset-1',
        direction: 'LONG' as const,
        entryPrice: 100,
        exitPrice: 90,
        quantity: 2,
        entryDate: '2026-01-01',
        exitDate: '2026-01-02',
        fundingCost: 23_000,
      },
    };

    let recovered: Trade | undefined;
    await act(async () => {
      recovered = await result.current.mutateAsync(payload);
    });

    expect(recovered).toBe(persistedTrade);
    expect(api.getTrade).toHaveBeenCalledWith('t1');
    expect(result.current.isError).toBe(false);
  });

  it('preserves the update error when the persisted trade does not match', async () => {
    const updateError = new Error('Request failed (HTTP 502)');
    vi.mocked(api.updateTrade).mockRejectedValue(updateError);
    vi.mocked(api.getTrade).mockResolvedValue({
      id: 't1',
      assetId: 'asset-1',
      fundingCost: 0,
    } as Trade);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useUpdateTrade(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          id: 't1',
          data: { assetId: 'asset-1', fundingCost: 23_000 },
        });
      })
    ).rejects.toBe(updateError);
  });

  it('optimistically removes a trade before delete resolves', async () => {
    const deferred = createDeferred<void>();
    vi.mocked(api.deleteTrade).mockReturnValue(deferred.promise);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['trades'], [
      { id: 't1', realizedPnL: 10 },
      { id: 't2', realizedPnL: -5 },
    ] as Trade[]);

    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDeleteTrade(), { wrapper });

    act(() => {
      result.current.mutate('t1');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['trades'])).toEqual([{ id: 't2', realizedPnL: -5 }]);
    });

    deferred.resolve();
    await waitFor(() => expect(api.deleteTrade).toHaveBeenCalledWith('t1'));
  });

  it('restores trade list when delete fails after optimistic update', async () => {
    const deferred = createDeferred<void>();
    vi.mocked(api.deleteTrade).mockReturnValue(deferred.promise);

    const original = [
      { id: 't1', realizedPnL: 10 },
      { id: 't2', realizedPnL: -5 },
    ] as Trade[];

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['trades'], original);

    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDeleteTrade(), { wrapper });

    act(() => {
      result.current.mutate('t1');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['trades'])).toEqual([{ id: 't2', realizedPnL: -5 }]);
    });

    deferred.reject(new Error('delete failed'));

    await waitFor(() => {
      expect(queryClient.getQueryData(['trades'])).toEqual(original);
    });
  });
});
