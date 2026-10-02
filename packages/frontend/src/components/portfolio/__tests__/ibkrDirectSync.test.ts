import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { installAuthSession } from '@/lib/authSession';
import type { Position } from '@/lib/types';
import {
  checkpointCashChanges,
  getDirectSyncState,
  hasHelperConnection,
  isDirectSyncResultCurrent,
  pairHelper,
  syncIbkrDirect,
} from '../ibkrDirectSync';

const permits = vi.hoisted(() => ({ issue: vi.fn() }));
vi.mock('@/lib/api', () => {
  const api = { getPositions: vi.fn(), reconcileIbkr: vi.fn(), restoreIbkr: vi.fn() };
  return {
    api,
    apiForSession: () => ({
      ...api,
      reconcileIbkr: (input: unknown, onDispatch?: () => void) => {
        onDispatch?.();
        return api.reconcileIbkr(input);
      },
      helperPermit: permits.issue,
    }),
  };
});
let serial = 0;
let id: string;
let order: string[];
const captureTime = '2026-10-01T15:00:00.000Z';
const jobId = 'j'.repeat(43);
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
  installAuthSession('owner-a', `session-${serial}`, async () => 'token-a');
  permits.issue.mockResolvedValue({ permit: 'p'.repeat(43), expiresAt: '2099-01-01T00:00:00Z' });
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
      expect(init.credentials).toBe('omit');
      expect(init.headers).not.toHaveProperty('Authorization');
      if (step === 'health') return { ok: true, json: async () => ({ version: 2 }) } as Response;
      const body = JSON.parse(init.body as string);
      if (step === 'challenge')
        return {
          ok: true,
          json: async () => ({
            challenge: 'c'.repeat(43),
            connectorFingerprint: 'f'.repeat(64),
            operation: body.operation,
            cashPositionId: body.cashPositionId,
            jobId: body.jobId ?? null,
          }),
        } as Response;
      order.push(step);
      expect(body).toMatchObject({ permit: 'p'.repeat(43), challenge: 'c'.repeat(43) });
      const result =
        step === 'capture'
          ? {
              version: 2,
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
  it('pairs and syncs two owners independently without exposing either pairing to the other login', async () => {
    localStorage.clear();
    const firstId = id;
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/pair')) {
        const body = JSON.parse(args[1]?.body as string);
        return {
          ok: true,
          json: async () => ({
            version: 2,
            token: (body.cashPositionId === firstId ? 'a' : 'b').repeat(43),
            cashPositionId: body.cashPositionId,
          }),
        } as Response;
      }
      return normal(...args);
    });
    await pairHelper(id, 'setupCode123');
    await expect(syncIbkrDirect(id)).resolves.toMatchObject({ phase: 'done' });
    installAuthSession('owner-b', 'b-session', async () => 'token-b');
    expect(hasHelperConnection(firstId)).toBe(false);
    expect(getDirectSyncState(firstId)).toEqual({ phase: 'idle' });
    id = `second-${firstId}`;
    await pairHelper(id, 'secondCode12');
    await expect(syncIbkrDirect(id)).resolves.toMatchObject({ phase: 'done' });
    expect(hasHelperConnection(id)).toBe(true);
    expect(
      permits.issue.mock.calls
        .filter(([input]) => input.operation === 'pair')
        .map(([input]) => input.cashPositionId)
    ).toEqual([firstId, id]);
    installAuthSession('owner-a', 'next-a-session', async () => 'token-a');
    expect(hasHelperConnection(firstId)).toBe(true);
    expect(hasHelperConnection(id)).toBe(false);
  });
  it('keeps the starting helper token when browser storage changes mid-sync', async () => {
    const normal = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) => {
      const result = await normal(...args);
      if (String(args[0]).endsWith('/capture')) {
        const storedKey = localStorage.key(0)!;
        localStorage.setItem(storedKey, 'b'.repeat(43));
      }
      if (String(args[0]).endsWith('/checkpoint') || String(args[0]).endsWith('/verify'))
        expect(args[1]?.headers).toMatchObject({ 'X-FolioBuddy-Sync-Token': 'x'.repeat(43) });
      return result;
    });
    await expect(syncIbkrDirect(id)).resolves.toMatchObject({ phase: 'done' });
  });
  it('explains the one-time upgrade for a version 1 helper without clearing its pairing', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ version: 1 }),
    } as Response);
    await expect(syncIbkrDirect(id)).rejects.toThrow('npm run ibkr:helper:setup');
    expect(permits.issue).not.toHaveBeenCalled();
    expect(api.reconcileIbkr).not.toHaveBeenCalled();
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index)!)
      )
    ).toContain('x'.repeat(43));
  });
  it.each(['capture', 'checkpoint'])(
    'cancels a late %s across A to B to A without applying',
    async (endpoint) => {
      const normal = vi.mocked(fetch).getMockImplementation()!;
      let release!: () => void;
      let started!: () => void;
      let signal: AbortSignal | undefined;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.mocked(fetch).mockImplementation(async (...args) => {
        const result = await normal(...args);
        if (String(args[0]).endsWith(`/${endpoint}`)) {
          signal = args[1]?.signal as AbortSignal;
          await new Promise<void>((resolve) => {
            release = resolve;
            started();
          });
        }
        return result;
      });
      const task = syncIbkrDirect(id);
      const rejection = expect(task).rejects.toThrow('signed-in account changed');
      await ready;
      installAuthSession('owner-b', 'b-session', async () => 'token-b');
      installAuthSession('owner-a', 'new-a-session', async () => 'new-token-a');
      expect(signal?.aborted).toBe(true);
      release();
      await rejection;
      expect(
        vi.mocked(api.reconcileIbkr).mock.calls.some(([input]) => input.action === 'apply')
      ).toBe(false);
      expect(getDirectSyncState(id)).toEqual({ phase: 'idle' });
      expect(order).not.toContain('finish');
    }
  );
  it('discards a late pairing result without saving credentials or starting a sync', async () => {
    localStorage.clear();
    const normal = vi.mocked(fetch).getMockImplementation()!;
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.mocked(fetch).mockImplementation(async (...args) => {
      if (String(args[0]).endsWith('/pair')) {
        await new Promise<void>((resolve) => {
          release = resolve;
          started();
        });
        return {
          ok: true,
          json: async () => ({ version: 2, token: 'a'.repeat(43), cashPositionId: id }),
        } as Response;
      }
      return normal(...args);
    });
    const task = pairHelper(id, 'setupCode123');
    const rejection = expect(task).rejects.toThrow('signed-in account changed');
    await ready;
    installAuthSession('owner-b', 'b-session', async () => 'token-b');
    release();
    await rejection;
    expect(localStorage.length).toBe(0);
    expect(api.reconcileIbkr).not.toHaveBeenCalled();
  });
  it('retains an uncertain write for its owner and never requests B permits after apply dispatch', async () => {
    let release!: (result: Awaited<ReturnType<typeof api.reconcileIbkr>>) => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const normal = vi.mocked(api.reconcileIbkr).getMockImplementation()!;
    vi.mocked(api.reconcileIbkr).mockImplementation((input) =>
      input.action === 'apply'
        ? new Promise((resolve) => {
            release = resolve;
            started();
          })
        : normal(input)
    );
    const task = syncIbkrDirect(id);
    const rejection = expect(task).rejects.toThrow('completion is unverified');
    await ready;
    const permitCount = permits.issue.mock.calls.length;
    installAuthSession('owner-b', 'b-session', async () => 'token-b');
    expect(getDirectSyncState(id)).toEqual({ phase: 'idle' });
    release({ applied: true, runId: 'saved-run' } as Awaited<ReturnType<typeof api.reconcileIbkr>>);
    await rejection;
    expect(api.restoreIbkr).not.toHaveBeenCalled();
    expect(permits.issue).toHaveBeenCalledTimes(permitCount);
    installAuthSession('owner-a', 'next-a-session', async () => 'a-token');
    expect(getDirectSyncState(id)).toMatchObject({
      phase: 'error',
      error: expect.stringContaining('completion is unverified'),
    });
  });
  it('requests a distinct owner-authorized permit before every helper mutation', async () => {
    await syncIbkrDirect(id);
    expect(permits.issue.mock.calls.map(([input]) => input.operation)).toEqual([
      'capture',
      'checkpoint',
      'verify',
    ]);
    expect(permits.issue.mock.calls[0][0]).toMatchObject({
      cashPositionId: id,
      jobId: null,
      connectorFingerprint: 'f'.repeat(64),
    });
    expect(permits.issue.mock.calls[1][0].jobId).toHaveLength(43);
    expect(
      Array.from({ length: localStorage.length }, (_, index) =>
        localStorage.getItem(localStorage.key(index)!)
      )
    ).not.toContain('p'.repeat(43));
  });
  it('stops before capture when its owner permit is denied', async () => {
    permits.issue.mockRejectedValue(new Error('This connection belongs to another owner'));
    await expect(syncIbkrDirect(id)).rejects.toThrow('another owner');
    expect(order).not.toContain('capture');
    expect(api.reconcileIbkr).not.toHaveBeenCalled();
  });
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
      if (String(args[0]).endsWith('/finish')) throw new TypeError('Disconnected');
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
    const normalFetch = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (...args) =>
      String(args[0]).endsWith('/checkpoint')
        ? ({ ok: true, json: async () => ({ verified: false }) } as Response)
        : normalFetch(...args)
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
