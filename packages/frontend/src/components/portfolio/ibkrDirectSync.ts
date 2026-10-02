import type { Position, IbkrReconciliationResult } from '@/lib/types';
import { apiForSession, type IbkrHelperChallenge, type IbkrHelperOperation } from '@/lib/api';
import {
  assertAuthSession,
  captureAuthSession,
  combinedSignal,
  isAuthSessionCurrent,
  AuthSessionChangedError,
  type AuthSession,
} from '@/lib/authSession';
import { isOwnedIbkrPosition } from './ibkrOwnership';
import { ibkrRetryBaseline, isIbkrFxTimingError } from './ibkrCaptureRetry';

export type SyncPhase =
  | 'idle'
  | 'checking'
  | 'reading'
  | 'retrying'
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
const states = new Map<string, { session: AuthSession; state: DirectSyncState }>();
const uncertain = new Map<string, DirectSyncState>();
const listeners = new Set<() => void>();
const ownerKey = (id: string, session: AuthSession) => JSON.stringify([session.ownerId, id]);
const key = (id: string, session: AuthSession) => `foliobuddy-ibkr-helper:${ownerKey(id, session)}`;
const legacyKey = (id: string) => `foliobuddy-ibkr-helper:${id}`;
const bridge = import.meta.env.DEV ? 'http://127.0.0.1:47684' : 'http://127.0.0.1:47683';
function notify() {
  listeners.forEach((listener) => listener());
}
function update(id: string, state: DirectSyncState, session: AuthSession) {
  if (!isAuthSessionCurrent(session)) return;
  states.set(ownerKey(id, session), { session, state });
  notify();
}
export function getDirectSyncState(id: string) {
  const session = captureAuthSession();
  const saved = states.get(ownerKey(id, session));
  return saved?.session === session
    ? saved.state
    : (uncertain.get(ownerKey(id, session)) ?? initial);
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
    return /^[A-Za-z0-9_-]{43}$/.test(readHelperToken(id, captureAuthSession()) ?? '');
  } catch {
    return false;
  }
}
export function disconnectHelper(id: string) {
  if (isSyncBusy(getDirectSyncState(id).phase))
    throw new Error('Wait for the current sync to finish.');
  localStorage.removeItem(key(id, captureAuthSession()));
  localStorage.removeItem(legacyKey(id));
  notify();
}

function readHelperToken(id: string, session: AuthSession) {
  return localStorage.getItem(key(id, session)) ?? localStorage.getItem(legacyKey(id));
}
type OperationContext = {
  session: AuthSession;
  id: string;
  token: string | null;
  api: ReturnType<typeof apiForSession>;
  versionChecked?: boolean;
};
async function helperFetch<T>(
  endpoint: string,
  context: OperationContext,
  body: unknown,
  method = 'POST'
): Promise<T> {
  assertAuthSession(context.session);
  const signal = combinedSignal(context.session.signal, AbortSignal.timeout(150000));
  try {
    const response = await fetch(`${bridge}/v1/${endpoint}`, {
      method,
      mode: 'cors',
      credentials: 'omit',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        ...(context.token ? { 'X-FolioBuddy-Sync-Token': context.token } : {}),
      },
      body: JSON.stringify(body),
      signal: signal.signal,
    });
    assertAuthSession(context.session);
    const data = await response.json();
    assertAuthSession(context.session);
    if (!response.ok)
      throw new Error(
        typeof data.error === 'string'
          ? data.error
          : 'The IBKR helper could not complete this step.'
      );
    return data as T;
  } catch (error) {
    if (!isAuthSessionCurrent(context.session)) throw new AuthSessionChangedError();
    if (error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError')
      throw error;
    throw new Error(
      'The Mac helper could not be reached. Keep this Mac on, start the helper and allow this site local-network access if your browser asks.'
    );
  } finally {
    signal.dispose();
  }
}

async function helper<T>(
  operation: IbkrHelperOperation,
  context: OperationContext,
  body: { jobId?: string; code?: string; [field: string]: unknown }
): Promise<T> {
  if (operation !== 'pair' && !context.token)
    throw new Error('Connect this browser to the Mac helper first.');
  if (!context.versionChecked) {
    const health = await helperFetch<{ version: number }>('health', context, undefined, 'GET');
    if (health.version !== 2)
      throw new Error(
        'Update the Mac helper once: run npm run ibkr:helper:setup on this Mac, then reconnect this browser.'
      );
    context.versionChecked = true;
  }
  const jobId = body.jobId ?? null;
  const challenge = await helperFetch<IbkrHelperChallenge>('challenge', context, {
    cashPositionId: context.id,
    operation,
    ...(jobId ? { jobId } : {}),
    ...(operation === 'pair' ? { code: body.code } : {}),
  });
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(challenge.challenge) ||
    !/^[a-f0-9]{64}$/.test(challenge.connectorFingerprint) ||
    challenge.operation !== operation ||
    challenge.cashPositionId !== context.id ||
    challenge.jobId !== jobId
  )
    throw new Error('The Mac helper returned a different account or operation challenge.');
  const permit = await context.api.helperPermit({
    cashPositionId: context.id,
    challenge: challenge.challenge,
    connectorFingerprint: challenge.connectorFingerprint,
    operation,
    jobId,
  });
  assertAuthSession(context.session);
  if (!/^[A-Za-z0-9_-]{43}$/.test(permit.permit) || !Number.isFinite(Date.parse(permit.expiresAt)))
    throw new Error('FolioBuddy did not authorize the helper operation.');
  return helperFetch<T>(operation, context, {
    ...body,
    permit: permit.permit,
    challenge: challenge.challenge,
  });
}

