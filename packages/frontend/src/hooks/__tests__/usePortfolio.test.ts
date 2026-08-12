import { renderHook, waitFor, act } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  usePositions,
  useCreatePosition,
  useDrawdownStats,
  useUpdatePosition,
  useDeletePosition,
} from '@/hooks/usePortfolio';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { Position } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: {
    getPositions: vi.fn(),
    getPositionSummary: vi.fn(),
    getTopPerformers: vi.fn(),
    getWorstPerformers: vi.fn(),
    getPerformanceHistory: vi.fn(),
    getBenchmarkHistory: vi.fn(),
    createPosition: vi.fn(),
    updatePosition: vi.fn(),
    deletePosition: vi.fn(),
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

describe('usePortfolio hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('returns positions from successful fetch', async () => {
    const positions = [{ id: 'p1', quantity: 1 }] as Position[];
    vi.mocked(api.getPositions).mockResolvedValue(positions);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePositions(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(positions);
  });

  it('refetches stale portfolio data when the window regains focus', async () => {
    const firstPositions = [{ id: 'p1', quantity: 1 }] as Position[];
    const refreshedPositions = [{ id: 'p1', quantity: 2 }] as Position[];
    vi.mocked(api.getPositions)
      .mockResolvedValueOnce(firstPositions)
      .mockResolvedValueOnce(refreshedPositions);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePositions(), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(firstPositions));

    act(() => {
      focusManager.setFocused(false);
    });
    act(() => {
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(api.getPositions).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.data).toEqual(refreshedPositions));
  });

  it('derives YTD ATH, MDD, daily MDD, and current drawdown from history plus live value', async () => {
    vi.mocked(api.getPerformanceHistory).mockResolvedValue([
      {
        timestamp: '2026-01-01T00:00:00.000Z',
        totalValueUsd: 100,
        totalValueSgd: null,
        unrealizedPnL: null,
        btcPrice: null,
        ethPrice: null,
      },
      {
        timestamp: '2026-02-01T00:00:00.000Z',
        totalValueUsd: 120,
        totalValueSgd: null,
        unrealizedPnL: null,
        btcPrice: null,
        ethPrice: null,
      },
      {
        timestamp: '2026-03-01T00:00:00.000Z',
        totalValueUsd: 90,
        totalValueSgd: null,
        unrealizedPnL: null,
        btcPrice: null,
        ethPrice: null,
      },
    ]);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDrawdownStats(96), { wrapper });

    await waitFor(() => expect(result.current.ytdAthUsd).toBe(120));
    expect(result.current).toEqual({
      ytdAthUsd: 120,
      currentDrawdownPct: 20,
      maxDrawdownPct: 25,
      maxDailyDrawdownPct: 25,
    });
  });

  it('calls createPosition API on create mutation', async () => {
    vi.mocked(api.createPosition).mockResolvedValue({ id: 'p2' } as Position);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useCreatePosition(), { wrapper });

    const payload = {
      assetId: 'asset-1',
      quantity: 2,
      entryPrice: 100,
      storageType: 'cex',
    };

    await act(async () => {
      await result.current.mutateAsync(payload as never);
    });

    expect(api.createPosition).toHaveBeenCalledWith(payload);
  });

  it('calls updatePosition API on update mutation', async () => {
    vi.mocked(api.updatePosition).mockResolvedValue({ id: 'p1' } as Position);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useUpdatePosition(), { wrapper });

    const payload = { id: 'p1', data: { quantity: 3 } };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(api.updatePosition).toHaveBeenCalledWith('p1', { quantity: 3 });
  });

  it('optimistically removes a position before delete resolves', async () => {
    const deferred = createDeferred<void>();
    vi.mocked(api.deletePosition).mockReturnValue(deferred.promise);

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['positions'], [
      { id: 'p1', quantity: 1 },
      { id: 'p2', quantity: 2 },
    ] as Position[]);

    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDeletePosition(), { wrapper });

    act(() => {
      result.current.mutate('p1');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['positions'])).toEqual([{ id: 'p2', quantity: 2 }]);
    });

    deferred.resolve();
    await waitFor(() => expect(api.deletePosition).toHaveBeenCalledWith('p1'));
  });

  it('restores position list when delete fails after optimistic update', async () => {
    const deferred = createDeferred<void>();
    vi.mocked(api.deletePosition).mockReturnValue(deferred.promise);

    const original = [
      { id: 'p1', quantity: 1 },
      { id: 'p2', quantity: 2 },
    ] as Position[];

    const queryClient = createTestQueryClient();
    queryClient.setQueryData(['positions'], original);

    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDeletePosition(), { wrapper });

    act(() => {
      result.current.mutate('p1');
    });

    await waitFor(() => {
      expect(queryClient.getQueryData(['positions'])).toEqual([{ id: 'p2', quantity: 2 }]);
    });

    deferred.reject(new Error('delete failed'));

    await waitFor(() => {
      expect(queryClient.getQueryData(['positions'])).toEqual(original);
    });
  });
});
