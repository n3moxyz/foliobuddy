/**
 * Mirror users from a SOURCE Clerk instance (development) into a TARGET Clerk
 * instance (production) so every person's production id is known BEFORE the
 * app switches instances. Output feeds `remap-clerk-user-ids.ts`.
 *
 * Why: Clerk cannot move users between instances, and User.id in Postgres IS
 * the Clerk id. Creating the users up front (email verified by default, the
 * old id stored as `external_id`) means their first Google/GitHub/email-code
 * sign-in on the new instance links to this pre-created account instead of
 * creating a fresh, empty one.
 *
 * Idempotent: re-running looks users up by email on the target first.
 *
 * Usage (from packages/backend, keys exported in the shell — never committed):
 *   CLERK_SOURCE_SECRET_KEY=sk_test_... CLERK_TARGET_SECRET_KEY=sk_live_... \
 *     tsx scripts/clerk-mirror-users.ts            # dry-run: show what would be created
 *     tsx scripts/clerk-mirror-users.ts --apply    # create missing users, write the id map
 *
 * Writes scripts/clerk-user-id-map.json (gitignored — contains emails).
 */

import { createClerkClient, type User } from '@clerk/express';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CLERK_USER_ID_PATTERN,
  assertTargetExternalIdCompatible,
  requireSourceUserEmail,
  type UserIdMapping,
} from '../src/lib/clerkUserRemap.js';

const MAP_PATH = resolve(process.cwd(), 'scripts/clerk-user-id-map.json');
const PAGE_SIZE = 100;

interface SourceUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  createdAt: Date;
}

interface MirrorResult {
  mapping: UserIdMapping;
  status: 'exists' | 'created' | 'would-create';
}

function log(message: string): void {
  console.log(message);
}

function requireKey(name: string, prefix: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is not set`);
  if (!value.startsWith(prefix)) {
    throw new Error(`${name} must start with ${prefix} (refusing to mix instances up)`);
  }
  return value;
}

function primaryEmail(user: User): string | null {
  const primary = user.emailAddresses.find((e) => e.id === user.primaryEmailAddressId);
  return (primary ?? user.emailAddresses[0])?.emailAddress ?? null;
}

async function listAllUsers(client: ReturnType<typeof createClerkClient>): Promise<User[]> {
  const users: User[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await client.users.getUserList({
      limit: PAGE_SIZE,
      offset,
      orderBy: '+created_at',
    });
    users.push(...page.data);
    if (page.data.length < PAGE_SIZE) return users;
  }
}

function toSourceUsers(users: User[]): SourceUser[] {
  return users.map((user) => ({
    id: user.id,
    email: requireSourceUserEmail(user.id, primaryEmail(user)),
    firstName: user.firstName,
    lastName: user.lastName,
    createdAt: new Date(user.createdAt),
  }));
}

async function findTargetByEmail(
  client: ReturnType<typeof createClerkClient>,
  email: string
): Promise<User | null> {
  const page = await client.users.getUserList({ emailAddress: [email], limit: 1 });
  return page.data[0] ?? null;
}

async function mirrorOne(
  target: ReturnType<typeof createClerkClient>,
  source: SourceUser,
  apply: boolean
): Promise<MirrorResult> {
  const existing = await findTargetByEmail(target, source.email);
  if (existing) {
    assertTargetExternalIdCompatible(source.email, source.id, existing.externalId);
    return {
      mapping: { email: source.email, sourceId: source.id, targetId: existing.id },
      status: 'exists',
    };
  }

  if (!apply) {
    return {
      mapping: { email: source.email, sourceId: source.id, targetId: 'user_(pending)' },
      status: 'would-create',
    };
  }

  const created = await target.users.createUser({
    emailAddress: [source.email],
    externalId: source.id,
    firstName: source.firstName ?? undefined,
    lastName: source.lastName ?? undefined,
    createdAt: source.createdAt,
    skipPasswordRequirement: true,
  });
  return {
    mapping: { email: source.email, sourceId: source.id, targetId: created.id },
    status: 'created',
  };
}

function printResults(results: MirrorResult[]): void {
  log('');
  log(
    'email                              source id                          target id                          status'
  );
  for (const r of results) {
    log(
      `${r.mapping.email.padEnd(34)} ${r.mapping.sourceId.padEnd(34)} ${r.mapping.targetId.padEnd(34)} ${r.status}`
    );
  }
  log('');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const sourceKey = requireKey('CLERK_SOURCE_SECRET_KEY', 'sk_test_');
  const targetKey = requireKey('CLERK_TARGET_SECRET_KEY', 'sk_live_');

  const source = createClerkClient({ secretKey: sourceKey });
  const target = createClerkClient({ secretKey: targetKey });

  const sourceUsers = toSourceUsers(await listAllUsers(source));
  log(`Source instance: ${sourceUsers.length} user(s) with an email address`);

  const results: MirrorResult[] = [];
  for (const user of sourceUsers) {
    results.push(await mirrorOne(target, user, apply));
  }
  printResults(results);

  if (!apply) {
    log('Dry run — nothing created. Re-run with --apply to create the missing users.');
    return;
  }

  const mappings = results.map((r) => r.mapping);
  const invalid = mappings.filter((m) => !CLERK_USER_ID_PATTERN.test(m.targetId));
  if (invalid.length > 0) throw new Error(`Unexpected target ids: ${JSON.stringify(invalid)}`);

  writeFileSync(MAP_PATH, JSON.stringify(mappings, null, 2) + '\n');
  log(`Wrote ${mappings.length} mapping(s) to ${MAP_PATH}`);
  log(`Next: tsx scripts/remap-clerk-user-ids.ts --map scripts/clerk-user-id-map.json`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