async function readOwnedIbkrState(id: string, session = captureAuthSession()) {
  const positions = await apiForSession(session).getPositions();
  assertAuthSession(session);
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
  // Price refreshes also bump updatedAt. Compare stored financial/identity fields,
  // leaving quoted prices, current-FX projections and derived P&L out of the guard.
  const revision = JSON.stringify(
    positions
      .filter(isOwnedIbkrPosition)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((row) => ({
        id: row.id,
        assetId: row.assetId,
        asset: [
          row.asset.symbol,
          row.asset.category,
          row.asset.nativeCurrency,
          row.asset.priceProvider,
          row.asset.providerAssetId,
        ],
        quantity: row.quantity,
        avgCostUsd: row.recordedAvgCostUsd ?? row.avgCostUsd,
        avgCostNative: row.avgCostNative,
        costCurrency: row.costCurrency,
        ibkrContractId: row.ibkrContractId,
        ibkrSyncedAt: row.ibkrSyncedAt,
        ibkrCash: row.ibkrCash,
        notes: row.notes,
        custodyOf: row.custodyOf,
        storageType: row.storageType,
        storageLocation: row.storageLocation,
      }))
  );
  return { anchor, revision };
}

export async function verifyOwnedCashAnchor(id: string) {
  return (await readOwnedIbkrState(id)).anchor;
}

