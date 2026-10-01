import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual, createHash } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CodexClient } from './codex-client.mjs';
import { collectCapture } from './capture.mjs';
import { privateDirectory, savePrivate, verifyCheckpoint, verifyReadback } from './audit.mjs';

export const ORIGINS = [
  'https://foliobuddy.xyz',
  'http://localhost:4100',
  'http://127.0.0.1:4100',
  'http://localhost:4000',
];
export const secretHash = (value) => createHash('sha256').update(value).digest('hex');
function matchesSecret(value, expected) {
  if (typeof value !== 'string' || typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))
    return false;
  return timingSafeEqual(Buffer.from(secretHash(value), 'hex'), Buffer.from(expected, 'hex'));
}
export async function storeState(directory, state) {
  await privateDirectory(directory);
  const temporary = path.join(directory, `state-${randomUUID()}.json`);
  await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
  await rename(temporary, path.join(directory, 'state.json'));
}
async function bodyOf(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('The sync request is too large.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('The sync request is invalid.');
  }
}

export function createHelper({
  root,
  origin,
  port,
  binary = 'codex',
  makeClient = () => new CodexClient(binary, root),
  collector = collectCapture,
}) {
  if (!ORIGINS.includes(origin) || !Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Unsupported helper origin or port.');
  const directory = path.join(
    root,
    '.local',
    origin === 'https://foliobuddy.xyz' ? 'ibkr-helper' : 'ibkr-helper-sandbox'
  );
  let active = null;
  let reading = false;
  let pairing = false;
  const loadState = async () =>
    JSON.parse(await readFile(path.join(directory, 'state.json'), 'utf8'));
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status, data) => {
      if (res.destroyed) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data));
    };
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== origin) {
      send(403, { error: 'This browser is not allowed to use the IBKR helper.' });
      return;
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-FolioBuddy-Sync-Token');
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
      send(200, {});
      return;
    }
    if (req.method === 'GET' && req.url === '/v1/health') {
      send(200, { version: 1 });
      return;
    }
    if (
      req.method !== 'POST' ||
      req.headers['content-type']?.split(';')[0].trim() !== 'application/json'
    ) {
      send(405, { error: 'Use a supported sync action.' });
      return;
    }
    let state;
    try {
      state = await loadState();
    } catch {
      send(503, { error: 'Run the one-time IBKR helper setup on this Mac.' });
      return;
    }
    if (state.origin !== origin) {
      send(403, { error: 'The helper is paired to a different app.' });
      return;
    }
    if (req.url === '/v1/pair') {
      if (pairing || reading || active) {
        send(409, { error: 'Finish the current connection or sync first.' });
        return;
      }
      pairing = true;
      let client;
      try {
        const body = await bodyOf(req);
        if (
          !/^[A-Za-z0-9_-]{1,100}$/.test(body.cashPositionId ?? '') ||
          Date.now() > state.pairExpiresAt ||
          state.pairAttempts >= 5 ||
          !matchesSecret(body.code, state.pairCodeHash)
        ) {
          await storeState(directory, { ...state, pairAttempts: (state.pairAttempts ?? 0) + 1 });
          send(403, { error: 'The setup code is invalid or expired. Run helper setup again.' });
          return;
        }
        client = makeClient();
        const fingerprint = await client.connect();
        const token = randomBytes(32).toString('base64url');
        await storeState(directory, {
          version: 1,
          origin,
          cashPositionId: body.cashPositionId,
          fingerprint,
          tokenHash: secretHash(token),
          pairedAt: new Date().toISOString(),
        });
        send(200, { version: 1, token, cashPositionId: body.cashPositionId });
      } catch (error) {
        send(503, { error: error.message });
      } finally {
        client?.close();
        pairing = false;
      }
      return;
    }
    if (!matchesSecret(req.headers['x-foliobuddy-sync-token'], state.tokenHash)) {
      send(401, { error: 'Connect this browser to the Mac helper again.' });
      return;
    }
    if (req.url === '/v1/capture') {
      if (reading || pairing || (active && Date.now() - active.startedAt < 15 * 60000)) {
        send(409, { error: 'An IBKR sync is already running. Wait for its result.' });
        return;
      }
      reading = true;
      let client;
      let abandoned = false;
      const disconnected = () => {
        if (res.writableEnded) return;
        abandoned = true;
        client?.close();
      };
      res.on('close', disconnected);
      try {
        const body = await bodyOf(req);
        if (body.cashPositionId !== state.cashPositionId)
          throw new Error('The helper is paired to a different IBKR cash position.');
        const id = randomUUID();
        const date = new Date().toISOString().slice(0, 10);
        const audit = path.join(root, '.local', 'ibkr-sync', date, `button-${id}`);
        await privateDirectory(path.dirname(path.dirname(audit)));
        await privateDirectory(path.dirname(audit));
        const save = (name, value) => savePrivate(audit, name, value);
        client = makeClient();
        if (abandoned) throw new Error('The browser disconnected. Start a fresh sync.');
        const fingerprint = await client.connect();
        if (fingerprint !== state.fingerprint)
          throw new Error('The connected IBKR account changed. Reconnect this Mac before syncing.');
        const capture = await collector(client, save);
        if (abandoned) throw new Error('The browser disconnected. Start a fresh sync.');
        active = {
          id,
          startedAt: Date.now(),
          capture,
          save,
          anchor: state.cashPositionId,
          phase: 'captured',
        };
        send(200, { version: 1, jobId: id, capture });
      } catch (error) {
        active = null;
        send(503, { error: error.message });
      } finally {
        res.off('close', disconnected);
        client?.close();
        reading = false;
      }
      return;
    }
    if (!['/v1/checkpoint', '/v1/verify', '/v1/finish'].includes(req.url)) {
      send(404, { error: 'Unsupported sync action.' });
      return;
    }
    let job;
    try {
      const body = await bodyOf(req);
      job = active;
      if (
        !job ||
        body.jobId !== job.id ||
        job.anchor !== state.cashPositionId ||
        job.busy ||
        Date.now() - job.startedAt > 15 * 60000
      )
        throw new Error('The sync session changed or expired. Start a new sync.');
      job.busy = true;
      if (req.url === '/v1/checkpoint') {
        if (job.phase !== 'captured') throw new Error('The sync checkpoint was already reviewed.');
        verifyCheckpoint(body.backup, job.capture, job.anchor, body.state);
        const checksum = await job.save('account-sync-checkpoint.json', body.backup);
        await job.save('review.json', {
          state: body.state,
          review: body.review,
          checkpointChecksum: checksum,
        });
        job.backup = body.backup;
        job.phase = 'backed-up';
        send(200, { verified: true, state: body.state, checkpointChecksum: checksum });
      } else if (req.url === '/v1/verify') {
        if (job.phase !== 'backed-up') throw new Error('A verified checkpoint is required first.');
        verifyReadback(body.readback, job.backup, job.capture.second.capturedAt);
        await job.save('independent-readback.json', body.readback);
        await job.save('result.json', {
          verified: true,
          runId: body.readback.runId,
          capturedAt: job.capture.second.capturedAt,
          verifiedAt: new Date().toISOString(),
        });
        const capturedAt = job.capture.second.capturedAt;
        active = null;
        send(200, { verified: true, capturedAt });
      } else {
        // Never claim success on cancellation, timeout, failed apply or lost readback.
        await job.save('incomplete-result.json', {
          verified: false,
          appMayHaveChanged: body.appMayHaveChanged === true,
          stoppedAt: new Date().toISOString(),
        });
        active = null;
        send(200, { verified: false });
      }
    } catch (error) {
      send(409, { error: error.message });
    } finally {
      if (job) job.busy = false;
    }
  });
  server.requestTimeout = 150000;
  server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [root, origin, port, binary] = process.argv.slice(2);
  if (!root || !path.isAbsolute(root)) throw new Error('An absolute workspace path is required.');
  const server = createHelper({ root, origin, port: Number(port), binary });
  server.on('error', () => {
    process.stderr.write(
      'FolioBuddy IBKR helper could not listen. Check whether it is already running.\n'
    );
    process.exitCode = 1;
  });
  server.listen(Number(port), '127.0.0.1', () =>
    process.stdout.write('FolioBuddy IBKR helper ready.\n')
  );
}
