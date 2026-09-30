/** Private capture/backup paths only. No writes without --apply. */
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

dotenv.config({ path: '.env.local' });
const paths = new Map<string, string>();
let apply = false;
for (let index = 2; index < process.argv.length; index++) {
  const flag = process.argv[index];
  if (flag === '--apply') {
    assert(!apply, 'Duplicate --apply');
    apply = true;
    continue;
  }
  assert(['--input', '--restore', '--backup'].includes(flag), `Unknown argument: ${flag}`);
  const value = process.argv[++index];
  assert(value && !value.startsWith('--'), `${flag} requires a file path`);
  assert(!paths.has(flag), `Duplicate ${flag}`);
  paths.set(flag, value);
}
const inputPath = paths.get('--input');
const restorePath = paths.get('--restore');
const backupPath = paths.get('--backup');
assert(!!inputPath !== !!restorePath, 'Provide exactly one of --input or --restore');
assert(!backupPath || (apply && inputPath), '--backup is only valid when applying a capture');
assert(
  !apply || !inputPath || backupPath,
  'Applying a capture requires a new private --backup path'
);
assert(!backupPath || backupPath !== inputPath, 'The backup must use a different file path');
const userId = process.env.RECONCILE_USER_ID;
assert(
  process.env.DATABASE_URL && userId,
  'Configure DATABASE_URL and RECONCILE_USER_ID privately in .env.local before running'
);

// Load the shared transport only after the explicit database environment is set.
const { reconcileNativeCosts, restoreNativeCosts } =
  await import('../src/services/nativeReconciliationService.js');
const { basePrisma } = await import('../src/lib/prisma.js');
try {
  if (restorePath) {
    const backup: unknown = JSON.parse(await readFile(restorePath, 'utf8'));
    const result = await restoreNativeCosts(userId, backup, apply);
    process.stdout.write(JSON.stringify(result.review, null, 2) + '\n');
    process.stdout.write(
      apply
        ? 'Restored and verified. Original USD ledger preserved.\n'
        : 'Restore preview passed; no writes performed.\n'
    );
  } else {
    const input: unknown = JSON.parse(await readFile(inputPath!, 'utf8'));
    const preview = await reconcileNativeCosts(userId, input);
    process.stdout.write(JSON.stringify(preview.review, null, 2) + '\n');
    if (apply) {
      const body = JSON.stringify(preview.backup, null, 2);
      // Exclusive creation and readback keep an uncertain outcome from overwriting the backup.
      await writeFile(backupPath!, body, { flag: 'wx', mode: 0o600 });
      assert.equal(
        await readFile(backupPath!, 'utf8'),
        body,
        'Backup readback differs; nothing applied'
      );
      await reconcileNativeCosts(userId, input, preview.state);
      process.stdout.write('Applied and verified. Original USD fields and history retained.\n');
    } else {
      process.stdout.write('Dry run passed; no writes performed.\n');
    }
  }
} finally {
  await basePrisma.$disconnect();
}
