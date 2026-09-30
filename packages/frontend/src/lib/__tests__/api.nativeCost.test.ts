import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api';

afterEach(() => vi.unstubAllGlobals());

describe('native position writes during deployment', () => {
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
