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

async function connectCodex(binary, root) {
  const client = new CodexClient(binary, root);
  try {
    return await client.connect();
  } finally {
    client.close();
  }
}

/** Quote one word for a POSIX shell, leaving plain flags and references readable. */
const shellWord = (value) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;

/**
 * Fixed refusals from setup and the modules it calls. None names a path, key, account or
 * provider output, so the owner sees the reason. Any other error keeps the generic line.
 */
export const PRINTABLE_SETUP_REFUSALS = new Set([
  // setup.mjs
  'Unsupported or repeated installer argument.',
  'An installer argument is missing its value.',
  'Enabling accepts only --enable and an optional --root.',
  'Removal accepts only --uninstall and an optional --root.',
  'The workspace root must be absolute.',
  'First setup requires --cash-position-id with the owned IBKR cash reference shown in FolioBuddy.',
  'An installed signed-in Codex binary is required. Pass its absolute path with --codex.',
  'The scheduled worker installer supports macOS; use --prepare-only for a test setup.',
  'An absolute workspace and a local user session are required.',
  'An absolute Node binary is required.',
  'The scheduled worker could not be started and verified. Inspect its private log.',
  'The installed runtime changed. Inspect it before updating.',
  'The installed runtime is incomplete or changed. Inspect it before updating.',
  // enrollment.mjs
  'An absolute workspace is required.',
  'Absolute workspace and Codex paths are required.',
  'The connector fingerprint is invalid.',
  'The existing owned IBKR cash anchor is required. Pass --cash-position-id with its public position reference.',
  'The device name is invalid.',
  'The FolioBuddy server, IBKR connection or cash position changed since this Mac was set up. If only the IBKR connection changed, disconnect this Mac in FolioBuddy, then rerun setup with --rotate. Moving it to another server or cash position needs owner review.',
  'A key without configuration exists. Inspect the interrupted setup before continuing.',
  'The private worker configuration is incomplete.',
  'The worker public key is not Ed25519.',
  'The worker key no longer matches its enrolled identity.',
  // files.mjs
  'A worker run or setup is active or interrupted. Review its lock before changing the worker.',
  'A worker file is not a private regular file.',
  'The private worker file could not be read back.',
  // signed-client.mjs
  'The worker audience is invalid.',
  'The worker audience must be FolioBuddy production or an explicit loopback sandbox.',
  'The worker requires an Ed25519 key.',
  // ../ibkr-sync-helper/launch-agent.mjs
  'The existing IBKR helper status could not be checked. Nothing was removed.',
  'The IBKR helper stop could not be verified. Nothing was removed.',
  'The IBKR helper could not be stopped. Nothing was removed.',
  // ../ibkr-sync-helper/codex-client.mjs, which never puts Codex diagnostics in an error
  'Codex could not start. Open Codex and try again.',
  'The Codex connection closed. Try again.',
  'IBKR needs attention in Codex. Reconnect there, then try again.',
  'Codex could not complete the IBKR read. Check its connection.',
  'Connect the Interactive Brokers plugin in Codex first.',
  'Codex did not provide a read-only connection.',
  'The IBKR tool inventory is incomplete.',
  'A required read-only IBKR tool is unavailable. Reconnect in Codex.',
  'IBKR tools refer to different connections.',
  'The IBKR connection timed out. No further changes will be made.',
]);

export function setupFailureMessage(error) {
  const reason =
    error instanceof Error && PRINTABLE_SETUP_REFUSALS.has(error.message)
      ? error.message
      : 'Check the selected paths, existing Codex connection and private worker files; no credentials were printed.';
  return `IBKR worker setup stopped. ${reason}\n`;
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

export async function setup(
  args = process.argv.slice(2),
  { connect = connectCodex, write = (text) => process.stdout.write(text) } = {}
) {
  const options = parseOptions(args);
  const root = options.root ?? defaultRoot;
  if (!path.isAbsolute(root)) throw new Error('The workspace root must be absolute.');
  if (options.uninstall) {
    await removeWorker({ root });
    write(
      'The scheduled IBKR worker is stopped. Device keys, crash guards and private evidence are retained. Disconnect this Mac in FolioBuddy to end its app access.\n'
    );
    return;
  }
  if (options.enable) {
    await installWorker({ root });
    write(
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
  const fingerprint = await connect(binary, root);
  const enrollment = await prepareEnrollment({
    root,
    binary,
    audience: options.audience ?? DEFAULT_AUDIENCE,
    name: options.name ?? previous?.name ?? 'My Mac',
    connectorFingerprint: fingerprint,
    cashPositionId,
    rotate: options.rotate === true,
  });
  await stageRuntime({ root });
  write(
    `Public enrolment is ready at ${path.join(workerDirectory(root), 'enrollment.json')}. Register that public JSON in the owned IBKR cash panel within 24 hours. The private key stays on this Mac.\n`
  );
  // Without --rotate, setup signs the same key again, and FolioBuddy never re-authorises a
  // disconnected key.
  if (enrollment.deviceId === previous?.deviceId) {
    const rerun = ['npm', 'run', 'ibkr:worker:setup', '--', ...args, '--rotate'];
    write(
      `This Mac kept its existing key. If you disconnected this Mac in FolioBuddy, that key can't be authorised again. To reconnect, rerun setup with --rotate:\n  ${rerun.map(shellWord).join(' ')}\n`
    );
  }
  write(
    'Preparation does not start or replace a schedule. After enrolment and a verified --once run, use --enable.\n'
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await setup();
  } catch (error) {
    process.stderr.write(setupFailureMessage(error));
    process.exitCode = 1;
  }
}
