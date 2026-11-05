import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { UserPreferences } from '@/lib/types';
import { USER_PREFERENCES_QUERY_KEY, useUpdateUserPreferences } from '../useUserPreferences';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';

vi.mock('@/lib/api', () => ({ api: { updateUserPreferences: vi.fn() } }));
afterEach(() => vi.resetAllMocks());

describe('preference cache updates', () => {
  it.each(['success', 'failure'])(
    'preserves newer reduction defaults after a delayed schedule %s',
    async (outcome) => {
      const initial: UserPreferences = {
        snapshotHour: 5,
        snapshotTimezone: 'Asia/Singapore',
        perpExposureUsd: null,
        reducePercentages: [25, 50, 75, 100],
      };
      let resolve!: (value: UserPreferences) => void;
      let reject!: (error: Error) => void;
      vi.mocked(api.updateUserPreferences).mockReturnValue(
        new Promise((yes, no) => {
          resolve = yes;
          reject = no;
        })
      );
      const client = createTestQueryClient();
      client.setQueryData(USER_PREFERENCES_QUERY_KEY, initial);
      const { result } = renderHook(() => useUpdateUserPreferences(), {
        wrapper: createQueryClientWrapper(client),
      });
      act(() => result.current.mutate({ snapshotHour: 6 }));
      await waitFor(() => expect(api.updateUserPreferences).toHaveBeenCalled());
      act(() =>
        client.setQueryData(USER_PREFERENCES_QUERY_KEY, {
          ...initial,
          snapshotHour: 6,
          reducePercentages: [10, 20, 60, 100],
        })
      );
      await act(async () => {
        if (outcome === 'success') resolve({ ...initial, snapshotHour: 6 });
        else reject(new Error('Offline'));
      });
      await waitFor(() => expect(result.current.isPending).toBe(false));
      const saved = client.getQueryData<UserPreferences>(USER_PREFERENCES_QUERY_KEY)!;
      expect(saved.reducePercentages).toEqual([10, 20, 60, 100]);
      expect(saved.snapshotHour).toBe(outcome === 'success' ? 6 : 5);
    }
  );
});
