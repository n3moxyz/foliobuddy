import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { Position } from '@/lib/types';
import {
  checkpointCashChanges,
  getDirectSyncState,
  isDirectSyncResultCurrent,
  pairHelper,
  syncIbkrDirect,
} from '../ibkrDirectSync';

vi.mock('@/lib/api', () => ({
  api: { getPositions: vi.fn(), reconcileIbkr: vi.fn(), restoreIbkr: vi.fn() },
}));
let serial = 0;
let id: string;
let order: string[];
const captureTime = '2026-10-01T15:00:00.000Z';
const jobId = '12345678-1234-1234-1234-123456789abc';
const fixture = () =>
  ({
    id,
    custodyOf: null,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    asset: { category: 'CASH', symbol: 'USD', nativeCurrency: 'USD', priceProvider: 'manual' },
  }) as Position;
beforeEach(() => {
  vi.resetAllMocks();
  id = `cash-${++serial}`;
  order = [];
  localStorage.clear();
  localStorage.setItem(`foliobuddy-ibkr-helper:${id}`, 'x'.repeat(43));
  vi.mocked(api.getPositions).mockImplementation(async () => {
    order.push('owner');
    return [fixture()];
  });
  vi.mocked(api.reconcileIbkr).mockImplementation(async (input) => {
    order.push(input.action);
    return {
      applied: input.action === 'apply',
      state: 'reviewed-state',
      backup: { before: [{ id, ibkrCash: null }], after: [{ id, ibkrCash: { balances: [] } }] },
      cash: {
        source: 'ibkr',
        capturedAt: captureTime,
        baseCurrency: 'USD',
        baseCash: 0,
        baseToUsd: 1,
        netCashUsd: 0,
        balances: [],
      },
      review: [],
      unchanged: true,
      runId: input.action === 'apply' ? 'saved-run' : undefined,
    } as Awaited<ReturnType<typeof api.reconcileIbkr>>;
  });
  vi.mocked(api.restoreIbkr).mockImplementation(async () => {
    order.push('readback');
    return { applied: false, runId: 'saved-run', before: [], after: [], review: [] };
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const step = url.split('/').at(-1)!;
      order.push(step);
      expect(init.credentials).toBe('omit');
      expect(init.headers).not.toHaveProperty('Authorization');
      const result =
        step === 'capture'
          ? { version: 1, jobId, capture: { second: { capturedAt: captureTime } } }
          : step === 'checkpoint'
            ? { verified: true, state: 'reviewed-state' }
            : step === 'verify'
              ? { verified: true, capturedAt: captureTime }
              : { verified: false };
      return { ok: true, json: async () => result } as Response;
    })
  );
});

describe('one-click IBKR orchestration', () => {
  it('reports the reviewed cash baseline including added and removed currencies', () => {
    expect(
      checkpointCashChanges(
        {
          before: [
            {
              id,
              ibkrCash: {
                balances: [
                  { currency: 'USD', cashBalance: 100 },
                  { currency: 'JPY', cashBalance: -200 },
                ],
              },
            },
          ],
          after: [
            {
              id,
              ibkrCash: {
                balances: [
                  { currency: 'USD', cashBalance: 120 },
                  { currency: 'KRW', cashBalance: 300 },
                ],
              },
            },
          ],
        },
        id
      )
    ).toEqual([
      { currency: 'JPY', previous: -200, current: null },
      { currency: 'KRW', previous: null, current: 300 },
      { currency: 'USD', previous: 100, current: 120 },
    ]);
  });
  it('does not keep an undone capture marked verified after restore or a manual edit', () => {
    const state = { phase: 'done' as const, capturedAt: captureTime };
    const saved = {
      ...fixture(),
      ibkrSyncedAt: captureTime,
      ibkrCash: { source: 'ibkr', capturedAt: captureTime },
    } as Position;
    expect(isDirectSyncResultCurrent(state, saved)).toBe(true);
    expect(isDirectSyncResultCurrent(state, fixture())).toBe(false);
    expect(
      isDirectSyncResultCurrent(state, {
        ...saved,
        ibkrSyncedAt: '2026-09-30T00:00:00Z',
        ibkrCash: { ...saved.ibkrCash!, capturedAt: '2026-09-30T00:00:00Z' },
      })
    ).toBe(false);
    expect(
      isDirectSyncResultCurrent(state, {
        ...saved,
        ibkrCash: { ...saved.ibkrCash!, source: 'manual' },
      })
    ).toBe(false);
  });
  it('checks ownership, verifies backup before apply, then independently reads back', async () => {
    await syncIbkrDirect(id);
    expect(order).toEqual([
      'owner',
      'capture',
      'preview',
      'checkpoint',
      'apply',
      'readback',
      'verify',
    ]);
    expect(api.reconcileIbkr).toHaveBeenLastCalledWith(
      expect.objectContaining({
        action: 'apply',
        expectedState: 'reviewed-state',
        cashPositionId: id,
      })
    );
    expect(api.restoreIbkr).toHaveBeenCalledWith('saved-run', 'preview');
    expect(getDirectSyncState(id)).toMatchObject({
      phase: 'done',
      capturedAt: captureTime,
      unchanged: true,
    });
  });
  it.each([{ custodyOf: 'other' }, { storageLocation: 'Tiger' }, { id: 'another-owner' }])(
    'stops before broker reads for an unowned anchor %o',
    async (change) => {
      vi.mocked(api.getPositions).mockResolvedValue([{ ...fixture(), ...change }]);
      await expect(syncIbkrDirect(id)).rejects.toThrow('owned IBKR USD cash');
      expect(fetch).not.toHaveBeenCalled();
      expect(api.reconcileIbkr).not.toHaveBeenCalled();
    }
  );
  it('stops on backup readback failure without applying', async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        ({
          ok: true,
          json: async () =>
            String(url).endsWith('/capture')
              ? { version: 1, jobId, capture: { second: { capturedAt: captureTime } } }
              : { verified: false },
        }) as Response
    );
    await expect(syncIbkrDirect(id)).rejects.toThrow('checkpoint');
    expect(api.reconcileIbkr).toHaveBeenCalledTimes(1);
    expect(getDirectSyncState(id).phase).toBe('error');
  });
  it('never reports success when apply or independent readback is uncertain', async () => {
    vi.mocked(api.restoreIbkr).mockRejectedValue(new Error('Records changed'));
    await expect(syncIbkrDirect(id)).rejects.toThrow('completion is unverified');
    expect(order).not.toContain('verify');
    expect(order.at(-1)).toBe('finish');
    expect(getDirectSyncState(id).phase).toBe('error');
  });
  it('locks immediately so multiple entry points cannot start duplicate syncs', async () => {
    let resolve!: (positions: Position[]) => void;
    vi.mocked(api.getPositions).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const first = syncIbkrDirect(id);
    await expect(syncIbkrDirect(id)).rejects.toThrow('already running');
    resolve([fixture()]);
    await first;
    expect(api.getPositions).toHaveBeenCalledTimes(1);
  });
  it('pairing verifies the owner before handing a one-time code to the helper', async () => {
    vi.mocked(api.getPositions).mockResolvedValue([]);
    await expect(pairHelper(id, 'setupCode123')).rejects.toThrow('owned IBKR');
    expect(fetch).not.toHaveBeenCalled();
  });
});
