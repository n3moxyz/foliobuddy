import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import net from 'node:net';
import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { createPermitConsumer } from './permits.mjs';
import { collectCapture, normalizeExecutions, sourceData } from './capture.mjs';
import { hash, savePrivate, verifyCheckpoint, verifyReadback } from './audit.mjs';
import { createHelper, storeState, secretHash } from './server.mjs';
import { fixtureCapture, fixtureCheckpoint, response } from './fixtures.test-support.mjs';
import { stopLaunchAgent } from './launch-agent.mjs';

test('installer verifies stop and preserves registration when unloading fails', () => {
  const service = 'gui/501/fictional.helper';
  for (const statuses of [[113], [0, 0, 113], [0, 113, 113]]) {
    const remaining = [...statuses];
    stopLaunchAgent(() => ({ status: remaining.shift() }), service);
    assert.equal(remaining.length, 0);
  }
  for (const statuses of [[1], [0, 1, 0], [0, 0, 1]]) {
    const remaining = [...statuses];
    assert.throws(
      () => stopLaunchAgent(() => ({ status: remaining.shift() }), service),
      /Nothing was removed/
    );
  }
});

test('fresh complete samples retain source precision and fail an incomplete response', async () => {
  const fixture = fixtureCapture();
  const saved = new Map();
  const calls = [];
  const client = {
    read: async (kind) => {
      calls.push(kind);
      return response(
        kind === 'executions'
          ? { trades: [] }
          : kind === 'summary'
            ? fixture.first.summary
            : { [kind]: fixture.first[kind] }
      );
    },
  };
  const result = await collectCapture(client, async (name, value) => saved.set(name, value));
  assert.equal(calls.filter((name) => name === 'positions').length, 2);
  assert.equal(calls.filter((name) => name === 'summary').length, 2);
  assert.equal(calls.filter((name) => name === 'balances').length, 2);
  assert.equal(result.first.capturedAt, saved.get('first-receipt.json').receivedAt);
  assert.equal(result.second.capturedAt, saved.get('second-receipt.json').receivedAt);
  assert.equal(saved.size, 4);
  assert.throws(() => sourceData({ isError: true, content: [], structuredContent: {} }), /failed/);
  await assert.rejects(
    collectCapture({ read: async () => response({}) }, async () => {}),
    /incomplete/
  );
});

test('closing evidence rejects ambiguous dates, sides, instruments and quantities', () => {
  const trade = {
    sec_type: 'STK',
    trade_time: '2026-10-01T06:00:00Z',
    symbol: 'TEST',
    side: 'SELL',
    size: 2,
    currency: 'USD',
    trade_id: 'one',
  };
  const normalize = (row) =>
    normalizeExecutions(response({ trades: [row] }), '2026-10-01T07:00:00Z');
  assert.equal(normalize(trade)[0].date, '2026-10-01T06:00:00.000Z');
  for (const change of [
    { trade_time: '10/01/2026 06:00' },
    { trade_time: '2026-02-30T06:00:00Z' },
    { trade_time: '2026-10-02T06:00:00Z' },
    { side: 'SLD' },
    { size: 0 },
    { sec_type: 'OPT' },
    { symbol: '' },
  ])
    assert.throws(() => normalize({ ...trade, ...change }));
  assert.deepEqual(normalize({ ...trade, sec_type: 'CASH' }), []);
});

