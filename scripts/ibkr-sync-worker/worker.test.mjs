import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify, createPublicKey } from 'node:crypto';
import { mkdir, mkdtemp, readFile, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { canonical, hash } from '../ibkr-sync-helper/audit.mjs';
import { createSignedClient } from './signed-client.mjs';
import { prepareEnrollment } from './enrollment.mjs';
import { singaporeSchedule } from './schedule.mjs';

const bytes = (value) => Buffer.from(JSON.stringify(canonical(value)));
const audience = 'http://127.0.0.1:4101';
const fingerprint = 'a'.repeat(64);

async function temporary(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'foliobuddy-worker-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('signed request binds device, audience, path, time, nonce and exact canonical body', async () => {
  const pair = generateKeyPairSync('ed25519');
  const deviceId = '202ec89d-3c56-4a30-bd92-75ff7b43b0f5';
  const body = { capture: { z: 3, first: { value: 1 } } };
  const client = createSignedClient({
    audience,
    deviceId,
    privateKey: pair.privateKey,
    fetchImpl: async (url, options) => {
      assert.equal(url, `${audience}/api/v1/ibkr-device/preview`);
      assert.equal(options.redirect, 'error');
      assert.equal(options.credentials, 'omit');
      const headers = options.headers;
      assert.equal(headers['x-ibkr-device-id'], deviceId);
      const message = {
        version: 1,
        audience,
        deviceId,
        method: 'POST',
        path: '/api/v1/ibkr-device/preview',
        timestamp: headers['x-ibkr-timestamp'],
        nonce: headers['x-ibkr-nonce'],
        bodyHash: hash(JSON.parse(options.body)),
      };
      assert.equal(message.bodyHash, hash(body));
      assert.match(message.nonce, /^[a-f0-9-]{36}$/);
      assert.equal(
        verify(
          null,
          bytes(message),
          pair.publicKey,
          Buffer.from(headers['x-ibkr-signature'], 'base64')
        ),
        true
      );
      assert.equal(
        verify(
          null,
          bytes({ ...message, path: '/api/v1/positions' }),
          pair.publicKey,
          Buffer.from(headers['x-ibkr-signature'], 'base64')
        ),
        false
      );
      return Response.json({ applied: false });
    },
  });
  assert.deepEqual(await client.request('preview', body), { applied: false });
  await assert.rejects(client.request('positions', {}), /Unsupported/);
});

test('signed client refuses unsafe destinations, redirects, oversized and failed responses', async () => {
  const pair = generateKeyPairSync('ed25519');
  const config = {
    audience,
    deviceId: '202ec89d-3c56-4a30-bd92-75ff7b43b0f5',
    privateKey: pair.privateKey,
  };
  for (const unsafe of [
    'http://api.foliobuddy.xyz',
    'https://evil.example',
    'https://api.foliobuddy.xyz/other',
    'http://localhost:4101/?key=value',
  ]) {
    assert.throws(() => createSignedClient({ ...config, audience: unsafe }), /audience/);
  }
  for (const response of [
    new Response('x'.repeat(33), { headers: { 'content-type': 'application/json' } }),
    new Response('{}', { status: 302 }),
    new Response('{}', { status: 401 }),
    new Response('not json', { headers: { 'content-type': 'application/json' } }),
  ]) {
    const client = createSignedClient({
      ...config,
      maxResponseBytes: 32,
      fetchImpl: async () => response,
    });
    await assert.rejects(client.request('status', {}));
  }
});

test('enrollment proof is public, keys are private, and setup preserves identity on rerun', async (t) => {
  const root = await temporary(t);
  const options = {
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  };
  const first = await prepareEnrollment(options);
  const directory = path.join(root, '.local', 'ibkr-worker');
  const privateBefore = await readFile(path.join(directory, 'device-key.pem'), 'utf8');
  const second = await prepareEnrollment({ ...options, now: new Date(Date.now() + 1000) });
  assert.equal(second.deviceId, first.deviceId);
  assert.equal(second.publicKey, first.publicKey);
  assert.notEqual(second.createdAt, first.createdAt);
  assert.equal(await readFile(path.join(directory, 'device-key.pem'), 'utf8'), privateBefore);
  const { signature, ...publicFields } = second;
  assert.equal(
    verify(
      null,
      bytes(publicFields),
      createPublicKey({
        key: Buffer.from(second.publicKey, 'base64'),
        format: 'der',
        type: 'spki',
      }),
      Buffer.from(signature, 'base64')
    ),
    true
  );
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  for (const file of ['device-key.pem', 'config.json', 'enrollment.json']) {
    assert.equal((await stat(path.join(directory, file))).mode & 0o777, 0o600);
  }
  assert.equal(JSON.stringify(second).includes('PRIVATE KEY'), false);
  await assert.rejects(
    prepareEnrollment({ ...options, connectorFingerprint: 'b'.repeat(64) }),
    /changed/
  );
});

