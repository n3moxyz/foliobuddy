import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSetup, useLocalAuthBypassSetup } from '../useAuthSetup';
import { setTokenGetter } from '@/lib/api';

const clerkGetToken = vi.fn(async () => 'clerk-token');

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({
    getToken: clerkGetToken,
  }),
}));

vi.mock('@/lib/api', () => ({
  setTokenGetter: vi.fn(),
}));

describe('useAuthSetup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses Clerk getToken for normal authenticated sessions', async () => {
    renderHook(() => useAuthSetup());

    await waitFor(() => expect(setTokenGetter).toHaveBeenCalledWith(clerkGetToken));
  });

  it('uses a no-token getter for local auth bypass sessions', async () => {
    renderHook(() => useLocalAuthBypassSetup());

    await waitFor(() => expect(setTokenGetter).toHaveBeenCalledTimes(1));
    const getter = vi.mocked(setTokenGetter).mock.calls[0][0];
    await expect(getter()).resolves.toBeNull();
  });
});
