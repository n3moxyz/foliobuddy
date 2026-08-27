import { act, renderHook, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import type { UserPreferences } from '@/lib/types';
import { usePerpExposure } from '@/hooks/usePerpExposure';
import { USER_PREFERENCES_QUERY_KEY } from '@/hooks/useUserPreferences';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';

vi.mock('@/lib/api', () => ({
  api: {
    getUserPreferences: vi.fn(),
    updateUserPreferences: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
  },
}));

const CURRENT_STORAGE_KEY = 'foliobuddy-perp-exposure';
const LEGACY_STORAGE_KEY = 'pa-portfolio-perp-exposure';

function preferences(perpExposureUsd: number | null): UserPreferences {
  return {
    snapshotHour: 5,
    snapshotTimezone: 'Asia/Singapore',
    perpExposureUsd,
  };
}

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

describe('usePerpExposure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    focusManager.setFocused(undefined);
  });

  it('uses the server value on a second device with empty local storage', async () => {
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(350_000));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(result.current.perpExposure).toBe(350_000));
    expect(api.updateUserPreferences).not.toHaveBeenCalled();
  });

  it('refreshes the server value whenever the app regains focus', async () => {
    vi.mocked(api.getUserPreferences)
      .mockResolvedValueOnce(preferences(100_000))
      .mockResolvedValueOnce(preferences(350_000));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(result.current.perpExposure).toBe(100_000));
    act(() => {
      focusManager.setFocused(false);
    });
    act(() => {
      focusManager.setFocused(true);
    });

    await waitFor(() => expect(api.getUserPreferences).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.perpExposure).toBe(350_000));
  });

  it('uploads a positive legacy value once, clears both keys after success, and stays silent', async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, '125000');
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(null));
    vi.mocked(api.updateUserPreferences).mockResolvedValue(preferences(125_000));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result, rerender } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() =>
      expect(api.updateUserPreferences).toHaveBeenCalledWith({ perpExposureUsd: 125_000 })
    );
    await waitFor(() => expect(result.current.perpExposure).toBe(125_000));
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();

    rerender();
    expect(api.updateUserPreferences).toHaveBeenCalledTimes(1);
  });

  it('keeps the legacy value until migration succeeds across a route change', async () => {
    localStorage.setItem(CURRENT_STORAGE_KEY, '350000');
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(null));
    const deferred = createDeferred<UserPreferences>();
    vi.mocked(api.updateUserPreferences).mockReturnValue(deferred.promise);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const firstRoute = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(api.updateUserPreferences).toHaveBeenCalledTimes(1));
    expect(queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)).toEqual(
      preferences(null)
    );
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBe('350000');

    firstRoute.unmount();
    const secondRoute = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(secondRoute.result.current.isSaving).toBe(true));
    expect(api.updateUserPreferences).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBe('350000');

    await act(async () => {
      deferred.resolve(preferences(350_000));
      await deferred.promise;
    });

    await waitFor(() => expect(secondRoute.result.current.perpExposure).toBe(350_000));
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBeNull();
  });

  it('lets an explicit server zero win over stale local values', async () => {
    localStorage.setItem(CURRENT_STORAGE_KEY, '350000');
    localStorage.setItem(LEGACY_STORAGE_KEY, '250000');
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(0));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(result.current.perpExposure).toBe(0));
    expect(api.updateUserPreferences).not.toHaveBeenCalled();
    await waitFor(() => expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBeNull());
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it('optimistically saves a manual value and rolls the shared cache back on failure', async () => {
    const deferred = createDeferred<UserPreferences>();
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(null));
    vi.mocked(api.updateUserPreferences).mockReturnValue(deferred.promise);

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      expect(result.current.savePerpExposure(350_000)).toBe(true);
    });

    await waitFor(() => expect(result.current.perpExposure).toBe(350_000));
    expect(queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)).toEqual(
      preferences(350_000)
    );

    await act(async () => {
      deferred.reject(new Error('offline'));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.perpExposure).toBe(0));
    expect(queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)).toEqual(
      preferences(null)
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('uses perp-specific success copy for manual save and delete', async () => {
    vi.mocked(api.getUserPreferences).mockResolvedValue(preferences(null));
    vi.mocked(api.updateUserPreferences)
      .mockResolvedValueOnce(preferences(350_000))
      .mockResolvedValueOnce(preferences(0));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    const { result } = renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.savePerpExposure(350_000);
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Perp exposure saved'));

    act(() => {
      result.current.savePerpExposure(0);
    });
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Perp exposure removed'));
  });

  it('keeps legacy data when an older server response omits the field and migration fails', async () => {
    localStorage.setItem(CURRENT_STORAGE_KEY, '350000');
    vi.mocked(api.getUserPreferences).mockResolvedValue({
      snapshotHour: 5,
      snapshotTimezone: 'Asia/Singapore',
    } as UserPreferences);
    vi.mocked(api.updateUserPreferences).mockRejectedValue(new Error('backend not upgraded'));

    const queryClient = createTestQueryClient();
    const wrapper = createQueryClientWrapper(queryClient);
    renderHook(() => usePerpExposure(), { wrapper });

    await waitFor(() => expect(api.updateUserPreferences).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(queryClient.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)).toEqual({
        snapshotHour: 5,
        snapshotTimezone: 'Asia/Singapore',
      })
    );
    expect(localStorage.getItem(CURRENT_STORAGE_KEY)).toBe('350000');
  });
});
