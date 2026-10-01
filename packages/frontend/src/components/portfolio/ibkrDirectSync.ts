import type { Position, IbkrReconciliationResult } from '@/lib/types';
import { api } from '@/lib/api';
import { isOwnedIbkrPosition } from './ibkrOwnership';

export type SyncPhase =
  | 'idle'
  | 'checking'
  | 'reading'
  | 'reviewing'
  | 'backup'
  | 'saving'
  | 'verifying'
  | 'done'
  | 'error';
export interface DirectSyncState {
  phase: SyncPhase;
  error?: string;
  capturedAt?: string;
  unchanged?: boolean;
  changes?: {
    positions: IbkrReconciliationResult['review'];
    cash: Array<{ currency: string; previous: number | null; current: number | null }>;
  };
}
const initial: DirectSyncState = { phase: 'idle' };
const states = new Map<string, DirectSyncState>();
const listeners = new Set<() => void>();
const key = (id: string) => `foliobuddy-ibkr-helper:${id}`;
const bridge = import.meta.env.DEV ? 'http://127.0.0.1:47684' : 'http://127.0.0.1:47683';
function notify() {
  listeners.forEach((listener) => listener());
}
function update(id: string, state: DirectSyncState) {
  states.set(id, state);
  notify();
}
export function getDirectSyncState(id: string) {
  return states.get(id) ?? initial;
}
export function isSyncBusy(phase: SyncPhase) {
  return !['idle', 'done', 'error'].includes(phase);
}
export function subscribeDirectSync(listener: () => void) {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}
export function hasHelperConnection(id: string) {
  try {
    return /^[A-Za-z0-9_-]{43}$/.test(localStorage.getItem(key(id)) ?? '');
  } catch {
    return false;
  }
}
export function disconnectHelper(id: string) {
  if (isSyncBusy(getDirectSyncState(id).phase))
    throw new Error('Wait for the current sync to finish.');
  localStorage.removeItem(key(id));
  notify();
}

async function helper<T>(endpoint: string, id: string, body: unknown, pairing = false): Promise<T> {
  const token = pairing ? null : localStorage.getItem(key(id));
  if (!pairing && !token) throw new Error('Connect this browser to the Mac helper first.');
  let response: Response;
  try {
    response = await fetch(`${bridge}/v1/${endpoint}`, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-FolioBuddy-Sync-Token': token } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150000),
    });
  } catch {
    throw new Error(
      'The Mac helper could not be reached. Keep this Mac on, start the helper and allow this site local-network access if your browser asks.'
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === 'string' ? data.error : 'The IBKR helper could not complete this step.'
    );
  return data as T;
}

export async function verifyOwnedCashAnchor(id: string) {
  const positions = await api.getPositions();
  const anchor = positions.find((row) => row.id === id);
  if (
    !anchor ||
    !isOwnedIbkrPosition(anchor) ||
    anchor.asset.category !== 'CASH' ||
    anchor.asset.symbol !== 'USD' ||
    anchor.asset.nativeCurrency !== 'USD' ||
    anchor.asset.priceProvider !== 'manual'
  ) {
    throw new Error('Open the owned IBKR USD cash position before connecting or syncing.');
  }
  return anchor;
}

export async function pairHelper(id: string, code: string) {
  if (!/^[A-Za-z0-9_-]{12}$/.test(code.trim()))
    throw new Error('Enter the 12-character code from the Mac helper setup page.');
  if (isSyncBusy(getDirectSyncState(id).phase)) throw new Error('An IBKR sync is already running.');
  await verifyOwnedCashAnchor(id);
  const result = await helper<{ version: number; token: string; cashPositionId: string }>(
    'pair',
    id,
    { code: code.trim(), cashPositionId: id },
    true
  );
  if (
    result.version !== 1 ||
    result.cashPositionId !== id ||
    !/^[A-Za-z0-9_-]{43}$/.test(result.token)
  )
    throw new Error('The helper returned an invalid connection.');
  try {
    localStorage.setItem(key(id), result.token);
  } catch {
    throw new Error(
      'This browser could not save the connection. Enable browser storage, then run helper setup again.'
    );
  }
  notify();
}

