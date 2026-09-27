#!/usr/bin/env node
/**
 * Local sandbox: the real app (web, API, Postgres) signed in without Clerk,
 * on sample data, so any session can test any change without a password:
 *
 *   npm run sandbox              -> http://localhost:4100
 *   npm run sandbox -- --reset   rebuild the sample data first
 *
 * Works from a fresh worktree with no .env files: installs dependencies when
 * missing, uses a local PostgreSQL on port 5432 (else starts the Docker one
 * from docker-compose.yml), migrates and seeds its own database, then runs
 * both servers (code edits reload live) until Ctrl+C. SANDBOX_PORT moves the
 * web port; the API takes the next one.
 * Node built-ins only: this runs before dependencies are installed.
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = path.join(ROOT, 'packages', 'backend');
const FRONTEND = path.join(ROOT, 'packages', 'frontend');
const WINDOWS = process.platform === 'win32';
const RESET = process.argv.includes('--reset');

const WEB_PORT = Number(process.env.SANDBOX_PORT ?? 4100);
const API_PORT = WEB_PORT + 1;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_URL = `http://localhost:${API_PORT}`;
// docker-compose.yml's container. A fixed project name lets every worktree
// reuse the one container instead of colliding on its fixed name.
const COMPOSE_PROJECT = 'foliobuddy';
const DB_CONTAINER = 'pa-local-db';
// Must match SANDBOX_DATABASE_NAME in packages/backend/src/scripts/sandbox/config.ts.
const DB_NAME = 'foliobuddy_local_sandbox';
// The lockfile's npm version (docs/DEPENDENCIES.md).
const NPM_VERSION = '10.8.2';

const children = [];
let stopping = false;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function log(message) {
  console.log(`[sandbox] ${message}`);
}

function stop(code) {
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
  process.exit(code);
}

function fail(message) {
  console.error(`[sandbox] ${message}`);
  stop(1);
}

function bin(name) {
  return path.join(ROOT, 'node_modules', '.bin', WINDOWS ? `${name}.cmd` : name);
}

// Windows runs npm's .cmd shims only through a shell.
function spawnOptions(command, cwd, env) {
  const shell = WINDOWS && (command.endsWith('.cmd') || command === 'npx');
  return {
    command: shell ? `"${command}"` : command,
    options: { cwd, env: { ...process.env, ...env }, shell },
  };
}

/** Runs a command to completion; its output shows only on failure unless `show`. */
function run(command, args, { cwd = ROOT, env = {}, show = false } = {}) {
  const spec = spawnOptions(command, cwd, env);
  return spawnSync(spec.command, args, {
    ...spec.options,
    stdio: show ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function mustRun(what, command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    fail(`${what} failed.`);
  }
  return result;
}

async function listening(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = createConnection({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
  return (await Promise.all([probe('127.0.0.1'), probe('::1')])).some(Boolean);
}

function ensureDependencies() {
  if (!existsSync(path.join(ROOT, 'node_modules', '.package-lock.json'))) {
    log('Installing dependencies (first run in this checkout)...');
    mustRun('Installing dependencies', 'npx', ['-y', `npm@${NPM_VERSION}`, 'ci'], { show: true });
  }
  mustRun('Generating the Prisma client', bin('prisma'), ['generate'], { cwd: BACKEND });
}

/** A local PostgreSQL on 5432 that trusts the OS user (Homebrew, Postgres.app). */
function localPostgres() {
  const port = ['-h', 'localhost', '-p', '5432'];
  if (run('psql', [...port, '-d', 'postgres', '-tAc', 'SELECT 1']).status !== 0) return null;
  return {
    label: 'local PostgreSQL on port 5432',
    url: `postgresql://${encodeURIComponent(os.userInfo().username)}@localhost:5432/${DB_NAME}`,
    admin: (tool, args) => [tool, [...port, ...args]],
  };
}

/** docker-compose.yml's Postgres on 5433, started if needed. */
async function dockerPostgres() {
  const docker = run('docker', ['info']);
  if (docker.error?.code === 'ENOENT') {
    fail(
      'No local Postgres found. Start one on port 5432 ' +
        '(brew install postgresql@16 && brew services start postgresql@16) or install Docker Desktop.'
    );
  }
  if (docker.status !== 0) {
    if (process.platform !== 'darwin') {
      fail('Docker is not running. Start Docker Desktop, then rerun npm run sandbox.');
    }
    log('Starting Docker Desktop...');
    run('open', ['-a', 'Docker']);
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
      await sleep(2000);
      ready = run('docker', ['info']).status === 0;
    }
    if (!ready)
      fail('Docker did not start within 2 minutes. Start it, then rerun npm run sandbox.');
  }

  const state = run('docker', ['inspect', '-f', '{{.State.Running}}', DB_CONTAINER]);
  if (state.status !== 0) {
    log('Creating the local Postgres container...');
    mustRun('Creating the Postgres container', 'docker', [
      'compose',
      '-p',
      COMPOSE_PROJECT,
      'up',
      '-d',
    ]);
  } else if (state.stdout.trim() !== 'true') {
    mustRun('Starting the Postgres container', 'docker', ['start', DB_CONTAINER]);
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    const ready = run('docker', [
      'exec',
      DB_CONTAINER,
      'pg_isready',
      '-U',
      'dev',
      '-d',
      'postgres',
    ]);
    if (ready.status === 0) {
      return {
        label: 'Docker Postgres on port 5433',
        url: `postgresql://dev:dev@localhost:5433/${DB_NAME}`,
        admin: (tool, args) => ['docker', ['exec', DB_CONTAINER, tool, '-U', 'dev', ...args]],
      };
    }
    await sleep(1000);
  }
  fail('Postgres did not become ready within 30 seconds.');
}

function prepareDatabase(db) {
  const found = run(
    ...db.admin('psql', [
      '-d',
      'postgres',
      '-tAc',
      `SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'`,
    ])
  );
  const exists = found.stdout?.trim() === '1';
  if (exists && RESET) {
    log('Resetting the sandbox database...');
    mustRun('Dropping the sandbox database', ...db.admin('dropdb', ['--force', DB_NAME]));
  }
  if (!exists || RESET) {
    mustRun('Creating the sandbox database', ...db.admin('createdb', [DB_NAME]));
  }
  log('Applying migrations...');
  mustRun('Applying migrations', bin('prisma'), ['migrate', 'deploy'], {
    cwd: BACKEND,
    env: { DATABASE_URL: db.url },
  });
  mustRun('Seeding sample data', bin('tsx'), ['src/scripts/sandbox/seed.ts'], {
    cwd: BACKEND,
    env: { DATABASE_URL: db.url },
    show: true,
  });
}

function start(name, command, args, cwd, env) {
  const spec = spawnOptions(command, cwd, env);
  const child = spawn(spec.command, args, { ...spec.options, stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(child);
  for (const stream of [child.stdout, child.stderr]) {
    let pending = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      const lines = (pending + chunk).split('\n');
      pending = lines.pop();
      for (const line of lines) console.log(`[${name}] ${line}`);
    });
  }
  child.on('exit', (code) => {
    if (!stopping) fail(`The ${name} server stopped (exit ${code ?? 'by signal'}).`);
  });
}

async function waitFor(url, label) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not listening yet.
    }
    await sleep(1000);
  }
  fail(`${label} did not answer at ${url} within 2 minutes.`);
}