test('rotation retains the old key and does not clear a blocked worker state', async (t) => {
  const root = await temporary(t);
  const options = {
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  };
  const first = await prepareEnrollment(options);
  const directory = path.join(root, '.local', 'ibkr-worker');
  const blocked = { version: 1, phase: 'blocked', lastAttemptedDate: '2026-10-02' };
  await writeFile(path.join(directory, 'state.json'), JSON.stringify(blocked), { mode: 0o600 });
  const second = await prepareEnrollment({ ...options, rotate: true, cashPositionId: 'new-cash' });
  assert.notEqual(second.deviceId, first.deviceId);
  assert.equal(second.cashPositionId, 'new-cash');
  const old = await readFile(
    path.join(directory, 'retired', first.deviceId, 'device-key.pem'),
    'utf8'
  );
  assert.match(old, /BEGIN PRIVATE KEY/);
  assert.deepEqual(JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8')), blocked);
});

test('daily scheduling uses Singapore time, handles catch-up and does not repeat a claimed date', () => {
  assert.deepEqual(singaporeSchedule(new Date('2026-10-01T21:59:59Z')), {
    date: '2026-10-02',
    due: false,
  });
  assert.deepEqual(singaporeSchedule(new Date('2026-10-01T22:00:00Z')), {
    date: '2026-10-02',
    due: true,
  });
  assert.deepEqual(singaporeSchedule(new Date('2026-10-02T12:00:00Z'), '2026-10-01'), {
    date: '2026-10-02',
    due: true,
  });
  assert.deepEqual(singaporeSchedule(new Date('2026-10-02T12:00:00Z'), '2026-10-02'), {
    date: '2026-10-02',
    due: false,
  });
  assert.equal(singaporeSchedule(new Date('2026-10-02T12:00:00Z'), '2026-10-03').due, false);
});

// Orchestration tests use fictional broker receipts and an in-memory API, never live access.
const { runWorker } = await import('./worker.mjs');
const { fixtureCapture, fixtureCheckpoint, response } =
  await import('../ibkr-sync-helper/fixtures.test-support.mjs');

async function workerFixture(t, hooks = {}) {
  const root = await temporary(t);
  const enrollment = await prepareEnrollment({
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  });
  const calls = [];
  let preview;
  let capture;
  const api = {
    async request(operation, body) {
      calls.push(operation);
      if (hooks.before) await hooks.before(operation, body, root);
      if (operation === 'status')
        return {
          deviceId: enrollment.deviceId,
          userId: 'fictional-owner',
          cashPositionId: 'cash',
          connectorFingerprint: fingerprint,
          blocked: false,
        };
      if (operation === 'preview') {
        capture = body.capture;
        const fixture = fixtureCheckpoint(capture);
        preview = {
          attemptId: 'attempt-one',
          applied: false,
          unchanged: false,
          state: fixture.state,
          backup: fixture.backup,
          review: [],
        };
        return preview;
      }
      if (operation === 'apply') {
        assert.equal(body.attemptId, 'attempt-one');
        assert.equal(body.checkpointHash, hash(preview.backup));
        const state = JSON.parse(
          await readFile(path.join(root, '.local/ibkr-worker/state.json'), 'utf8')
        );
        assert.equal(state.phase, 'applying');
        assert.equal(state.attemptId, 'attempt-one');
        const backup = JSON.parse(
          await readFile(path.join(state.audit, 'account-sync-checkpoint.json'), 'utf8')
        );
        assert.equal(hash(backup), body.checkpointHash);
        if (hooks.apply) return hooks.apply(body);
        return { ...preview, applied: true, runId: 'sync-one' };
      }
      if (operation === 'readback')
        return {
          applied: false,
          runId: 'sync-one',
          before: preview.backup.before,
          after: preview.backup.after,
          review: [],
        };
      if (operation === 'complete') {
        assert.equal(
          body.readbackHash,
          hash({
            applied: false,
            runId: 'sync-one',
            before: preview.backup.before,
            after: preview.backup.after,
            review: [],
          })
        );
        return { verified: true, unchanged: false, capturedAt: capture.second.capturedAt };
      }
      if (operation === 'failure') return { recorded: true };
      throw new Error('Unsupported fictional API operation.');
    },
  };
  const broker = {
    async connect() {
      calls.push('broker-connect');
      return hooks.fingerprint ?? fingerprint;
    },
    async read(kind) {
      calls.push(`broker-${kind}`);
      if (hooks.broker) return hooks.broker(kind);
      const fixture = fixtureCapture();
      return response(
        kind === 'executions'
          ? { trades: [] }
          : kind === 'summary'
            ? fixture.first.summary
            : { [kind]: fixture.first[kind] }
      );
    },
    close() {
      calls.push('broker-close');
    },
  };
  return {
    root,
    calls,
    api,
    broker,
    options: { root, mode: 'once', api, makeBroker: () => broker },
  };
}

test('worker verifies private checkpoint before apply and independent readback before completion', async (t) => {
  const fixture = await workerFixture(t);
  const result = await runWorker(fixture.options);
  assert.equal(result.verified, true);
  assert.equal(result.unchanged, false);
  assert.equal(result.attemptId, 'attempt-one');
  assert.equal(result.runId, 'sync-one');
  assert.ok(fixture.calls.indexOf('status') < fixture.calls.indexOf('broker-connect'));
  assert.deepEqual(
    [...new Set(fixture.calls.filter((entry) => entry.startsWith('broker-')))].sort(),
    [
      'broker-balances',
      'broker-close',
      'broker-connect',
      'broker-executions',
      'broker-positions',
      'broker-summary',
    ]
  );
  assert.deepEqual(
    fixture.calls.filter((entry) => !entry.startsWith('broker-')),
    ['status', 'preview', 'apply', 'readback', 'complete']
  );
  const state = JSON.parse(
    await readFile(path.join(fixture.root, '.local/ibkr-worker/state.json'), 'utf8')
  );
  assert.equal(state.phase, 'verified');
  const saved = JSON.parse(await readFile(path.join(state.audit, 'result.json'), 'utf8'));
  assert.equal(saved.verified, true);
  for (const file of [
    'first-receipt.json',
    'second-receipt.json',
    'execution-receipt.json',
    'broker-capture.json',
    'account-sync-checkpoint.json',
    'review.json',
    'independent-readback.json',
    'result.json',
  ]) {
    assert.equal((await stat(path.join(state.audit, file))).mode & 0o777, 0o600);
  }
});

test('lost apply response blocks every future run without retrying the write', async (t) => {
  const fixture = await workerFixture(t, {
    apply() {
      throw new Error('Simulated lost response after server commit.');
    },
  });
  await assert.rejects(runWorker(fixture.options), /unverified|blocked/i);
  const state = JSON.parse(
    await readFile(path.join(fixture.root, '.local/ibkr-worker/state.json'), 'utf8')
  );
  assert.equal(state.phase, 'blocked');
  assert.equal(state.attemptId, 'attempt-one');
  assert.equal(fixture.calls.filter((entry) => entry === 'apply').length, 1);
  fixture.calls.length = 0;
  await assert.rejects(runWorker(fixture.options), /blocked|interrupted/i);
  assert.equal(fixture.calls.length, 0);
});

test('a failed checkpoint prevents apply and records only a bounded stage with the server', async (t) => {
  let reported;
  const fixture = await workerFixture(t, {
    async before(operation, body, root) {
      if (operation === 'preview') {
        const state = JSON.parse(
          await readFile(path.join(root, '.local/ibkr-worker/state.json'), 'utf8')
        );
        await writeFile(path.join(state.audit, 'account-sync-checkpoint.json'), '{}', {
          mode: 0o600,
        });
      }
      if (operation === 'failure') reported = body;
    },
  });
  await assert.rejects(runWorker(fixture.options), /stopped|checkpoint/i);
  assert.equal(fixture.calls.includes('apply'), false);
  assert.deepEqual(reported, { attemptId: 'attempt-one', stage: 'checkpoint' });
});

test('mismatched broker connection stops before broker data reads or preview', async (t) => {
  const fixture = await workerFixture(t, { fingerprint: 'b'.repeat(64) });
  await assert.rejects(runWorker(fixture.options), /stopped|connection/i);
  assert.equal(
    fixture.calls.some((entry) => entry === 'broker-positions'),
    false
  );
  assert.equal(fixture.calls.includes('preview'), false);
  assert.equal(fixture.calls.includes('failure'), true);
});

test('daily tick claims a Singapore date once while explicit once may run again', async (t) => {
  const fixture = await workerFixture(t);
  const now = () => new Date();
  // A completed manual run claims the current Singapore date too.
  await runWorker({ ...fixture.options, now });
  const before = fixture.calls.length;
  const tick = await runWorker({ ...fixture.options, now, mode: 'tick' });
  assert.equal(tick.skipped, true);
  assert.equal(fixture.calls.length, before);
  assert.equal((await runWorker({ ...fixture.options, now, mode: 'once' })).verified, true);
});

test('an interrupted marker or existing lock prevents work before any network request', async (t) => {
  const fixture = await workerFixture(t);
  const directory = path.join(fixture.root, '.local/ibkr-worker');
  await writeFile(
    path.join(directory, 'state.json'),
    JSON.stringify({ version: 1, phase: 'applying', attemptId: 'old-attempt' }),
    { mode: 0o600 }
  );
  await assert.rejects(runWorker(fixture.options), /blocked|interrupted/i);
  assert.deepEqual(fixture.calls, []);
});

const { installWorker, removeWorker, stageRuntime } = await import('./setup.mjs');

test('installer stages the entire runtime immutably and updates without replacing a key', async (t) => {
  const root = await temporary(t);
  const options = {
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  };
  const first = await prepareEnrollment(options);
  const runtime = await stageRuntime({ root });
  const again = await stageRuntime({ root });
  assert.equal(runtime, again);
  assert.equal((await stat(path.join(runtime, 'ibkr-sync-worker/worker.mjs'))).mode & 0o777, 0o600);
  assert.equal(
    (await stat(path.join(runtime, 'ibkr-sync-helper/capture.mjs'))).mode & 0o777,
    0o600
  );
  const calls = [];
  const statuses = [113, 0, 0];
  const launchctl = (...args) => {
    calls.push(args);
    return { status: statuses.shift() };
  };
  const home = path.join(root, 'fictional-home');
  const installed = await installWorker({
    root,
    home,
    launchctl,
    platform: 'darwin',
    uid: 501,
    nodeBinary: process.execPath,
  });
  assert.equal(installed.runtime, runtime);
  const plist = await readFile(installed.plist, 'utf8');
  assert.match(plist, /StartInterval<\/key><integer>60/);
  assert.match(plist, /--tick/);
  assert.doesNotMatch(plist, /KeepAlive|StartCalendarInterval|PRIVATE KEY/);
  assert.equal(calls[0][0], 'print');
  assert.equal(calls[1][0], 'bootstrap');
  assert.equal(calls[2][0], 'print');
  const renewed = await prepareEnrollment(options);
  assert.equal(renewed.deviceId, first.deviceId);
});

test('installer refuses a modified runtime and preserves evidence when uninstalling', async (t) => {
  const root = await temporary(t);
  await prepareEnrollment({
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  });
  const runtime = await stageRuntime({ root });
  await writeFile(path.join(runtime, 'ibkr-sync-worker/worker.mjs'), 'tampered', { mode: 0o600 });
  await assert.rejects(stageRuntime({ root }), /changed|mismatch/i);
  const home = path.join(root, 'fictional-home');
  const calls = [];
  await removeWorker({
    root,
    home,
    platform: 'darwin',
    uid: 501,
    launchctl: (...args) => {
      calls.push(args);
      return { status: 113 };
    },
  });
  assert.match(
    await readFile(path.join(root, '.local/ibkr-worker/device-key.pem'), 'utf8'),
    /PRIVATE KEY/
  );
  assert.equal(calls.length, 1);
});

test('corrupt independent readback blocks completion and further writes', async (t) => {
  const fixture = await workerFixture(t);
  const original = fixture.api.request.bind(fixture.api);
  fixture.api.request = async (operation, body) => {
    const result = await original(operation, body);
    if (operation === 'readback') {
      const corrupted = structuredClone(result);
      corrupted.after[1].historyHash = 'modified-history';
      return corrupted;
    }
    return result;
  };
  await assert.rejects(runWorker(fixture.options), /unverified/);
  assert.equal(fixture.calls.includes('complete'), false);
  const state = JSON.parse(
    await readFile(path.join(fixture.root, '.local/ibkr-worker/state.json'), 'utf8')
  );
  assert.equal(state.phase, 'blocked');
  assert.equal(state.runId, 'sync-one');
});

test('a lost completion response remains blocked even after valid independent readback', async (t) => {
  const fixture = await workerFixture(t, {
    before(operation) {
      if (operation === 'complete') throw new Error('Lost final response.');
    },
  });
  await assert.rejects(runWorker(fixture.options), /unverified/);
  const state = JSON.parse(
    await readFile(path.join(fixture.root, '.local/ibkr-worker/state.json'), 'utf8')
  );
  assert.equal(state.phase, 'blocked');
  assert.equal(state.runId, 'sync-one');
  await assert.rejects(runWorker(fixture.options), /blocked/);
});

test('concurrent workers cannot both contact FolioBuddy or read the broker', async (t) => {
  let release;
  let reached;
  const waiting = new Promise((resolve) => {
    release = resolve;
  });
  const ready = new Promise((resolve) => {
    reached = resolve;
  });
  const fixture = await workerFixture(t, {
    async before(operation) {
      if (operation === 'status') {
        reached();
        await waiting;
      }
    },
  });
  const first = runWorker(fixture.options);
  await ready;
  await assert.rejects(runWorker(fixture.options), /active or interrupted/);
  release();
  await first;
  assert.equal(fixture.calls.filter((operation) => operation === 'status').length, 1);
});

test('a server-blocked attempt and wrong checkpoint owner both stop before any apply', async (t) => {
  for (const kind of ['blocked', 'owner']) {
    const fixture = await workerFixture(t);
    const original = fixture.api.request.bind(fixture.api);
    fixture.api.request = async (operation, body) => {
      const result = await original(operation, body);
      if (kind === 'blocked' && operation === 'status') return { ...result, blocked: true };
      if (kind === 'owner' && operation === 'preview') {
        for (const row of [...result.backup.before, ...result.backup.after])
          row.userId = 'a-different-owner';
        result.state = hash({ before: result.backup.before, after: result.backup.after });
      }
      return result;
    };
    await assert.rejects(runWorker(fixture.options), /blocked|stopped/);
    assert.equal(fixture.calls.includes('apply'), false);
    if (kind === 'blocked') assert.equal(fixture.calls.includes('broker-connect'), false);
  }
});

test('failure reporting cannot clear an uncertain apply when the network is unavailable', async (t) => {
  const fixture = await workerFixture(t, {
    before(operation) {
      if (operation === 'apply' || operation === 'failure') throw new Error('Offline.');
    },
  });
  await assert.rejects(runWorker(fixture.options), /unverified/);
  const state = JSON.parse(
    await readFile(path.join(fixture.root, '.local/ibkr-worker/state.json'), 'utf8')
  );
  assert.equal(state.phase, 'blocked');
  assert.equal(state.failureReported, false);
  const result = JSON.parse(
    await readFile(path.join(state.audit, 'incomplete-result.json'), 'utf8')
  );
  assert.equal(result.attemptId, 'attempt-one');
  assert.equal(result.appMayHaveChanged, true);
});

test('native change reporting ignores FX-only changes and names removed currencies', async () => {
  const { nativeChanges } = await import('./worker.mjs');
  const { backup } = fixtureCheckpoint();
  backup.before = structuredClone(backup.after);
  backup.before[0].quantity += 0.99;
  backup.before[0].ibkrCash.netCashUsd += 0.99;
  backup.before[0].ibkrCash.balances[0].fxRateToUsd = 1.001;
  assert.deepEqual(nativeChanges(backup, 'cash'), { positions: [], cash: [] });
  backup.before[0].ibkrCash.balances.push({ currency: 'SGD', cashBalance: -3, fxRateToUsd: 0.8 });
  assert.deepEqual(nativeChanges(backup, 'cash').cash, [
    { currency: 'SGD', previous: -3, current: null },
  ]);
});

test('the first metadata link completes when shares, native costs and cash were already correct', async (t) => {
  const fixture = await workerFixture(t);
  const original = fixture.api.request.bind(fixture.api);
  fixture.api.request = async (operation, body) => {
    const result = await original(operation, body);
    if (operation === 'preview') {
      const oldTime = new Date(
        Date.parse(result.backup.source.first.capturedAt) - 60000
      ).toISOString();
      result.backup.before = structuredClone(result.backup.after);
      result.backup.before[0].ibkrSyncedAt = oldTime;
      result.backup.before[0].ibkrCash.capturedAt = oldTime;
      result.backup.before[1].ibkrSyncedAt = null;
      result.backup.before[1].ibkrContractId = null;
      result.backup.before[1].costCurrency = null;
      result.state = hash({ before: result.backup.before, after: result.backup.after });
      // Reconciliation reports the new contract link; completion reports native changes only.
      result.unchanged = false;
    }
    if (operation === 'complete') return { ...result, unchanged: true };
    return result;
  };
  const result = await runWorker(fixture.options);
  assert.equal(result.verified, true);
  assert.equal(result.unchanged, true);
  assert.deepEqual(result.changes, { positions: [], cash: [] });
  assert.equal(fixture.calls.includes('failure'), false);
});

test('setup install and removal cannot interrupt an active or unresolved worker lock', async (t) => {
  const root = await temporary(t);
  await prepareEnrollment({
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId: 'cash',
    binary: '/fictional/codex',
  });
  const lock = path.join(root, '.local/ibkr-worker/run.lock');
  await mkdir(lock, { mode: 0o700 });
  await writeFile(
    path.join(lock, 'owner.json'),
    JSON.stringify({ pid: process.pid, phase: 'applying' }),
    { mode: 0o600 }
  );
  const calls = [];
  const options = {
    root,
    home: path.join(root, 'fictional-home'),
    platform: 'darwin',
    uid: 501,
    launchctl: (...args) => {
      calls.push(args);
      return { status: 113 };
    },
  };
  await assert.rejects(installWorker(options), /active|interrupted/);
  await assert.rejects(removeWorker(options), /active|interrupted/);
  assert.deepEqual(calls, []);
  assert.equal((await stat(lock)).isDirectory(), true);
});

test('enrollment pins and signs the cash anchor, rejecting missing or changed targets', async (t) => {
  const root = await temporary(t);
  const base = {
    root,
    audience,
    name: 'Fictional Merlin',
    connectorFingerprint: fingerprint,
    binary: '/fictional/codex',
  };
  await assert.rejects(prepareEnrollment(base), /cash|anchor/i);
  const first = await prepareEnrollment({ ...base, cashPositionId: 'cash' });
  assert.equal(first.cashPositionId, 'cash');
  const directory = path.join(root, '.local/ibkr-worker');
  const configBefore = await readFile(path.join(directory, 'config.json'), 'utf8');
  const keyBefore = await readFile(path.join(directory, 'device-key.pem'), 'utf8');
  assert.equal(JSON.parse(configBefore).cashPositionId, 'cash');
  const { signature, ...fields } = first;
  const key = createPublicKey({
    key: Buffer.from(first.publicKey, 'base64'),
    format: 'der',
    type: 'spki',
  });
  assert.equal(verify(null, bytes(fields), key, Buffer.from(signature, 'base64')), true);
  assert.equal(
    verify(
      null,
      bytes({ ...fields, cashPositionId: 'different-cash' }),
      key,
      Buffer.from(signature, 'base64')
    ),
    false
  );
  await assert.rejects(prepareEnrollment({ ...base, cashPositionId: 'different-cash' }), /changed/);
  assert.equal(await readFile(path.join(directory, 'config.json'), 'utf8'), configBefore);
  assert.equal(await readFile(path.join(directory, 'device-key.pem'), 'utf8'), keyBefore);
  const second = await prepareEnrollment({ ...base, cashPositionId: 'cash' });
  assert.equal(second.deviceId, first.deviceId);
  assert.equal(second.cashPositionId, 'cash');
});

test('the first run refuses an unpinned server cash anchor before any broker read', async (t) => {
  const fixture = await workerFixture(t);
  const original = fixture.api.request.bind(fixture.api);
  fixture.api.request = async (operation, body) => {
    const result = await original(operation, body);
    return operation === 'status' ? { ...result, cashPositionId: 'different-cash' } : result;
  };
  await assert.rejects(runWorker(fixture.options), /stopped/);
  assert.equal(
    fixture.calls.some((entry) => entry.startsWith('broker-')),
    false
  );
  assert.equal(fixture.calls.includes('preview'), false);
});
