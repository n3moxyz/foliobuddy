import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { useTrades, useCreateTrade, useUpdateTrade, useDeleteTrade } from '@/hooks/useTrades';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { Trade } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: {
    getTrades: vi.fn(),
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