export async function pairHelper(id: string, code: string) {
  const session = captureAuthSession();
  if (!/^[A-Za-z0-9_-]{12}$/.test(code.trim()))
    throw new Error('Enter the 12-character code from the Mac helper setup page.');
  if (isSyncBusy(getDirectSyncState(id).phase)) throw new Error('An IBKR sync is already running.');
  await readOwnedIbkrState(id, session);
  const context = { id, session, token: null, api: apiForSession(session) };
  const result = await helper<{ version: number; token: string; cashPositionId: string }>(
    'pair',
    context,
    { code: code.trim(), cashPositionId: id }
  );
  if (
    result.version !== 2 ||
    result.cashPositionId !== id ||
    !/^[A-Za-z0-9_-]{43}$/.test(result.token)
  )
    throw new Error('The helper returned an invalid connection.');
  assertAuthSession(session);
  try {
    localStorage.setItem(key(id, session), result.token);
    localStorage.removeItem(legacyKey(id));
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
  const session = captureAuthSession();
  assertAuthSession(session);
  const boundApi = apiForSession(session);
  const context = { id, session, token: readHelperToken(id, session), api: boundApi };
  const stateKey = ownerKey(id, session);
  if (isSyncBusy(getDirectSyncState(id).phase)) throw new Error('An IBKR sync is already running.');
  uncertain.delete(stateKey);
  update(id, { phase: 'checking' }, session);
  let jobId: string | undefined;
  let appMayHaveChanged = false;
  const changedSession = () => {
    if (appMayHaveChanged)
      uncertain.set(stateKey, {
        phase: 'error',
        error:
          'The sync may have saved, but completion is unverified. Review the original account’s saved checkpoint before another sync.',
      });
    states.delete(stateKey);
    notify();
  };
  session.signal.addEventListener('abort', changedSession, { once: true });
  try {
    const owned = await readOwnedIbkrState(id, session);
    assertAuthSession(session);
    // Migrate an old anchor-only pairing only after the current owner proves the anchor.
    if (context.token) {
      localStorage.setItem(key(id, session), context.token);
      localStorage.removeItem(legacyKey(id));
    }
    async function requireUnchangedApp() {
      if ((await readOwnedIbkrState(id, session)).revision !== owned.revision)
        throw new Error('Your IBKR records changed during the sync. Start a new sync.');
    }
    let capture!: {
      version: number;
      jobId: string;
      capture: { second: { capturedAt: string } };
    };
    let preview!: IbkrReconciliationResult;
    let previous: ReturnType<typeof ibkrRetryBaseline> | undefined;
    const jobs = new Set<string>();
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) await requireUnchangedApp();
      update(id, { phase: 'reading' }, session);
      capture = await helper<typeof capture>('capture', context, { cashPositionId: id });
      if (
        capture.version !== 2 ||
        typeof capture.jobId !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(capture.jobId) ||
        !capture.capture?.second?.capturedAt
      )
        throw new Error('The helper returned an incomplete capture.');
      jobId = capture.jobId;
      if (jobs.has(jobId))
        throw new Error('The helper reused an earlier capture. Start a new sync.');
      jobs.add(jobId);
      if (previous) {
        const next = ibkrRetryBaseline(capture.capture);
        if (next.nativeState !== previous.nativeState)
          throw new Error(
            'IBKR holdings or native cash changed during the sync. Start a new sync.'
          );
        if (next.firstTime <= previous.secondTime)
          throw new Error('The helper reused an earlier capture. Start a new sync.');
        await requireUnchangedApp();
      }
      update(id, { phase: 'reviewing' }, session);
      try {
        preview = await boundApi.reconcileIbkr({
          action: 'preview',
          kind: 'sync',
          cashPositionId: id,
          input: capture.capture,
        });
        assertAuthSession(session);
        if (previous) await requireUnchangedApp();
        break;
      } catch (error) {
        if (!isIbkrFxTimingError(error)) throw error;
        if (attempt === 3)
          throw new Error(
            'IBKR’s currency balances and account total still disagree after three fresh captures. Nothing was saved. Try again shortly.'
          );
        previous = ibkrRetryBaseline(capture.capture);
        // End the rejected job before reading again. Never retry an apply,
        // checkpoint, access error, changed record or uncertain readback.
        const finished = await helper<{ verified: boolean }>('finish', context, {
          jobId,
          appMayHaveChanged: false,
        });
        if (finished.verified !== false)
          throw new Error('The previous capture could not be closed. Start a new sync.');
        jobId = undefined;
        update(id, { phase: 'retrying' }, session);
        await retryDelay(session);
      }
    }
    if (preview.applied || !preview.state || !preview.backup)
      throw new Error('A fresh preview is required before applying this sync.');
    update(id, { phase: 'backup' }, session);
    const checkpoint = await helper<{ verified: boolean; state: string }>('checkpoint', context, {
      jobId,
      state: preview.state,
      backup: preview.backup,
      review: preview.review,
    });
    if (checkpoint.verified !== true || checkpoint.state !== preview.state)
      throw new Error('The private checkpoint could not be verified. Nothing was applied.');
    const cashChanges = checkpointCashChanges(preview.backup, id);
    assertAuthSession(session);
    update(id, { phase: 'saving' }, session);
    const applied = await boundApi.reconcileIbkr(
      {
        action: 'apply',
        kind: 'sync',
        cashPositionId: id,
        input: capture.capture,
        expectedState: preview.state,
      },
      () => {
        appMayHaveChanged = true;
      }
    );
    assertAuthSession(session);
    if (!applied.applied || !applied.runId)
      throw new Error('FolioBuddy did not confirm the saved sync.');
    update(id, { phase: 'verifying' }, session);
    // Read-only: checks current financial rows and history hashes against the saved run.
    // There is deliberately no automatic restoration.
    const readback = await boundApi.restoreIbkr(applied.runId, 'preview');
    assertAuthSession(session);
    if (readback.applied || readback.runId !== applied.runId)
      throw new Error('Independent verification returned a different sync.');
    const verified = await helper<{ verified: boolean; capturedAt: string }>('verify', context, {
      jobId,
      readback,
    });
    assertAuthSession(session);
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
    uncertain.delete(stateKey);
    update(id, result, session);
    return result;
  } catch (error) {
    if (jobId && isAuthSessionCurrent(session)) {
      try {
        await helper('finish', context, { jobId, appMayHaveChanged });
      } catch {
        /* Preserve the original failure; the helper cannot authorize an app write. */
      }
    }
    const reason = error instanceof Error ? error.message : 'The IBKR sync stopped.';
    const message = appMayHaveChanged
      ? `The sync may have saved, but completion is unverified. ${reason}`
      : reason;
    if (appMayHaveChanged && isAuthSessionCurrent(session))
      uncertain.set(stateKey, { phase: 'error', error: message });
    update(id, { phase: 'error', error: message }, session);
    throw new Error(message);
  } finally {
    session.signal.removeEventListener('abort', changedSession);
  }
}

function retryDelay(session: AuthSession) {
  assertAuthSession(session);
  return new Promise<void>((resolve, reject) => {
    const cancelled = () => {
      window.clearTimeout(timer);
      reject(new AuthSessionChangedError());
    };
    const timer = window.setTimeout(() => {
      session.signal.removeEventListener('abort', cancelled);
      resolve();
    }, 10000);
    session.signal.addEventListener('abort', cancelled, { once: true });
  });
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
