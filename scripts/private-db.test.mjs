import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'foliobuddy-private-db-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const log = join(dir, 'calls.jsonl');
  for (const command of ['ssh', 'docker']) {
    writeFileSync(
      join(dir, command),
      `#!${process.execPath}
const { appendFileSync, readFileSync, statSync } = require('node:fs');
const args = process.argv.slice(2);
const entry = { command: '${command}', args };
if ('${command}' === 'ssh' && args.includes('-i')) {
  const key = args[args.indexOf('-i') + 1];
  entry.keyMode = statSync(key).mode & 0o777;
  entry.key = readFileSync(key, 'utf8');
}
appendFileSync(process.env.TEST_CALL_LOG, JSON.stringify(entry) + '\\n');
if ('${command}' === 'ssh') {
  process.stdout.write('synthetic dump or check result');
  process.exit(Number(process.env.TEST_SSH_EXIT || 0));
}
process.exit(Number(process.env.TEST_DOCKER_EXIT || 0));
`,
      { mode: 0o700 }
    );
  }
  const env = {
    ...process.env,
    PATH: `${dir}:${process.env.PATH}`,
    TMPDIR: dir,
    TEST_CALL_LOG: log,
    DB_SSH_HOST: 'db-host.example',
    DB_REMOTE_CONTAINER: 'test-postgres',
    DB_SSH_IDENTITY_FILE: '',
    DB_SSH_PRIVATE_KEY: 'synthetic-private-key',
    DB_SSH_KNOWN_HOSTS: 'synthetic-host-key',
  };
  const calls = () =>
    existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
  return { dir, env, calls };
}

test('sync connection check never dumps or restores', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/sync-db.mjs', '--check'], {
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.calls().length, 2);
  assert.ok(f.calls().every(({ args }) => !args.join(' ').match(/pg_dump|pg_restore/)));
  assert.match(f.calls()[1].args.join(' '), /StrictHostKeyChecking=yes/);
});

test('failed production dump never reaches restore and removes the partial file', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/sync-db.mjs'], {
    env: { ...f.env, TEST_SSH_EXIT: '255' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(f.calls().filter(({ args }) => args.includes('pg_restore')).length, 0);
  assert.ok(!readdirSync(f.dir).some((name) => name.startsWith('foliobuddy-db-sync-')));
  assert.doesNotMatch(result.stdout, /refreshed/);
});

test('successful dump restores only the fixed local database in one transaction', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/sync-db.mjs'], {
    env: f.env,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  const restore = f.calls().find(({ args }) => args.includes('pg_restore'));
  assert.equal(restore.command, 'docker');
  assert.ok(restore.args.includes('pa-local-db'));
  assert.ok(restore.args.includes('--single-transaction'));
  assert.ok(restore.args.includes('--exit-on-error'));
  assert.ok(restore.args.includes('postgresql://dev:dev@localhost:5432/example_portfolio_db'));
  assert.ok(!readdirSync(f.dir).some((name) => name.startsWith('foliobuddy-db-sync-')));
});

test('malformed remote container cannot inject a shell command', (t) => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, ['scripts/sync-db.mjs', '--check'], {
    env: { ...f.env, DB_REMOTE_CONTAINER: "db'; touch /tmp/unwanted" },
    encoding: 'utf8',
  });
  assert.equal(result.status, 1);
  assert.equal(f.calls().length, 0);
});

test('CI SSH uses pinned host verification and removes its private key after failure', (t) => {
  const f = fixture(t);
  const result = spawnSync('bash', ['scripts/check-private-db.sh', 'health'], {
    env: { ...f.env, TEST_SSH_EXIT: '255' },
    encoding: 'utf8',
  });
  assert.equal(result.status, 255);
  const call = f.calls()[0];
  assert.ok(call.args.includes('StrictHostKeyChecking=yes'));
  assert.ok(call.args.includes('IdentitiesOnly=yes'));
  assert.equal(call.keyMode, 0o600);
  assert.equal(call.args.at(-1), 'health');
  assert.ok(!existsSync(call.args[call.args.indexOf('-i') + 1]));
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-key/);
});

test('forced command rejects shell commands, extra arguments, and SQL before any database access', (t) => {
  const f = fixture(t);
  for (const command of [
    'sh',
    'health; id',
    'health --extra',
    'owner\nx-health',
    'SELECT * FROM "User"',
    '',
  ]) {
    const result = spawnSync('bash', [resolve('scripts/private-db-read.sh')], {
      env: { ...f.env, SSH_ORIGINAL_COMMAND: command },
      encoding: 'utf8',
    });
    assert.equal(result.status, 64, command);
  }
  assert.equal(f.calls().length, 0);
});
