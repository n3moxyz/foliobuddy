/**
 * Re-key User rows from one Clerk instance's user ids to another's.
 *
 * Why: User.id IS the Clerk user id. After moving the app to a new Clerk
 * instance every person gets a new id, and `ensureUser` would auto-create an
 * empty User on their first sign-in while their real data sits under the old
 * id. This script moves the data to the new ids in ONE transaction.
 *
 * How: every User foreign key (Position, PositionHistory, Trade, Investor,
 * Snapshot) is ON UPDATE CASCADE, so `UPDATE "User" SET id = new` re-keys all
 * child rows automatically. `PriceHistory.updatedBy` has no FK and is updated
 * explicitly. The script refuses to run if any User FK is not CASCADE, if a
 * source id has no row, or if a target id already has real data. An empty
 * target row (auto-created stub from a premature sign-in) is deleted first.
 *
 * Audit + rollback: every apply writes scripts/audit-clerk-remap-<iso>.json
 * (gitignored). `--rollback <audit>` replays it in reverse with the same
 * safety checks and writes its own audit, so re-apply is possible.
 *
 * Usage (from packages/backend, DATABASE_URL selects the database):
 *   tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json             # dry-run
 *   tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json --apply
 *   tsx scripts/remap-clerk-user-ids.ts --rollback scripts/audit-clerk-remap-<iso>.json  # dry-run
 *   tsx scripts/remap-clerk-user-ids.ts --rollback scripts/audit-clerk-remap-<iso>.json --apply
 * Flags:
 *   --keep-placeholder-email   write `<newId>@clerk.user` instead of the mapping's real email
 */

import { Prisma } from '@prisma/client';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../src/lib/prisma.js';
import {
  buildRollbackMappings,
  countsMatch,
  findNonCascadingUserFks,
  placeholderEmail,
  planRemap,
  type RemapAuditEntry,
  type RemapStep,
  type UserChildCounts,
  type UserFkRow,
  type UserIdMapping,
} from '../src/lib/clerkUserRemap.js';

/** Works for both the (extended) client and an interactive-transaction client. */
type Db = Pick<Prisma.TransactionClient, '$queryRaw' | '$executeRaw'>;

interface CliArgs {
  mapPath?: string;
  rollbackPath?: string;
  apply: boolean;
  keepPlaceholderEmail: boolean;
}

interface UserRow {
  id: string;
  email: string;
}

function log(message: string): void {
  console.log(message);
}

function parseArgs(argv: string[]): CliArgs {
  const flagValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const args: CliArgs = {
    mapPath: flagValue('--map'),
    rollbackPath: flagValue('--rollback'),
    apply: argv.includes('--apply'),
    keepPlaceholderEmail: argv.includes('--keep-placeholder-email'),
  };
  if (!!args.mapPath === !!args.rollbackPath) {
    throw new Error('Pass exactly one of: --map <map.json> | --rollback <audit.json>');
  }
  return args;
}

function loadMappings(args: CliArgs): UserIdMapping[] {
  if (args.mapPath) {
    return JSON.parse(readFileSync(resolve(process.cwd(), args.mapPath), 'utf8'));
  }
  const audit: RemapAuditEntry[] = JSON.parse(
    readFileSync(resolve(process.cwd(), args.rollbackPath!), 'utf8')
  );
  return buildRollbackMappings(audit);
}

/** Enough to recognise the database without echoing credentials. */
function describeDatabase(): string {
  const url = new URL(process.env.DATABASE_URL ?? '');
  const host = url.hostname.length > 6 ? `${url.hostname.slice(0, 3)}…` : url.hostname;
  return `${host}:${url.port || '5432'}${url.pathname}`;
}

async function fetchUserFks(db: Db): Promise<UserFkRow[]> {
  return db.$queryRaw<UserFkRow[]>`
    SELECT c.conname AS "constraintName",
           cl.relname AS "tableName",
           c.confupdtype::text AS "onUpdateAction"
    FROM pg_constraint c
    JOIN pg_class cl ON cl.oid = c.conrelid
    WHERE c.contype = 'f' AND c.confrelid = '"User"'::regclass
  `;
}

async function fetchUsers(db: Db, ids: string[]): Promise<UserRow[]> {
  return db.$queryRaw<UserRow[]>`
    SELECT id, email FROM "User" WHERE id IN (${Prisma.join(ids)})
  `;
}

async function fetchCounts(db: Db, userId: string): Promise<UserChildCounts> {
  const rows = await db.$queryRaw<UserChildCounts[]>`
    SELECT
      (SELECT count(*) FROM "Position"        WHERE "userId"    = ${userId})::int AS "positions",
      (SELECT count(*) FROM "PositionHistory" WHERE "userId"    = ${userId})::int AS "positionHistory",
      (SELECT count(*) FROM "Trade"           WHERE "userId"    = ${userId})::int AS "trades",
      (SELECT count(*) FROM "Investor"        WHERE "userId"    = ${userId})::int AS "investors",
      (SELECT count(*) FROM "Snapshot"        WHERE "userId"    = ${userId})::int AS "snapshots",
      (SELECT count(*) FROM "PriceHistory"    WHERE "updatedBy" = ${userId})::int AS "priceHistoryUpdates"
  `;
  return rows[0];
}

