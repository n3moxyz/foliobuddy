import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthSetup, useLocalAuthBypassSetup } from '../useAuthSetup';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';

const clerk = vi.hoisted(() => ({
  userId: 'user-a',
  sessionId: 'session-a',
  getToken: vi.fn(async () => 'clerk-token'),
}));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => clerk }));

describe('useAuthSetup', () => {
  beforeEach(() => {
    clerk.userId = 'user-a';
    clerk.sessionId = 'session-a';
    clerk.getToken = vi.fn(async () => 'clerk-token');
  });
  it('installs the owner and token context before exposing a ready session', async () => {
    const hook = renderHook(() => useAuthSetup());
    expect(hook.result.current).toBe(captureAuthSession());
    expect(hook.result.current?.ownerId).toBe('user-a');
    await expect(hook.result.current?.getToken()).resolves.toBe('clerk-token');
    const session = hook.result.current!;
    hook.unmount();
    expect(session.signal.aborted).toBe(true);
  });
  it('ends prior work when accounts switch and never revives an earlier A session', () => {
    const hook = renderHook(() => useAuthSetup());
    const first = hook.result.current!;
    act(() => {
      clerk.userId = 'user-b';
      clerk.sessionId = 'session-b';
      hook.rerender();
    });
    const second = hook.result.current!;
    expect(first.signal.aborted).toBe(true);
    expect(second.ownerId).toBe('user-b');
    act(() => {
      clerk.userId = 'user-a';
      clerk.sessionId = 'session-a';
      hook.rerender();
    });
    expect(isAuthSessionCurrent(first)).toBe(false);
    expect(second.signal.aborted).toBe(true);
    expect(hook.result.current?.generation).not.toBe(first.generation);
  });
  it('gives the local sandbox its own no-token identity', async () => {
    const hook = renderHook(() => useLocalAuthBypassSetup());
    expect(hook.result.current?.ownerId).toBe('sandbox-user');
    await expect(hook.result.current?.getToken()).resolves.toBeNull();
  });
  it('refreshes a getter for the same login without ending work or rotating its cache', async () => {
    const hook = renderHook(() => useAuthSetup());
    const session = hook.result.current!;
    act(() => {
      clerk.getToken = vi.fn(async () => 'refreshed-token');
      hook.rerender();
    });
    expect(hook.result.current).toBe(session);
    expect(session.signal.aborted).toBe(false);
    await expect(session.getToken()).resolves.toBe('refreshed-token');
  });
});