test('checkpoint refuses ownership, ledger/history, source and state mismatches', () => {
  const capture = fixtureCapture();
  const { backup, state } = fixtureCheckpoint(capture);
  assert.equal(verifyCheckpoint(backup, capture, 'cash', state).owner, 'fictional-owner');
  for (const mutate of [
    (b) => {
      b.after[1].avgCostUsd = 999;
    },
    (b) => {
      b.after[1].historyHash = 'changed';
    },
    (b) => {
      b.before[1].storageLocation = 'Tiger';
      b.after[1].storageLocation = 'Tiger';
    },
    (b) => {
      b.before[1].userId = 'someone-else';
      b.after[1].userId = 'someone-else';
    },
    (b) => {
      b.after[1].quantity = 11;
    },
    (b) => {
      b.source.second.capturedAt = '2000-01-01T00:00:00.000Z';
    },
  ]) {
    const changed = structuredClone(backup);
    mutate(changed);
    assert.throws(() =>
      verifyCheckpoint(
        changed,
        capture,
        'cash',
        hash({ before: changed.before, after: changed.after })
      )
    );
  }
  assert.throws(() => verifyCheckpoint(backup, capture, 'cash', 'wrong'), /preview state/);
  for (const target of ['stock', 'cash']) {
    const newer = structuredClone(backup);
    const row = newer.before.find((r) => r.id === target);
    row.ibkrSyncedAt = new Date(Date.parse(capture.first.capturedAt) + 1000).toISOString();
    assert.throws(
      () =>
        verifyCheckpoint(
          newer,
          capture,
          'cash',
          hash({ before: newer.before, after: newer.after })
        ),
      /newer sync or cash edit/
    );
  }
});

test('independent readback verifies all records, history and timestamp', () => {
  const { backup } = fixtureCheckpoint();
  const readback = {
    applied: false,
    runId: 'saved-run',
    before: backup.before,
    after: backup.after,
  };
  verifyReadback(readback, backup, backup.source.second.capturedAt);
  const corrupt = structuredClone(readback);
  corrupt.after[1].avgCostUsd += 1;
  assert.throws(
    () => verifyReadback(corrupt, backup, backup.source.second.capturedAt),
    /histories differ/
  );
  assert.throws(() =>
    verifyReadback({ ...readback, applied: true }, backup, backup.source.second.capturedAt)
  );
});

