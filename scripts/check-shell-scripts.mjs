import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const scriptsDir = 'scripts';
const shellScripts = readdirSync(scriptsDir)
  .filter((file) => file.endsWith('.sh'))
  .map((file) => join(scriptsDir, file));

if (shellScripts.length === 0) {
  console.log('No shell scripts found.');
  process.exit(0);
}

const bashProbe = spawnSync('bash', ['--version'], { encoding: 'utf8' });
const probeOutput = `${bashProbe.stdout ?? ''}${bashProbe.stderr ?? ''}`.replace(/\u0000/g, '');
const isWslWithoutDistro = probeOutput.includes(
  'Windows Subsystem for Linux has no installed distributions'
);

if (bashProbe.error || bashProbe.status !== 0) {
  if (isWslWithoutDistro) {
    console.log('Skipping shell script syntax check: WSL Bash has no installed distro.');
    process.exit(0);
  }

  console.log('Skipping shell script syntax check: Bash is not available.');
  process.exit(0);
}

let failed = false;
for (const script of shellScripts) {
  const result = spawnSync('bash', ['-n', script], { encoding: 'utf8' });
  if (result.status === 0) continue;

  failed = true;
  console.error(result.stdout);
  console.error(result.stderr);
}

process.exit(failed ? 1 : 0);
