import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
const fxError = 'IBKR currency cash does not tally with BASE; incomplete capture';
let captureCount: number;
let latestCaptureTime: string;
function brokerCapture(index: number) {
  latestCaptureTime = new Date(Date.parse(captureTime) + index * 30000).toISOString();
  const sample = {
    capturedAt: latestCaptureTime,
    summary: { currency: 'USD' },
    positions: [
      {
        contract_id: 77,
        contract_description: 'TEST @NASDAQ',
        currency: 'USD',
        position: 10,
        average_price: 20,
        asset_class: 'STK',
      },
    ],
    balances: [
      { currency: 'BASE', cash_balance: 100 + index },
      { currency: 'USD', cash_balance: 100 },
    ],
  };
  return { first: structuredClone(sample), second: structuredClone(sample) };
}
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
  captureCount = 0;
  latestCaptureTime = captureTime;
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
          ? {
              version: 1,
              jobId: `${jobId.slice(0, -1)}${captureCount}`,
              capture: brokerCapture(captureCount++),
            }
          : step === 'checkpoint'
            ? { verified: true, state: 'reviewed-state' }
            : step === 'verify'
              ? { verified: true, capturedAt: latestCaptureTime }
              : { verified: false };
      return { ok: true, json: async () => result } as Response;
    })
  );
});
afterEach(() => vi.useRealTimers());

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
  it.each([fxError, 'IBKR cash summary differs from its currency balances'])(
    'closes the rejected preview and applies only a fresh verified capture: %s',
    async (message) => {
      vi.useFakeTimers();
      const normalPreview = vi.mocked(api.reconcileIbkr).getMockImplementation()!;
      vi.mocked(api.reconcileIbkr).mockImplementationOnce(async () => {
        order.push('preview-rejected');
        throw new Error(message);
      });
      const task = syncIbkrDirect(id);
      await vi.advanceTimersByTimeAsync(0);
      expect(getDirectSyncState(id).phase).toBe('retrying');
      expect(order).toEqual(['owner', 'capture', 'preview-rejected', 'finish']);
      await expect(syncIbkrDirect(id)).rejects.toThrow('already running');
      expect(api.restoreIbkr).not.toHaveBeenCalled();
      vi.mocked(api.reconcileIbkr).mockImplementation(normalPreview);
      await vi.advanceTimersByTimeAsync(10000);
      const result = await task;
      expect(result.capturedAt).toBe('2026-10-01T15:00:30.000Z');
      expect(order).toEqual([
        'owner',
        'capture',
        'preview-rejected',
        'finish',
        'owner',
        'capture',
        'owner',
        'preview',
        'owner',
        'checkpoint',
        'apply',
        'readback',
        'verify',
      ]);
      const inputs = vi.mocked(api.reconcileIbkr).mock.calls.map(([input]) => input);
      expect(inputs.filter((input) => input.action === 'apply')).toHaveLength(1);
      expect(inputs.at(-1)?.input).toBe(inputs.at(-2)?.input);
      expect(inputs.at(-1)?.input).not.toBe(inputs[0].input);
    }
  );
  it('stops after three inconsistent fresh captures without a checkpoint or write', async () => {
    vi.useFakeTimers();
    vi.mocked(api.reconcileIbkr).mockRejectedValue(new Error(fxError));
    const task = expect(syncIbkrDirect(id)).rejects.toThrow('three fresh captures');
    await vi.runAllTimersAsync();
    await task;
    expect(captureCount).toBe(3);
    expect(order.filter((step) => step === 'finish')).toHaveLength(3);
    expect(order).not.toContain('checkpoint');
    expect(api.restoreIbkr).not.toHaveBeenCalled();
    expect(vi.mocked(api.reconcileIbkr).mock.calls.every(([i]) => i.action === 'preview')).toBe(
      true
    );
  });
  it.each([
    'IBKR holdings changed between reads; capture again',
    'IBKR currency cash changed between reads; capture again',
    'IBKR securities do not tally with the account summary',
    'IBKR capture must contain two recent reads within three minutes',
    'Unauthorized',
  ])('does not retry other preview failures: %s', async (message) => {
    vi.mocked(api.reconcileIbkr).mockRejectedValue(new Error(message));
    await expect(syncIbkrDirect(id)).rejects.toThrow(message);
    expect(captureCount).toBe(1);
    expect(order).not.toContain('checkpoint');
  });
  it('does not retry an apply even if it returns the same FX error', async () => {
    const normal = vi.mocked(api.reconcileIbkr).getMockImplementation()!;
    vi.mocked(api.reconcileIbkr).mockImplementation(async (input) => {
      if (input.action === 'apply') throw new Error(fxError);
      return normal(input);
    });
    await expect(syncIbkrDirect(id)).rejects.toThrow('completion is unverified');
    expect(captureCount).toBe(1);
  });
  it.each(['quantity', 'average', 'currency', 'cash', 'old-time', 'old-job'])(
    'stops when a fresh retry changes %s',
    async (kind) => {
      vi.useFakeTimers();
      vi.mocked(api.reconcileIbkr).mockRejectedValue(new Error(fxError));
      const normalFetch = vi.mocked(fetch).getMockImplementation()!;
      vi.mocked(fetch).mockImplementation(async (...args) => {
        const result = await normalFetch(...args);
        if (String(args[0]).endsWith('/capture') && captureCount === 2) {
          const data = await result.json();
          for (const sample of [data.capture.first, data.capture.second]) {
            if (kind === 'quantity') sample.positions[0].position++;
            if (kind === 'average') sample.positions[0].average_price++;
            if (kind === 'currency') sample.summary.currency = 'SGD';
            if (kind === 'cash') sample.balances[1].cash_balance++;
            if (kind === 'old-time') sample.capturedAt = captureTime;
          }
          if (kind === 'old-job') data.jobId = `${jobId.slice(0, -1)}0`;
          return { ok: true, json: async () => data } as Response;
        }
        return result;
      });
      const task = expect(syncIbkrDirect(id)).rejects.toThrow(/changed|reused/);
      await vi.runAllTimersAsync();
      await task;
      expect(api.reconcileIbkr).toHaveBeenCalledTimes(1);
      expect(order).not.toContain('checkpoint');
    }
  );
  it('stops if app records change while waiting for fresh FX', async () => {
    vi.useFakeTimers();
    vi.mocked(api.reconcileIbkr).mockRejectedValue(new Error(fxError));
    vi.mocked(api.getPositions)
      .mockResolvedValueOnce([fixture()])
      .mockResolvedValueOnce([{ ...fixture(), quantity: 99 }]);
    const task = expect(syncIbkrDirect(id)).rejects.toThrow('records changed');
    await vi.runAllTimersAsync();
    await task;
    expect(captureCount).toBe(1);
  });
  it.each([3, 4])('stops if app records change during retry read %s', async (read) => {
    vi.useFakeTimers();
    vi.mocked(api.reconcileIbkr).mockRejectedValueOnce(new Error(fxError));
    let reads = 0;
    vi.mocked(api.getPositions).mockImplementation(async () => {
      reads++;
      return [{ ...fixture(), quantity: reads >= read ? 99 : undefined } as Position];
    });
    const task = expect(syncIbkrDirect(id)).rejects.toThrow('records changed');
    await vi.runAllTimersAsync();
    await task;
    expect(captureCount).toBe(2);
    expect(order).not.toContain('checkpoint');
  });
  it('allows quote refreshes and USD projections while preserving the recorded USD ledger', async () => {
    vi.useFakeTimers();
    vi.mocked(api.reconcileIbkr).mockRejectedValueOnce(new Error(fxError));
    let reads = 0;
    vi.mocked(api.getPositions).mockImplementation(async () => {
      reads++;
      return [
        {
          ...fixture(),
          recordedAvgCostUsd: 20,
          avgCostUsd: 20 + reads,
          marketValueUsd: 100 + reads,
          updatedAt: new Date(Date.parse(captureTime) + reads * 1000).toISOString(),
        },
      ];
    });
    const task = syncIbkrDirect(id);
    await vi.runAllTimersAsync();
    await expect(task).resolves.toMatchObject({ phase: 'done' });
    expect(captureCount).toBe(2);
  });
  it('stops if the failed helper job cannot be closed', async () => {
    vi.mocked(api.reconcileIbkr).mockRejectedValue(new Error(fxError));
    const normalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/finish')) throw new Error('Disconnected');
      return normalFetch(...args);
    });
    await expect(syncIbkrDirect(id)).rejects.toThrow('helper could not be reached');
    expect(captureCount).toBe(1);
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
