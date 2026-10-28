import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';
import {
  AuthSessionChangedError,
  captureAuthSession,
  endAuthSession,
  installAuthSession,
} from '../authSession';

afterEach(() => {
  vi.unstubAllGlobals();
  endAuthSession(captureAuthSession());
});

describe('native position writes during deployment', () => {
  it('does not dispatch an import after the account changes during capability checking', async () => {
    installAuthSession('alice', 'alice-session', async () => null, 'local');
    const fetch = vi.fn().mockImplementation(async () => {
      installAuthSession('bob', 'bob-session', async () => null, 'local');
      return new Response('{"supported":true,"bulkImportIdempotency":true}');
    });
    vi.stubGlobal('fetch', fetch);
    await expect(api.bulkImportPositions([])).rejects.toBeInstanceOf(AuthSessionChangedError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a late import response after the account changes while decoding it', async () => {
    installAuthSession('alice', 'alice-session', async () => null, 'local');
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"supported":true,"bulkImportIdempotency":true}'))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => {
          installAuthSession('bob', 'bob-session', async () => null, 'local');
          return { results: [], successCount: 0, totalCount: 0 };
        },
      });
    vi.stubGlobal('fetch', fetch);
    await expect(api.bulkImportPositions([])).rejects.toBeInstanceOf(AuthSessionChangedError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('blocks imports until the backend guarantees retry protection', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"supported":true}'));
    vi.stubGlobal('fetch', fetch);
    await expect(api.bulkImportPositions([])).rejects.toThrow('temporarily unavailable');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('native-cost-capabilities');
  });

  it('sends the caller request ID unchanged after checking retry protection', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"supported":true,"bulkImportIdempotency":true}'))
      .mockResolvedValueOnce(new Response('{"results":[],"successCount":0,"totalCount":0}'));
    vi.stubGlobal('fetch', fetch);
    const requestId = '6a063ff8-c834-4eb2-98df-3234a6b66918';
    await api.bulkImportPositions([], requestId);
    expect(fetch.mock.calls[1][1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ positions: [], requestId }),
    });
  });

  it('refuses to submit native costs to a backend that has not declared support', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetch);
    await expect(
      api.createPosition({ assetId: 'test', quantity: 10, avgCostNative: 100, costCurrency: 'KRW' })
    ).rejects.toThrow('could not be verified');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain('native-cost-capabilities');
    expect(fetch.mock.calls[0][1].method).toBeUndefined();
  });

  it('preserves native and recorded USD fields when support has been confirmed', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"supported":true}'))
      .mockResolvedValueOnce(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    const data = { quantity: 10, avgCostUsd: 37, avgCostNative: 42000.123456, costCurrency: 'KRW' };
    await api.updatePosition('test', data);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: 'PUT', body: JSON.stringify(data) });
  });

  it('does not add a capability dependency to legacy USD-only edits', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    await api.updatePosition('test', { notes: 'Updated note' });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe('PUT');
  });
});
