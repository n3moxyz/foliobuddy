import { afterEach, describe, expect, it, vi } from 'vitest';
import { MutationObserver, onlineManager } from '@tanstack/react-query';
import { api, apiForSession } from '../api';
import { AuthSessionChangedError, captureAuthSession, installAuthSession } from '../authSession';
import { createSessionQueryClient } from '../queryClient';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
const jwt = (sub: string, sid: string) =>
  `e30.${btoa(JSON.stringify({ sub, sid })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.signature`;
const login = (owner: string, sid: string) =>
  installAuthSession(owner, sid, async () => jwt(owner, sid));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
afterEach(() => {
  installAuthSession('anonymous', 'anonymous', async () => null, 'local');
  onlineManager.setOnline(true);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
describe('authenticated request and query isolation', () => {
  it.each([
    ['another owner', jwt('b', 'b-session')],
    ['another session of the same owner', jwt('a', 'next-a-session')],
    ['a token without a session id', `e30.${btoa(JSON.stringify({ sub: 'a' }))}.signature`],
    ['an opaque token', 'opaque-token'],
    ['a malformed token', 'not.a.jwt'],
    ['a missing token', null],
  ])(
    'rejects %s before dispatch while the local generation still belongs to A',
    async (_, token) => {
      const session = installAuthSession('a', 'a-session', async () => token);
      const fetch = vi.fn();
      const dispatched = vi.fn();
      vi.stubGlobal('fetch', fetch);
      await expect(
        apiForSession(session).reconcileIbkr(
          {
            action: 'apply',
            kind: 'sync',
            cashPositionId: 'a-cash',
            input: {},
            expectedState: 'reviewed',
          },
          dispatched
        )
      ).rejects.toBeInstanceOf(AuthSessionChangedError);
      expect(captureAuthSession()).toBe(session);
      expect(session.signal.aborted).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
      expect(dispatched).not.toHaveBeenCalled();
    }
  );
  it('accepts a matching session JWT and permits opaque tokens only in an explicit local context', async () => {
    const fetch = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetch);
    login('a', 'a-session');
    await api.getPositions();
    expect(fetch.mock.calls[0]).toEqual([
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: `Bearer ${jwt('a', 'a-session')}` }),
      }),
    ]);
    installAuthSession('demo-user', 'demo-session', async () => 'opaque-demo-token', 'local');
    await api.getPositions();
    expect(fetch.mock.calls).toHaveLength(2);
  });
  it('rejects a token resolved after switching without dispatching under either login', async () => {
    const token = deferred<string>();
    const old = installAuthSession('a', 'a-session', () => token.promise);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const dispatched = vi.fn();
    const result = apiForSession(old).reconcileIbkr(
      {
        action: 'apply',
        kind: 'sync',
        cashPositionId: 'a-cash',
        input: {},
        expectedState: 'reviewed',
      },
      dispatched
    );
    const rejection = expect(result).rejects.toBeInstanceOf(AuthSessionChangedError);
    login('b', 'b-session');
    token.resolve('a-token');
    await rejection;
    expect(fetch).not.toHaveBeenCalled();
    expect(dispatched).not.toHaveBeenCalled();
  });
  it('aborts an in-flight request and discards a late result after A to B to A', async () => {
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    login('a', 'a-session');
    const task = api.getPositions();
    const rejection = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    const signal = (fetch.mock.calls[0] as unknown as [string, RequestInit])[1].signal!;
    login('b', 'b-session');
    login('a', 'new-a-session');
    expect(signal.aborted).toBe(true);
    response.resolve(new Response(JSON.stringify([{ id: 'private-a' }])));
    await rejection;
  });
  it('discards a response whose JSON finishes decoding after the session ends', async () => {
    const body = deferred<unknown>();
    const json = vi.fn(() => body.promise);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 200, json }))
    );
    login('a', 'a-session');
    const task = api.getPositions();
    const rejection = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.waitFor(() => expect(json).toHaveBeenCalledOnce());
    login('b', 'b-session');
    body.resolve([{ id: 'private-a' }]);
    await rejection;
  });
  it('uses a new empty query client for every login and suppresses old mutation errors', async () => {
    const a = login('a', 'a-session');
    const clientA = createSessionQueryClient(a);
    clientA.setQueryData(['positions'], [{ id: 'private-a' }]);
    const b = login('b', 'b-session');
    const clientB = createSessionQueryClient(b);
    expect(clientA.getQueryData(['positions'])).toBeUndefined();
    expect(clientB.getQueryData(['positions'])).toBeUndefined();
    const failed = clientA.getMutationCache().build(clientA, {
      mutationFn: async () => {
        throw new Error('private-a error');
      },
    });
    await expect(failed.execute(undefined)).rejects.toBeInstanceOf(AuthSessionChangedError);
    expect(toast.error).not.toHaveBeenCalled();
    const nextA = createSessionQueryClient(login('a', 'next-a-session'));
    expect(nextA.getQueryData(['positions'])).toBeUndefined();
  });
  it('does not continue a native-cost write after the capability read changes sessions', async () => {
    const response = deferred<Response>();
    const fetch = vi.fn(() => response.promise);
    vi.stubGlobal('fetch', fetch);
    login('a', 'a-session');
    const task = api.updatePosition('a-position', { avgCostNative: 12, costCurrency: 'USD' });
    const rejection = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    login('b', 'b-session');
    response.resolve(new Response(JSON.stringify({ supported: true })));
    await rejection;
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('does not invoke a queued mutation after its optimistic update resumes under B', async () => {
    const pending = deferred<void>();
    const onMutate = vi.fn(() => pending.promise);
    const mutationFn = vi.fn(() => api.updateUserPreferences({ perpExposureUsd: 100 }));
    const onError = vi.fn();
    const onSettled = vi.fn();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = createSessionQueryClient(login('a', 'a-session'));
    const mutation = client
      .getMutationCache()
      .build(client, { onMutate, mutationFn, onError, onSettled });
    const task = mutation.execute(undefined);
    const rejected = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.waitFor(() => expect(onMutate).toHaveBeenCalledOnce());
    login('b', 'b-session');
    pending.resolve(undefined);
    await rejected;
    expect(mutationFn).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(onSettled).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it.each([false, true])(
    'guards replacement observer options after deferred work (switch=%s)',
    async (switchAccount) => {
      const pending = deferred<void>();
      const fetch = vi.fn(async () => new Response('{}'));
      vi.stubGlobal('fetch', fetch);
      const client = createSessionQueryClient(login('a', 'a-session'));
      const cacheOnMutate = vi.fn(() => pending.promise);
      client.getMutationCache().config.onMutate = cacheOnMutate;
      const original = vi.fn(() => api.updateUserPreferences({ perpExposureUsd: 100 }));
      const replacement = vi.fn(() => api.updateUserPreferences({ perpExposureUsd: 200 }));
      const onSuccess = vi.fn();
      const observer = new MutationObserver(client, { mutationFn: original });
      const unsubscribe = observer.subscribe(() => undefined);
      const task = observer.mutate(undefined);
      const result = switchAccount
        ? expect(task).rejects.toBeInstanceOf(AuthSessionChangedError)
        : expect(task).resolves.toEqual({});
      await vi.waitFor(() => expect(cacheOnMutate).toHaveBeenCalledOnce());
      if (switchAccount) login('b', 'b-session');
      observer.setOptions({ mutationFn: replacement, onSuccess });
      pending.resolve(undefined);
      await result;
      expect(original).not.toHaveBeenCalled();
      expect(replacement).toHaveBeenCalledTimes(switchAccount ? 0 : 1);
      expect(fetch).toHaveBeenCalledTimes(switchAccount ? 0 : 1);
      expect(onSuccess).toHaveBeenCalledTimes(switchAccount ? 0 : 1);
      unsubscribe();
    }
  );
  it('rejects a paused mutation when it resumes after A to B', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    onlineManager.setOnline(false);
    const client = createSessionQueryClient(login('a', 'a-session'));
    const mutationFn = vi.fn(() => api.updateUserPreferences({ perpExposureUsd: 100 }));
    const mutation = client.getMutationCache().build(client, { mutationFn });
    const task = mutation.execute(undefined);
    const rejected = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.waitFor(() => expect(mutation.state.isPaused).toBe(true));
    login('b', 'b-session');
    onlineManager.setOnline(true);
    const continuation = expect(mutation.continue()).rejects.toBeInstanceOf(
      AuthSessionChangedError
    );
    await Promise.all([rejected, continuation]);
    expect(mutationFn).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects a scheduled retry after A to B without invoking the mutation again', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const mutationFn = vi.fn(() => api.updateUserPreferences({ perpExposureUsd: 100 }));
    mutationFn.mockRejectedValueOnce(new Error('Transient local failure'));
    const client = createSessionQueryClient(login('a', 'a-session'));
    const mutation = client
      .getMutationCache()
      .build(client, { mutationFn, retry: true, retryDelay: 10 });
    const task = mutation.execute(undefined);
    const rejected = expect(task).rejects.toBeInstanceOf(AuthSessionChangedError);
    await vi.advanceTimersByTimeAsync(0);
    expect(mutation.state.failureCount).toBe(1);
    login('b', 'b-session');
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(mutationFn).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });
});