async function collectCounts(db: Db, ids: string[]): Promise<Map<string, UserChildCounts>> {
  const counts = new Map<string, UserChildCounts>();
  for (const id of ids) counts.set(id, await fetchCounts(db, id));
  return counts;
}

function newEmailFor(step: RemapStep, keepPlaceholder: boolean): string {
  return keepPlaceholder ? placeholderEmail(step.targetId) : step.email;
}

function printPlan(
  steps: RemapStep[],
  counts: Map<string, UserChildCounts>,
  emails: Map<string, string>,
  keepPlaceholder: boolean
): void {
  log('');
  log(
    'source id                          → target id                          email                          pos  hist trd  inv  snap  ph'
  );
  for (const step of steps) {
    const c = counts.get(step.sourceId)!;
    const stub = step.deleteStubTarget ? '  (deletes empty stub under target id first)' : '';
    log(
      `${step.sourceId.padEnd(34)} → ${step.targetId.padEnd(34)} ${newEmailFor(step, keepPlaceholder).padEnd(30)} ` +
        `${String(c.positions).padStart(3)}  ${String(c.positionHistory).padStart(4)} ${String(c.trades).padStart(3)}  ` +
        `${String(c.investors).padStart(3)}  ${String(c.snapshots).padStart(4)}  ${String(c.priceHistoryUpdates).padStart(2)}${stub}`
    );
    log(`  current email: ${emails.get(step.sourceId)}`);
  }
  log('');
}

async function applyStep(
  tx: Db,
  step: RemapStep,
  before: UserChildCounts,
  newEmail: string
): Promise<void> {
  if (step.deleteStubTarget) {
    await tx.$executeRaw`DELETE FROM "User" WHERE id = ${step.targetId}`;
  }
  const updated = await tx.$executeRaw`
    UPDATE "User" SET id = ${step.targetId}, email = ${newEmail}, "updatedAt" = now()
    WHERE id = ${step.sourceId}
  `;
  if (updated !== 1)
    throw new Error(`Expected to update 1 User row for ${step.sourceId}, got ${updated}`);

  await tx.$executeRaw`
    UPDATE "PriceHistory" SET "updatedBy" = ${step.targetId} WHERE "updatedBy" = ${step.sourceId}
  `;

  const after = await fetchCounts(tx, step.targetId);
  if (!countsMatch(before, after)) {
    throw new Error(
      `Child counts changed for ${step.sourceId} → ${step.targetId}: ${JSON.stringify(before)} vs ${JSON.stringify(after)}`
    );
  }
}

async function applyPlan(
  steps: RemapStep[],
  counts: Map<string, UserChildCounts>,
  emails: Map<string, string>,
  keepPlaceholder: boolean
): Promise<RemapAuditEntry[]> {
  const audit: RemapAuditEntry[] = [];
  await prisma.$transaction(
    async (tx) => {
      for (const step of steps) {
        const before = counts.get(step.sourceId)!;
        const newEmail = newEmailFor(step, keepPlaceholder);
        await applyStep(tx, step, before, newEmail);
        audit.push({
          sourceId: step.sourceId,
          targetId: step.targetId,
          previousEmail: emails.get(step.sourceId)!,
          newEmail,
          counts: before,
        });
        log(`✓ ${step.sourceId} → ${step.targetId}`);
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60_000 }
  );
  return audit;
}

function writeAudit(entries: RemapAuditEntry[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const path = resolve(process.cwd(), `scripts/audit-clerk-remap-${stamp}.json`);
  writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
  return path;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const mappings = loadMappings(args);
  log(
    `Database: ${describeDatabase()}  (${args.rollbackPath ? 'ROLLBACK' : 'remap'}, ${args.apply ? 'APPLY' : 'dry-run'})`
  );

  const badFks = findNonCascadingUserFks(await fetchUserFks(prisma));
  if (badFks.length > 0) {
    throw new Error(`User FKs without ON UPDATE CASCADE — aborting: ${badFks.join(', ')}`);
  }

  const allIds = mappings.flatMap((m) => [m.sourceId, m.targetId]);
  const existing = await fetchUsers(prisma, allIds);
  const existingIds = new Set(existing.map((u) => u.id));
  const emails = new Map(existing.map((u) => [u.id, u.email]));
  const counts = await collectCounts(prisma, [...existingIds]);

  const plan = planRemap({ mappings, existingUserIds: existingIds, countsById: counts });
  if (plan.errors.length > 0) {
    throw new Error(`Refusing to continue:\n  - ${plan.errors.join('\n  - ')}`);
  }
  printPlan(plan.steps, counts, emails, args.keepPlaceholderEmail);

  if (!args.apply) {
    log('Dry run — no changes written. Re-run with --apply to execute in one transaction.');
    return;
  }

  const audit = await applyPlan(plan.steps, counts, emails, args.keepPlaceholderEmail);
  const auditPath = writeAudit(audit);
  log(`Done: ${audit.length} user(s) re-keyed. Audit: ${auditPath}`);
  log(`Rollback with: tsx scripts/remap-clerk-user-ids.ts --rollback ${auditPath} --apply`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