async function main() {
  process.on('SIGINT', () => stop(0));
  process.on('SIGTERM', () => stop(0));

  if ((await listening(WEB_PORT)) || (await listening(API_PORT))) {
    fail(
      `Port ${WEB_PORT} or ${API_PORT} is in use. If a sandbox is already running, open ` +
        `${WEB_URL}; otherwise free the port or set SANDBOX_PORT.`
    );
  }
  ensureDependencies();
  const db = localPostgres() ?? (await dockerPostgres());
  log(`Using the ${db.label}.`);
  prepareDatabase(db);

  log('Starting the API and the web app...');
  start(
    'api',
    bin('tsx'),
    ['watch', '--clear-screen=false', 'src/scripts/sandbox/server.ts'],
    BACKEND,
    {
      DATABASE_URL: db.url,
      PORT: String(API_PORT),
      SANDBOX_WEB_ORIGIN: WEB_URL,
    }
  );
  start('web', bin('vite'), ['--port', String(WEB_PORT), '--strictPort'], FRONTEND, {
    VITE_API_URL: `${API_URL}/api/v1`,
    VITE_LOCAL_AUTH_BYPASS: 'true',
    // Keep sandbox errors out of the real Sentry project.
    VITE_SENTRY_DSN: '',
  });
  await Promise.all([waitFor(`${API_URL}/health`, 'The API'), waitFor(WEB_URL, 'The web app')]);
  log(
    `Ready: ${WEB_URL} is signed in as the sandbox user (no Clerk). ` +
      `The API at ${API_URL}/api/v1 needs no auth header. Ctrl+C stops both.`
  );
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
