import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('.', import.meta.url));

/**
 * After a fresh `npm ci` at the monorepo root, node_modules/.prisma/client is
 * Prisma's ungenerated stub (its postinstall can't find this package's schema
 * from the root). Schema-generated exports like Prisma.TransactionIsolationLevel
 * are then undefined, so routes that reference them throw at request time and
 * route tests fail with opaque 500s. CI avoids this only because it runs
 * `npx prisma generate` explicitly before `npm test`.
 *
 * The probe runs in a child process: importing @prisma/client also loads
 * packages/backend/.env into process.env, and env set in this (main) process
 * is inherited by every forked test worker — breaking tests that assert
 * env-dependent defaults (e.g. constants.test.ts vs RATE_LIMIT_MAX).
 */
export default function ensurePrismaClientGenerated() {
  try {
    execFileSync(
      process.execPath,
      [
        '-e',
        "const { Prisma } = require('@prisma/client'); process.exit(Prisma.TransactionIsolationLevel ? 0 : 1);",
      ],
      { cwd: backendDir, stdio: 'ignore' }
    );
    return;
  } catch {
    // Stub client (or import failed entirely) — fall through and generate.
  }

  console.warn('[vitest] Prisma client is not generated — running `npx prisma generate`...');
  execSync('npx prisma generate', { cwd: backendDir, stdio: 'inherit' });
}
