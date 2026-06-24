import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import {
  useSnapshots,
  useCreateManualSnapshot,
  useUpdateSnapshot,
  useDeleteSnapshot,
} from '@/hooks/useSnapshots';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { Snapshot } from '@/lib/types';

vi.mock('@/lib/api', () => ({
  api: {
    getSnapshots: vi.fn(),
    createManualSnapshot: vi.fn(),
    updateSnapshot: vi.fn(),
    deleteSnapshot: vi.fn(),
  },
}));

describe('useSnapshots hooks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns snapshots from successful fetch', async () => {
    const snapshots = [{ id: 's1', totalValueUsd: 1000 }] as Snapshot[];
    vi.mocked(api.getSnapshots).mockResolvedValue(snapshots);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useSnapshots(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(snapshots);
  });

  it('passes snapshot query params through to the API', async () => {
    vi.mocked(api.getSnapshots).mockResolvedValue([]);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    renderHook(() => useSnapshots({ limit: 500 }), { wrapper });

    await waitFor(() => expect(api.getSnapshots).toHaveBeenCalledWith({ limit: 500 }));
  });

  it('calls createManualSnapshot API on create mutation', async () => {
    vi.mocked(api.createManualSnapshot).mockResolvedValue({ id: 's2' } as Snapshot);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useCreateManualSnapshot(), { wrapper });

    const payload = {
      capturedAt: '2026-01-01T00:00:00.000Z',
      totalValueUsd: 1200,
      notes: 'manual snapshot',
    };

    await act(async () => {
      await result.current.mutateAsync(payload as never);
    });

    expect(api.createManualSnapshot).toHaveBeenCalledWith(payload);
  });

  it('calls updateSnapshot API on update mutation', async () => {
    vi.mocked(api.updateSnapshot).mockResolvedValue({ id: 's1' } as Snapshot);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useUpdateSnapshot(), { wrapper });

    const payload = { id: 's1', data: { notes: 'updated note' } };

    await act(async () => {
      await result.current.mutateAsync(payload);
    });

    expect(api.updateSnapshot).toHaveBeenCalledWith('s1', { notes: 'updated note' });
  });

  it('calls deleteSnapshot API on delete mutation', async () => {
    vi.mocked(api.deleteSnapshot).mockResolvedValue(undefined);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => useDeleteSnapshot(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync('s1');
    });

    expect(api.deleteSnapshot).toHaveBeenCalledWith('s1');
  });
});
