import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexClient } from '../ibkr-sync-helper/codex-client.mjs';
import { collectCapture } from '../ibkr-sync-helper/capture.mjs';
import {
  privateDirectory,
  savePrivate,
  verifyCheckpoint,
  verifyReadback,
} from '../ibkr-sync-helper/audit.mjs';
import { loadWorkerIdentity, workerDirectory } from './enrollment.mjs';
import { readJson, syncDirectory, writeJson } from './files.mjs';
import { singaporeSchedule } from './schedule.mjs';
import { createSignedClient } from './signed-client.mjs';

const terminal = new Set(['idle', 'verified', 'failed']);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 100;
const errorText = (error) =>
  error instanceof Error ? error.message.slice(0, 4000) : 'Unknown worker failure';

export function nativeChanges(backup, anchor) {
  const positions = backup.after
    .filter((row) => row.id !== anchor)
    .flatMap((row) => {
      const old = backup.before.find((entry) => entry.id === row.id);
      const sameAverage =
        old.avgCostNative === row.avgCostNative ||
        (typeof old.avgCostNative === 'number' &&
          typeof row.avgCostNative === 'number' &&
          old.avgCostNative.toPrecision(15) === row.avgCostNative.toPrecision(15));
      return old.quantity === row.quantity && sameAverage
        ? []
        : [
            {
              id: row.id,
              symbol: row.asset.symbol,
              previousQuantity: old.quantity,
              quantity: row.quantity,
              previousAvgCostNative: old.avgCostNative,
              avgCostNative: row.avgCostNative,
              costCurrency: row.costCurrency,
            },
          ];
    });
  const balances = (rows) =>
    new Map(
      (rows.find((row) => row.id === anchor).ibkrCash?.balances ?? []).map((row) => [
        row.currency,
        row.cashBalance,
      ])
    );
  const before = balances(backup.before);
  const after = balances(backup.after);
  const cash = [...new Set([...before.keys(), ...after.keys()])].sort().flatMap((currency) => {
    const previous = before.get(currency) ?? null;
    const current = after.get(currency) ?? null;
    return previous === current ? [] : [{ currency, previous, current }];
  });
  return { positions, cash };
}

function verifyStatus(status, config, previous) {
  if (
    status?.deviceId !== config.deviceId ||
    status.connectorFingerprint !== config.connectorFingerprint ||
    !id(status.userId) ||
    !id(status.cashPositionId) ||
    status.cashPositionId !== config.cashPositionId ||
    typeof status.blocked !== 'boolean'
  )
    throw new Error('The device grant identity is incomplete or changed.');
  if (
    previous.identity &&
    (previous.identity.userId !== status.userId ||
      previous.identity.cashPositionId !== status.cashPositionId)
  )
    throw new Error('The device grant belongs to a different portfolio or cash anchor.');
}