test('private audit is readable, mode restricted and never overwrites a checkpoint', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'foliobuddy-helper-test-'));
  try {
    assert.equal(await savePrivate(dir, 'checkpoint.json', { safe: true }), hash({ safe: true }));
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
    assert.equal((await stat(path.join(dir, 'checkpoint.json'))).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, 'checkpoint.json'), 'utf8')), {
      safe: true,
    });
    await assert.rejects(savePrivate(dir, 'checkpoint.json', {}), /EEXIST/);
    await assert.rejects(savePrivate(dir, '../escape.json', {}), /filename/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test('permit transport uses fixed API, omits credentials and rejects redirects, oversized or mismatched replies', async () => {
  const request = {
    permit: 'p'.repeat(43),
    challenge: 'c'.repeat(43),
    operation: 'capture',
    cashPositionId: 'cash',
    connectorFingerprint: 'a'.repeat(64),
    jobId: null,
  };
  const { permit: _, ...scope } = request;
  const data = { ...scope, userId: 'fictional-owner' };
  const json = (data) =>
    new Response(JSON.stringify({ data }), { headers: { 'Content-Type': 'application/json' } });
  const consume = createPermitConsumer('https://foliobuddy.xyz', async (url, options) => {
    assert.equal(url, 'https://api.foliobuddy.xyz/api/v1/ibkr-helper/consume');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.deepEqual(options.headers, { 'Content-Type': 'application/json' });
    assert.deepEqual(JSON.parse(options.body), request);
    return json(data);
  });
  assert.deepEqual(await consume(request), data);
  for (const reply of [
    new Response('', { status: 302 }),
    json({ ...data, challenge: 'x'.repeat(43) }),
    json({ ...data, userId: '' }),
    json({ ...data, extra: 'x'.repeat(9000) }),
    new Response('{}'),
  ]) {
    await assert.rejects(
      createPermitConsumer('https://foliobuddy.xyz', async () => reply)(request),
      /could not be verified/
    );
  }
});

test('HTTP helper binds pairing and every operation to fresh owner permits, with replay and session guards', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'foliobuddy-helper-http-'));
  const socket = net.createServer();
  await new Promise((resolve) => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const origin = 'http://localhost:4100';
  const directory = path.join(root, '.local', 'ibkr-helper-sandbox');
  let time = Date.now();
  await storeState(directory, {
    version: 2,
    origin,
    pairCodeHash: secretHash('setupCode123'),
    pairExpiresAt: time + 600000,
    pairAttempts: 0,
  });
  let fingerprint = 'a'.repeat(64);
  let captures = 0;
  let captureDisconnected;
  const capture = fixtureCapture();
  let collectImpl = async () => capture;
  const permits = new Map();
  const server = createHelper({
    root,
    port,
    origin,
    now: () => time,
    makeClient: () => ({
      connect: async () => fingerprint,
      close() {
        captureDisconnected?.();
      },
    }),
    collector: async () => {
      captures++;
      return collectImpl();
    },
    consumePermit: async ({ permit }) => {
      const proof = permits.get(permit);
      permits.delete(permit);
      if (!proof) throw new Error('Permit expired or consumed');
      return proof;
    },
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  let token;
  const post = (endpoint, body, headers = {}, signal) =>
    fetch(`http://127.0.0.1:${port}/v1/${endpoint}`, {
      method: 'POST',
      headers: {
        Origin: origin,
        'Content-Type': 'application/json',
        ...(token ? { 'X-FolioBuddy-Sync-Token': token } : {}),
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });
  const challenge = async (operation, body = {}) => {
    const response = await post('challenge', {
      operation,
      cashPositionId: 'cash',
      jobId: null,
      ...body,
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  };
  const issue = (scope, overrides = {}) => {
    const permit = randomBytes(32).toString('base64url');
    permits.set(permit, { ...scope, userId: 'fictional-owner', ...overrides });
    return permit;
  };
  const prepared = async (operation, body = {}) => {
    const scope = await challenge(operation, body);
    return { cashPositionId: 'cash', ...body, challenge: scope.challenge, permit: issue(scope) };
  };
  const authorized = async (operation, body = {}) =>
    post(operation, await prepared(operation, body));
  try {
    for (const body of [null, [], 'invalid', 123])
      assert.equal((await post('challenge', body)).status, 400);
    assert.equal((await post('capture', {}, { Origin: 'https://evil.example' })).status, 403);
    const badHost = await new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port,
          path: '/v1/capture',
          method: 'POST',
          headers: {
            Host: `evil.example:${port}`,
            Origin: origin,
            'Content-Type': 'application/json',
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        }
      );
      req.on('error', reject);
      req.end('{}');
    });
    assert.equal(badHost, 403);
    assert.equal((await post('capture', {})).status, 401);
    assert.equal(
      (await post('challenge', { operation: 'pair', code: 'wrong', cashPositionId: 'cash' }))
        .status,
      403
    );
    const paired = await (await authorized('pair', { code: 'setupCode123' })).json();
    token = paired.token;
    assert.equal(paired.version, 2);
    assert.equal(token.length, 43);
    const stored = JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(stored.userId, 'fictional-owner');
    assert.equal(stored.token, undefined);
    assert.equal((await post('capture', { cashPositionId: 'cash' })).status, 503);
    assert.equal(captures, 0);
    assert.equal(
      (await post('challenge', { operation: 'capture', cashPositionId: 'other-owner' })).status,
      409
    );
    for (const substitution of [
      { userId: 'other-owner' },
      { cashPositionId: 'other-cash' },
      { connectorFingerprint: 'b'.repeat(64) },
      { operation: 'pair' },
      { challenge: 'z'.repeat(43) },
      { jobId: 'j'.repeat(43) },
    ]) {
      const scope = await challenge('capture');
      const rejected = await post('capture', {
        cashPositionId: 'cash',
        challenge: scope.challenge,
        permit: issue(scope, substitution),
      });
      assert.equal(rejected.status, 503);
      assert.equal(captures, 0, 'Cross-user authorization must fail before broker reads');
      assert.equal((await rejected.json()).capture, undefined);
    }
    const expired = await prepared('capture');
    time += 60001;
    assert.equal((await post('capture', expired)).status, 503);
    time -= 60001;
    assert.equal(captures, 0);
    fingerprint = 'b'.repeat(64);
    assert.equal((await authorized('capture')).status, 503);
    assert.equal(captures, 0);
    fingerprint = 'a'.repeat(64);
    const challengesAtOnce = await Promise.all(
      Array.from({ length: 24 }, () =>
        post('challenge', { operation: 'capture', cashPositionId: 'cash' })
      )
    );
    assert.ok(challengesAtOnce.filter((r) => r.status === 200).length <= 16);
    assert.ok(challengesAtOnce.some((r) => r.status === 409));
    time += 60001;
    const replay = await prepared('capture');
    const started = await (await post('capture', replay)).json();
    assert.equal(started.jobId.length, 43);
    assert.equal(captures, 1);
    assert.equal((await post('capture', replay)).status, 409);
    assert.equal((await authorized('verify', { jobId: started.jobId, readback: {} })).status, 409);
    const { backup, state } = fixtureCheckpoint(capture);
    const wrongBackup = structuredClone(backup);
    for (const rows of [wrongBackup.before, wrongBackup.after])
      for (const row of rows) row.userId = 'other-owner';
    assert.equal(
      (
        await authorized('checkpoint', {
          jobId: started.jobId,
          backup: wrongBackup,
          state: hash({ before: wrongBackup.before, after: wrongBackup.after }),
          review: [],
        })
      ).status,
      409
    );
    assert.equal(
      (await authorized('checkpoint', { jobId: started.jobId, backup, state, review: [] })).status,
      200
    );
    const guard = JSON.parse(await readFile(path.join(directory, 'pending-sync.json'), 'utf8'));
    assert.equal(guard.appMayHaveChanged, true);
    assert.equal(guard.owner, 'fictional-owner');
    for (const flag of [undefined, null, 'false']) {
      assert.equal(
        (await authorized('finish', { jobId: started.jobId, appMayHaveChanged: flag })).status,
        409
      );
      assert.equal(
        JSON.parse(await readFile(path.join(directory, 'pending-sync.json'), 'utf8'))
          .appMayHaveChanged,
        true
      );
    }
    const completed = await (
      await authorized('verify', {
        jobId: started.jobId,
        readback: { applied: false, runId: 'saved', before: backup.before, after: backup.after },
      })
    ).json();
    assert.equal(completed.verified, true);
    assert.equal(completed.capturedAt, capture.second.capturedAt);
    await assert.rejects(readFile(path.join(directory, 'pending-sync.json')), /ENOENT/);
    assert.equal((await post('capture', replay)).status, 503);
    assert.equal((await post('arbitrary-tool', { tool: 'place_order' })).status, 404);
    // Distinct server permits still cannot consume a helper challenge twice.
    const scope = await challenge('capture');
    const replies = await Promise.all(
      [1, 2].map(() =>
        post('capture', {
          cashPositionId: 'cash',
          challenge: scope.challenge,
          permit: issue(scope),
        })
      )
    );
    assert.equal(replies.filter((r) => r.status === 200).length, 1);
    const concurrentJob = await replies.find((r) => r.status === 200).json();
    await authorized('finish', { jobId: concurrentJob.jobId, appMayHaveChanged: false });
    let release, startedCollect;
    const collecting = new Promise((resolve) => {
      startedCollect = resolve;
    });
    collectImpl = () =>
      new Promise((resolve) => {
        release = resolve;
        startedCollect();
      });
    const abort = new AbortController();
    const lost = post('capture', await prepared('capture'), {}, abort.signal);
    await collecting;
    const disconnected = new Promise((resolve) => {
      captureDisconnected = resolve;
    });
    abort.abort();
    await assert.rejects(lost, /abort/i);
    await disconnected;
    release(capture);
    collectImpl = async () => capture;
    await new Promise((resolve) => setImmediate(resolve));
    const retry = await authorized('capture');
    assert.equal(retry.status, 200, await retry.clone().text());
    const last = await retry.json();
    await authorized('checkpoint', { jobId: last.jobId, backup, state, review: [] });
    await authorized('finish', { jobId: last.jobId, appMayHaveChanged: true });
    assert.equal(
      (await post('challenge', { operation: 'capture', cashPositionId: 'cash' })).status,
      409
    );
    assert.equal(
      JSON.parse(await readFile(path.join(directory, 'pending-sync.json'), 'utf8'))
        .appMayHaveChanged,
      true
    );
    await storeState(directory, { ...stored, version: 1 });
    assert.equal((await post('capture', replay)).status, 401, 'Legacy pairing fails closed');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true });
  }
});
