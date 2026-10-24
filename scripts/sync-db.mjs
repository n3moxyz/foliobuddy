import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, openSync, closeSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const config = {};
for (const name of ['.env', '.env.local']) {
  const path = join(root, 'packages/backend', name);
  if (existsSync(path)) Object.assign(config, parseEnv(readFileSync(path, 'utf8')));
}
Object.assign(config, process.env);

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  const checkOnly = process.argv[2] === '--check';
  if (process.argv.length > 3 || (process.argv[2] && !checkOnly))
    throw new Error('Usage: npm run db:sync -- [--check]');
  const host = config.DB_SSH_HOST;
  const container = config.DB_REMOTE_CONTAINER;
  if (!host || !container) {
    throw new Error(
      'Set DB_SSH_HOST and DB_REMOTE_CONTAINER in packages/backend/.env.local. See DEPLOYMENT.md.'
    );
  }
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(host) ||
    !/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/.test(container)
  ) {
    throw new Error('Invalid SSH host or database container name.');
  }
  const ssh = [
    '-T',
    '-o',
    'BatchMode=yes',
    '-o',
    'StrictHostKeyChecking=yes',
    '-o',
    'ConnectTimeout=12',
  ];
  if (config.DB_SSH_IDENTITY_FILE)
    ssh.push('-o', 'IdentitiesOnly=yes', '-i', config.DB_SSH_IDENTITY_FILE);
  if (config.DB_SSH_USER) ssh.push('-l', config.DB_SSH_USER);
  ssh.push('--', host);

  const localUrl = 'postgresql://dev:dev@localhost:5432/example_portfolio_db';
  const local = ['exec', '-i', 'pa-local-db'];
  function run(command, args, options = {}) {
    const result = spawnSync(command, args, {
      stdio: ['ignore', 'inherit', 'inherit'],
      ...options,
    });
    if (result.error || result.status !== 0)
      throw new Error(`${command} failed. No success was recorded.`);
  }

  let temporary;
  try {
    run('docker', [
      ...local,
      'psql',
      localUrl,
      '-XqAt',
      '--set',
      'ON_ERROR_STOP=1',
      '-c',
      'SELECT 1',
    ]);
    if (checkOnly) {
      run('ssh', [
        ...ssh,
        `docker exec '${container}' sh -c 'exec psql -XqAt --set ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "SELECT 1"'`,
      ]);
      console.log(
        'Private production connection and local database connection passed. No data was copied.'
      );
    } else {
      temporary = mkdtempSync(join(tmpdir(), 'foliobuddy-db-sync-'));
      const dump = join(temporary, 'production.dump');
      const output = openSync(dump, 'wx', 0o600);
      try {
        console.log(
          'Reading production through SSH. Local data stays unchanged until the dump completes.'
        );
        run(
          'ssh',
          [
            ...ssh,
            `docker exec '${container}' sh -c 'exec pg_dump --format=custom --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"'`,
          ],
          { stdio: ['ignore', output, 'inherit'] }
        );
      } finally {
        closeSync(output);
      }
      const input = openSync(dump, 'r');
      try {
        run(
          'docker',
          [
            ...local,
            'pg_restore',
            '--dbname',
            localUrl,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            '--exit-on-error',
            '--single-transaction',
          ],
          { stdio: [input, 'inherit', 'inherit'] }
        );
      } finally {
        closeSync(input);
      }
      console.log('Local database refreshed. Production data was not changed.');
    }
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

try {
  main();
} catch (error) {
  fail(error.message);
}
