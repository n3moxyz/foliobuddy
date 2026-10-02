import { access, mkdir, readFile, rename, rm } from 'node:fs/promises';
import { constants } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CodexClient } from '../ibkr-sync-helper/codex-client.mjs';
import { privateDirectory, hash } from '../ibkr-sync-helper/audit.mjs';
import { stopLaunchAgent } from '../ibkr-sync-helper/launch-agent.mjs';
import {
  prepareEnrollment,
  loadWorkerIdentity,
  workerDirectory,
  validCashPositionId,
} from './enrollment.mjs';
import {
  privateRead,
  privateWrite,
  readJson,
  syncDirectory,
  writeJson,
  withWorkerLock,
} from './files.mjs';
import { DEFAULT_AUDIENCE } from './signed-client.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(source, '../..');
const label = 'xyz.foliobuddy.ibkr-worker';
const runtimeFiles = [
  ...['worker', 'schedule', 'signed-client', 'files', 'enrollment', 'setup'].map(
    (name) => `ibkr-sync-worker/${name}.mjs`
  ),
  ...['codex-client', 'capture', 'audit', 'launch-agent'].map(
    (name) => `ibkr-sync-helper/${name}.mjs`
  ),
];
const escapeXml = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export async function stageRuntime({ root, sourceDirectory = path.dirname(source) }) {
  const contents = await Promise.all(
    runtimeFiles.map(async (name) => [
      name,
      await readFile(path.join(sourceDirectory, name), 'utf8'),
    ])
  );
  const revision = hash(contents);
  const versions = path.join(workerDirectory(root), 'runtimes');
  await privateDirectory(versions);
  const runtime = path.join(versions, revision);
  try {
    await access(runtime);
    for (const [name, content] of contents) {
      if ((await privateRead(path.join(runtime, name))) !== content)
        throw new Error('The installed runtime changed. Inspect it before updating.');
    }
    return runtime;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // An existing but incomplete runtime is not silently repaired or replaced.
    try {
      await access(runtime);
      throw new Error(
        'The installed runtime is incomplete or changed. Inspect it before updating.'
      );
    } catch (exists) {
      if (exists.code !== 'ENOENT') throw exists;
    }
  }
  const staging = path.join(versions, `staging-${randomUUID()}`);
  await privateDirectory(staging);
  try {
    for (const [name, content] of contents)
      await privateWrite(path.join(staging, name), content, { exclusive: true });
    await rename(staging, runtime);
    await syncDirectory(versions);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
  return runtime;
}

function launchContext({
  root,
  home = homedir(),
  platform = process.platform,
  uid = process.getuid?.(),
  launchctl = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8' }),
}) {
  if (platform !== 'darwin')
    throw new Error(
      'The scheduled worker installer supports macOS; use --prepare-only for a test setup.'
    );
  if (!path.isAbsolute(root) || !path.isAbsolute(home) || !Number.isInteger(uid))
    throw new Error('An absolute workspace and a local user session are required.');
  return {
    directory: workerDirectory(root),
    domain: `gui/${uid}`,
    plist: path.join(home, 'Library', 'LaunchAgents', `${label}.plist`),
    launchctl,
  };
}

async function installWorkerUnlocked(options) {
  const { root, nodeBinary = process.execPath } = options;
  const { directory, domain, plist, launchctl } = launchContext(options);
  if (!path.isAbsolute(nodeBinary)) throw new Error('An absolute Node binary is required.');
  await access(nodeBinary, constants.X_OK);
  // Reject corrupt/mismatched keys without exposing any private material.
  await loadWorkerIdentity(root);
  const runtime = await stageRuntime({ root });
  const args = [nodeBinary, path.join(runtime, 'ibkr-sync-worker', 'worker.mjs'), root, '--tick'];
  const stdout = path.join(directory, 'worker.log');
  const stderr = path.join(directory, 'worker-error.log');
  for (const file of [stdout, stderr]) {
    try {
      await privateRead(file);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await privateWrite(file, '', { exclusive: true });
    }
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map((value) => `<string>${escapeXml(value)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${escapeXml(root)}</string><key>RunAtLoad</key><true/><key>StartInterval</key><integer>60</integer><key>ProcessType</key><string>Background</string><key>Umask</key><integer>63</integer><key>StandardOutPath</key><string>${escapeXml(stdout)}</string><key>StandardErrorPath</key><string>${escapeXml(stderr)}</string></dict></plist>`;
  stopLaunchAgent(launchctl, `${domain}/${label}`);
  await mkdir(path.dirname(plist), { recursive: true, mode: 0o700 });
  await privateWrite(plist, xml);
  if (
    launchctl('bootstrap', domain, plist).status !== 0 ||
    launchctl('print', `${domain}/${label}`).status !== 0
  )
    throw new Error(
      'The scheduled worker could not be started and verified. Inspect its private log.'
    );
  await writeJson(path.join(directory, 'installation.json'), {
    version: 1,
    runtime,
    plist,
    installedAt: new Date().toISOString(),
    timezone: 'Asia/Singapore',
    hour: 6,
  });
  return { runtime, plist };
}

export async function installWorker(options) {
  const { directory } = launchContext(options);
  return withWorkerLock(directory, 'install', () => installWorkerUnlocked(options));
}

export async function removeWorker(options) {
  const { directory, domain, plist, launchctl } = launchContext(options);
  return withWorkerLock(directory, 'remove', async () => {
    stopLaunchAgent(launchctl, `${domain}/${label}`);
    await rm(plist, { force: true });
    return { removed: true };
  });
}

async function codexBinary(explicit) {
  const candidates = explicit
    ? [explicit]
    : [
        '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
        '/Applications/Codex.app/Contents/Resources/codex',
        '/opt/homebrew/bin/codex',
        '/usr/local/bin/codex',
      ];
  for (const candidate of candidates) {
    if (!path.isAbsolute(candidate)) continue;
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      /* Try another already-installed binary; never install or sign in. */
    }
  }
  throw new Error(
    'An installed signed-in Codex binary is required. Pass its absolute path with --codex.'
  );
}

function parseOptions(args) {
  const options = {};
  const flags = new Set(['prepare-only', 'enable', 'rotate', 'uninstall']);
  const values = new Set(['root', 'audience', 'codex', 'name', 'cash-position-id']);
  for (let index = 0; index < args.length; index++) {
    const key = args[index].replace(/^--/, '');
    if (!args[index].startsWith('--') || key in options || (!flags.has(key) && !values.has(key)))
      throw new Error('Unsupported or repeated installer argument.');
    if (flags.has(key)) options[key] = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--'))
        throw new Error('An installer argument is missing its value.');
      options[key] = value;
    }
  }
  if (options.enable && Object.keys(options).some((key) => !['enable', 'root'].includes(key)))
    throw new Error('Enabling accepts only --enable and an optional --root.');
  if (options.uninstall && Object.keys(options).some((key) => !['uninstall', 'root'].includes(key)))
    throw new Error('Removal accepts only --uninstall and an optional --root.');
  return options;
}

export async function setup(args = process.argv.slice(2)) {
  const options = parseOptions(args);
  const root = options.root ?? defaultRoot;
  if (!path.isAbsolute(root)) throw new Error('The workspace root must be absolute.');
  if (options.uninstall) {
    await removeWorker({ root });
    process.stdout.write(
      'The scheduled IBKR worker is stopped. Device keys, crash guards and private evidence are retained. Revoke the device in FolioBuddy to remove app access.\n'
    );
    return;
  }
  if (options.enable) {
    await installWorker({ root });
    process.stdout.write(
      'Daily IBKR sync is installed for 06:00 Asia/Singapore. Existing keys and unresolved-run guards are preserved.\n'
    );
    return;
  }
  const previous = await readJson(path.join(workerDirectory(root), 'config.json'), null);
  const cashPositionId = options['cash-position-id'] ?? previous?.cashPositionId;
  if (!validCashPositionId(cashPositionId))
    throw new Error(
      'First setup requires --cash-position-id with the owned IBKR cash reference shown in FolioBuddy.'
    );
  const binary = await codexBinary(options.codex);
  const client = new CodexClient(binary, root);
  let fingerprint;
  try {
    fingerprint = await client.connect();
  } finally {
    client.close();
  }
  await prepareEnrollment({
    root,
    binary,
    audience: options.audience ?? DEFAULT_AUDIENCE,
    name: options.name ?? 'Merlin',
    connectorFingerprint: fingerprint,
    cashPositionId,
    rotate: options.rotate === true,
  });
  await stageRuntime({ root });
  process.stdout.write(
    `Public enrollment is ready at ${path.join(workerDirectory(root), 'enrollment.json')}. Register that public JSON in the owned IBKR cash panel within 24 hours. The private key stays on this Mac.\n`
  );
  process.stdout.write(
    'Preparation does not start or replace a schedule. After enrollment and a verified --once run, use --enable.\n'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await setup();
  } catch {
    process.stderr.write(
      'IBKR worker setup stopped. Check the selected paths, existing Codex connection and private worker files; no credentials were printed.\n'
    );
    process.exitCode = 1;
  }
}