export function checkpointCashChanges(backup: unknown, id: string) {
  const checkpoint = backup as { before?: unknown; after?: unknown };
  function balances(rows: unknown) {
    if (!Array.isArray(rows)) throw new Error('The cash checkpoint is incomplete.');
    const anchor = rows.find((row) => row?.id === id);
    if (!anchor) throw new Error('The cash checkpoint has no owned anchor.');
    const result = new Map<string, number>();
    for (const balance of anchor.ibkrCash?.balances ?? []) {
      if (
        typeof balance.currency !== 'string' ||
        typeof balance.cashBalance !== 'number' ||
        !Number.isFinite(balance.cashBalance) ||
        result.has(balance.currency)
      )
        throw new Error('The cash checkpoint contains an invalid currency balance.');
      result.set(balance.currency, balance.cashBalance);
    }
    return result;
  }
  const before = balances(checkpoint?.before);
  const after = balances(checkpoint?.after);
  return [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((currency) => {
    const previous = before.get(currency) ?? null;
    const current = after.get(currency) ?? null;
    return previous === current ? [] : [{ currency, previous, current }];
  });
}

export function isDirectSyncResultCurrent(state: DirectSyncState, position: Position) {
  return (
    !!state.capturedAt &&
    position.ibkrCash?.source === 'ibkr' &&
    Date.parse(state.capturedAt) === Date.parse(position.ibkrCash.capturedAt) &&
    Date.parse(state.capturedAt) === Date.parse(position.ibkrSyncedAt ?? '')
  );
}

/** The owner session remains in this browser; it is never sent to the Mac helper. */
export async function syncIbkrDirect(id: string) {
  if (isSyncBusy(getDirectSyncState(id).phase)) throw new Error('An IBKR sync is already running.');
  update(id, { phase: 'checking' });
  let jobId: string | undefined;
  let appMayHaveChanged = false;
  try {
    await verifyOwnedCashAnchor(id);
    update(id, { phase: 'reading' });
    const capture = await helper<{
      version: number;
      jobId: string;
      capture: { second: { capturedAt: string } };
    }>('capture', id, { cashPositionId: id });
    if (
      capture.version !== 1 ||
      typeof capture.jobId !== 'string' ||
      !/^[a-f0-9-]{36}$/.test(capture.jobId) ||
      !capture.capture?.second?.capturedAt
    )
      throw new Error('The helper returned an incomplete capture.');
    jobId = capture.jobId;
    update(id, { phase: 'reviewing' });
    const preview = await api.reconcileIbkr({
      action: 'preview',
      kind: 'sync',
      cashPositionId: id,
      input: capture.capture,
    });
    if (preview.applied || !preview.state || !preview.backup)
      throw new Error('A fresh preview is required before applying this sync.');
    update(id, { phase: 'backup' });
    const checkpoint = await helper<{ verified: boolean; state: string }>('checkpoint', id, {
      jobId,
      state: preview.state,
      backup: preview.backup,
      review: preview.review,
    });
    if (checkpoint.verified !== true || checkpoint.state !== preview.state)
      throw new Error('The private checkpoint could not be verified. Nothing was applied.');
    const cashChanges = checkpointCashChanges(preview.backup, id);
    update(id, { phase: 'saving' });
    appMayHaveChanged = true;
    const applied = await api.reconcileIbkr({
      action: 'apply',
      kind: 'sync',
      cashPositionId: id,
      input: capture.capture,
      expectedState: preview.state,
    });
    if (!applied.applied || !applied.runId)
      throw new Error('FolioBuddy did not confirm the saved sync.');
    update(id, { phase: 'verifying' });
    // Read-only: checks current financial rows and history hashes against the saved run.
    // There is deliberately no automatic restoration.
    const readback = await api.restoreIbkr(applied.runId, 'preview');
    if (readback.applied || readback.runId !== applied.runId)
      throw new Error('Independent verification returned a different sync.');
    const verified = await helper<{ verified: boolean; capturedAt: string }>('verify', id, {
      jobId,
      readback,
    });
    if (verified.verified !== true || verified.capturedAt !== capture.capture.second.capturedAt)
      throw new Error('The saved broker timestamp could not be verified.');
    const result: DirectSyncState = {
      phase: 'done',
      capturedAt: verified.capturedAt,
      unchanged: applied.unchanged,
      changes: {
        positions: preview.review.filter(
          (row) =>
            !row.cash &&
            (row.quantity !== row.previousQuantity ||
              row.avgCostNative !== row.previousAvgCostNative)
        ),
        cash: cashChanges,
      },
    };
    update(id, result);
    return result;
  } catch (error) {
    if (jobId) {
      try {
        await helper('finish', id, { jobId, appMayHaveChanged });
      } catch {
        /* Preserve the original failure; the helper cannot authorize an app write. */
      }
    }
    const reason = error instanceof Error ? error.message : 'The IBKR sync stopped.';
    const message = appMayHaveChanged
      ? `The sync may have saved, but completion is unverified. ${reason}`
      : reason;
    update(id, { phase: 'error', error: message });
    throw new Error(message);
  }
}

export function recordedBrokerUpdate(position: Position) {
  const time = position.ibkrCash?.capturedAt ?? position.ibkrSyncedAt;
  return {
    label:
      position.ibkrCash?.source === 'manual'
        ? 'Last manual cash edit'
        : 'Last saved broker capture',
    time: time && Number.isFinite(Date.parse(time)) ? time : null,
  };
}