/** Exactly one run, with permanent local blocking after an uncertain write. */
export async function runWorker({
  root,
  mode = 'tick',
  now = () => new Date(),
  api,
  makeBroker,
  collector = collectCapture,
}) {
  if (!path.isAbsolute(root) || !['once', 'tick'].includes(mode))
    throw new Error('Choose an absolute workspace and --once or --tick.');
  const directory = workerDirectory(root);
  await privateDirectory(path.join(root, '.local'));
  await privateDirectory(directory);
  const stateFile = path.join(directory, 'state.json');
  const lock = path.join(directory, 'run.lock');
  try {
    await mkdir(lock, { mode: 0o700 });
    await syncDirectory(directory);
  } catch (error) {
    if (error.code === 'EEXIST')
      throw new Error(
        'A worker run is active or interrupted. The lock must be reviewed before another sync.'
      );
    throw error;
  }
  let state;
  let audit;
  let client;
  let grant;
  let attemptId;
  let runId;
  let stage = 'worker';
  let mayHaveChanged = false;
  let started = false;
  let retainLock = false;
  const persist = async (next) => {
    state = { ...state, ...next };
    await writeJson(stateFile, state);
  };
  try {
    await writeJson(
      path.join(lock, 'owner.json'),
      { pid: process.pid, startedAt: now().toISOString() },
      { exclusive: true }
    );
    state = await readJson(stateFile, { version: 1, phase: 'idle' });
    if (state?.version !== 1 || !terminal.has(state.phase))
      throw new Error(
        'The previous worker run is blocked or interrupted. Review its saved evidence before resuming.'
      );
    const schedule = singaporeSchedule(now(), state.lastAttemptedDate);
    if (mode === 'tick' && !schedule.due) return { skipped: true, date: schedule.date };
    const { config, privateKey } = await loadWorkerIdentity(root);
    client =
      api ??
      createSignedClient({ audience: config.audience, deviceId: config.deviceId, privateKey, now });
    audit = path.join(root, '.local', 'ibkr-sync', schedule.date, `worker-${randomUUID()}`);
    await privateDirectory(path.dirname(path.dirname(audit)));
    await privateDirectory(path.dirname(audit));
    await privateDirectory(audit);
    await syncDirectory(path.dirname(path.dirname(audit)));
    await syncDirectory(path.dirname(audit));
    await persist({
      version: 1,
      phase: 'checking',
      lastAttemptedDate: schedule.date,
      startedAt: now().toISOString(),
      deviceId: config.deviceId,
      audit,
      attemptId: null,
      runId: null,
      capturedAt: null,
      verifiedAt: null,
    });
    started = true;
    const save = async (name, value) => {
      const checksum = await savePrivate(audit, name, value);
      await syncDirectory(audit);
      return checksum;
    };
    grant = await client.request('status', {});
    verifyStatus(grant, config, state);
    await save('grant-status.json', grant);
    if (grant.blocked) {
      await persist({ phase: 'blocked' });
      throw new Error('The server has an unresolved worker attempt. Owner review is required.');
    }
    await persist({
      phase: 'reading',
      identity: { userId: grant.userId, cashPositionId: grant.cashPositionId },
    });
    stage = 'broker';
    const broker = makeBroker ? makeBroker(config) : new CodexClient(config.binary, root);
    let capture;
    try {
      if ((await broker.connect()) !== config.connectorFingerprint)
        throw new Error(
          'The connected IBKR account changed. Reconnect and authorize the intended device before syncing.'
        );
      capture = await collector(broker, save);
    } finally {
      broker.close();
    }
    stage = 'capture';
    await persist({ phase: 'previewing', capturedAt: capture.second.capturedAt });
    const preview = await client.request('preview', { capture });
    if (id(preview.attemptId)) attemptId = preview.attemptId;
    if (
      !attemptId ||
      preview.applied !== false ||
      !/^[a-f0-9]{64}$/.test(preview.state ?? '') ||
      !preview.backup ||
      !Array.isArray(preview.review) ||
      typeof preview.unchanged !== 'boolean'
    )
      throw new Error('FolioBuddy did not return a complete fresh preview.');
    await persist({ phase: 'checkpoint', attemptId });
    stage = 'checkpoint';
    const verified = verifyCheckpoint(preview.backup, capture, grant.cashPositionId, preview.state);
    if (verified.owner !== grant.userId)
      throw new Error('The checkpoint owner differs from the authorized device grant.');
    const checkpointHash = await save('account-sync-checkpoint.json', preview.backup);
    await save('review.json', {
      attemptId,
      state: preview.state,
      review: preview.review,
      checkpointHash,
    });
    const changes = nativeChanges(preview.backup, grant.cashPositionId);
    const unchanged = changes.positions.length === 0 && changes.cash.length === 0;
    // This marker reaches durable storage before the request can leave the host.
    stage = 'apply';
    mayHaveChanged = true;
    await persist({ phase: 'applying', checkpointHash });
    const applied = await client.request('apply', { attemptId, checkpointHash });
    if (
      applied.attemptId !== attemptId ||
      applied.applied !== true ||
      !id(applied.runId) ||
      typeof applied.unchanged !== 'boolean'
    )
      throw new Error('FolioBuddy did not confirm the applied worker attempt.');
    runId = applied.runId;
    await persist({ phase: 'applied', runId });
    await save('apply-receipt.json', applied);
    stage = 'readback';
    const readback = await client.request('readback', { attemptId });
    if (readback.runId !== runId)
      throw new Error('Independent readback returned a different saved sync.');
    verifyReadback(readback, preview.backup, capture.second.capturedAt);
    const readbackHash = await save('independent-readback.json', readback);
    await persist({ phase: 'readback', readbackHash });
    const complete = await client.request('complete', { attemptId, readbackHash });
    if (
      complete.verified !== true ||
      complete.capturedAt !== capture.second.capturedAt ||
      complete.unchanged !== unchanged
    )
      throw new Error('FolioBuddy did not confirm the verified source timestamp.');
    const result = {
      verified: true,
      attemptId,
      runId,
      deviceId: config.deviceId,
      capturedAt: capture.second.capturedAt,
      verifiedAt: now().toISOString(),
      unchanged,
      changes,
    };
    await save('result.json', result);
    await persist({
      phase: 'verified',
      verifiedAt: result.verifiedAt,
      unchanged: result.unchanged,
    });
    return result;
  } catch (error) {
    if (!started) throw error;
    const blocked = mayHaveChanged || state?.phase === 'blocked';
    let failureReported = false;
    if (client && !blocked) {
      try {
        await client.request('failure', { ...(attemptId ? { attemptId } : {}), stage });
        failureReported = true;
      } catch {
        /* Keep the first error and the local evidence. */
      }
    } else if (client && mayHaveChanged) {
      try {
        await client.request('failure', { ...(attemptId ? { attemptId } : {}), stage });
        failureReported = true;
      } catch {
        /* An unavailable server cannot clear the local block. */
      }
    }
    try {
      await savePrivate(audit, 'incomplete-result.json', {
        verified: false,
        attemptId: attemptId ?? null,
        runId: runId ?? null,
        stage,
        appMayHaveChanged: mayHaveChanged,
        blocked,
        failureReported,
        stoppedAt: now().toISOString(),
        error: errorText(error),
      });
      await syncDirectory(audit);
      await persist({
        phase: blocked ? 'blocked' : 'failed',
        attemptId: attemptId ?? null,
        runId: runId ?? null,
        failedStage: stage,
        failureReported,
      });
    } catch {
      retainLock = true;
    }
    throw new Error(
      blocked
        ? 'The IBKR sync outcome is unverified and future worker writes are blocked. Review the private attempt evidence.'
        : `The IBKR sync stopped during ${stage}. Review the private attempt evidence and app status.`
    );
  } finally {
    if (!retainLock) {
      await rm(lock, { recursive: true });
      await syncDirectory(directory);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, mode] = process.argv.slice(2);
  try {
    if (!['--once', '--tick'].includes(mode) || process.argv.length !== 4)
      throw new Error('Usage: node worker.mjs /absolute/foliobuddy --once|--tick');
    const result = await runWorker({ root, mode: mode.slice(2) });
    if (!result.skipped && (mode === '--once' || !result.unchanged))
      process.stdout.write(
        result.unchanged
          ? 'IBKR synced and independently verified; native holdings and cash are unchanged.\n'
          : 'IBKR synced and independently verified; changes are available in FolioBuddy.\n'
      );
  } catch (error) {
    // Detailed provider/API errors belong exclusively in private attempt receipts.
    process.stderr.write(
      'IBKR worker stopped. Check FolioBuddy and the private worker state; an interrupted or unverified attempt must be reviewed before another write.\n'
    );
    process.exitCode = 1;
  }
}
