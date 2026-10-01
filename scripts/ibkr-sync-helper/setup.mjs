import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { access, copyFile, writeFile, chmod, rm, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { privateDirectory } from './audit.mjs';
import { storeState, secretHash, ORIGINS } from './server.mjs';
import { stopLaunchAgent } from './launch-agent.mjs';

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(source, '../..');
const sandbox = process.argv.includes('--sandbox');
const origin = sandbox ? 'http://localhost:4100' : 'https://foliobuddy.xyz';
const port = sandbox ? 47684 : 47683;
const label = `xyz.foliobuddy.ibkr-helper${sandbox ? '-sandbox' : ''}`;
const folder = path.join(root, '.local', sandbox ? 'ibkr-helper-sandbox' : 'ibkr-helper');
const plist = path.join(homedir(), 'Library', 'LaunchAgents', `${label}.plist`);
const domain = `gui/${process.getuid()}`;
const escape = (value) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
const launchctl = (...args) => spawnSync('/bin/launchctl', args, { encoding: 'utf8' });

if (process.platform !== 'darwin')
  throw new Error('This installer supports macOS. See the runbook for manual helper startup.');
if (process.argv.includes('--uninstall')) {
  stopLaunchAgent(launchctl, `${domain}/${label}`);
  await rm(plist, { force: true });
  process.stdout.write(
    'IBKR helper stopped and removed from login items. Private sync backups are retained.\n'
  );
} else {
  if (!ORIGINS.includes(origin)) throw new Error('Unsupported app origin.');
  const candidates = [
    '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex',
    '/Applications/Codex.app/Contents/Resources/codex',
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
  ];
  let binary;
  for (const candidate of candidates) {
    try {
      await access(candidate);
      binary = candidate;
      break;
    } catch {
      /* Try the next installed CLI. */
    }
  }
  if (!binary) throw new Error('Install and sign in to Codex before connecting the IBKR helper.');
  stopLaunchAgent(launchctl, `${domain}/${label}`);
  await privateDirectory(folder);
  const runtime = path.join(folder, 'runtime');
  await privateDirectory(runtime);
  for (const name of ['server.mjs', 'codex-client.mjs', 'capture.mjs', 'audit.mjs']) {
    await copyFile(path.join(source, name), path.join(runtime, name));
    await chmod(path.join(runtime, name), 0o600);
  }
  const code = randomBytes(9).toString('base64url');
  await storeState(folder, {
    version: 1,
    origin,
    pairCodeHash: secretHash(code),
    pairExpiresAt: Date.now() + 10 * 60000,
    pairAttempts: 0,
  });
  const setupPage = path.join(folder, 'setup.html');
  await writeFile(
    setupPage,
    `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connect FolioBuddy IBKR sync</title><body style="font:18px system-ui;max-width:560px;margin:12vh auto;padding:24px;line-height:1.5"><h1>Connect this Mac once</h1><p>Open your IBKR section in <a href="${origin}/portfolio" rel="noreferrer">FolioBuddy</a>, choose <strong>Sync IBKR</strong>, then enter this setup code:</p><p style="font:28px monospace;letter-spacing:2px;user-select:all">${escape(code)}</p><p>This code expires in 10 minutes. After connecting, you can sync with one click while this Mac is on and FolioBuddy is open.</p><p>The helper only reads your existing IBKR connection. Your browser remains in charge of saving FolioBuddy records.</p></body></html>`,
    { mode: 0o600 }
  );
  await chmod(setupPage, 0o600);
  const args = [
    process.execPath,
    path.join(runtime, 'server.mjs'),
    root,
    origin,
    String(port),
    binary,
  ];
  await mkdir(path.dirname(plist), { recursive: true, mode: 0o700 });
  await writeFile(
    plist,
    `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array>${args.map((value) => `<string>${escape(value)}</string>`).join('')}</array><key>WorkingDirectory</key><string>${escape(root)}</string><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${escape(path.join(folder, 'helper.log'))}</string><key>StandardErrorPath</key><string>${escape(path.join(folder, 'helper-error.log'))}</string></dict></plist>`,
    { mode: 0o600 }
  );
  for (const name of ['helper.log', 'helper-error.log']) {
    await writeFile(path.join(folder, name), '', { flag: 'a', mode: 0o600 });
    await chmod(path.join(folder, name), 0o600);
  }
  const result = launchctl('bootstrap', domain, plist);
  if (result.status !== 0)
    throw new Error(
      'The helper could not start. Check the private helper log before retrying setup.'
    );
  spawnSync('/usr/bin/open', [setupPage], { stdio: 'ignore' });
  process.stdout.write(
    'IBKR helper installed. Its private setup page is open; enter the code in FolioBuddy once.\n'
  );
}
