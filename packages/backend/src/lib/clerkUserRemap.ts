/**
 * Pure helpers for remapping User.id values between Clerk instances.
 *
 * Why this exists: User.id IS the Clerk user id (JWT `sub`). Moving the app
 * from one Clerk instance to another (dev → production) gives every person a
 * brand-new id, so their rows must be re-keyed or `ensureUser` auto-creates an
 * empty User on first sign-in. The 5 User foreign keys are ON UPDATE CASCADE,
 * so a single `UPDATE "User" SET id = ...` re-keys every child row; only
 * `PriceHistory.updatedBy` (no FK) needs an explicit update.
 *
 * All I/O (Clerk API, Prisma) lives in `packages/backend/scripts/`; this module
 * is deliberately side-effect free so it can be unit tested.
 */

export const CLERK_USER_ID_PATTERN = /^user_[A-Za-z0-9]+$/;

export interface UserIdMapping {
  email: string;
  sourceId: string;
  targetId: string;
}

/** Child-row counts that must be identical before and after a remap. */
export interface UserChildCounts {
  positions: number;
  positionHistory: number;
  trades: number;
  investors: number;
  snapshots: number;
  priceHistoryUpdates: number;
}

export const EMPTY_CHILD_COUNTS: UserChildCounts = {
  positions: 0,
  positionHistory: 0,
  trades: 0,
  investors: 0,
  snapshots: 0,
  priceHistoryUpdates: 0,
};

export interface RemapStep {
  sourceId: string;
  targetId: string;
  email: string;
  /** A User row already exists under targetId with zero children (an
   *  auto-created stub from a premature sign-in) and must be deleted first. */
  deleteStubTarget: boolean;
}

export interface RemapPlanInput {
  mappings: UserIdMapping[];
  /** Ids of every existing User row in the target database. */
  existingUserIds: Set<string>;
  /** Child counts for existing rows keyed by User.id (must include every
   *  sourceId and any targetId that already exists). */
  countsById: Map<string, UserChildCounts>;
}

export interface RemapPlan {
  steps: RemapStep[];
  errors: string[];
}

/** Placeholder email `ensureUser` writes for brand-new users. */
export function placeholderEmail(userId: string): string {
  return `${userId}@clerk.user`;
}

export function isEmptyCounts(counts: UserChildCounts): boolean {
  return Object.values(counts).every((n) => n === 0);
}

export function countsMatch(a: UserChildCounts, b: UserChildCounts): boolean {
  return (Object.keys(EMPTY_CHILD_COUNTS) as (keyof UserChildCounts)[]).every(
    (key) => a[key] === b[key]
  );
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Structural validation of a mapping file — no database knowledge needed. */
export function validateMappings(mappings: UserIdMapping[]): string[] {
  const errors: string[] = [];
  if (mappings.length === 0) errors.push('Mapping file contains no entries');

  const seenSource = new Set<string>();
  const seenTarget = new Set<string>();
  const seenEmail = new Set<string>();

  mappings.forEach((m, index) => {
    const label = `entry ${index + 1} (${m.email || m.sourceId || '?'})`;
    if (!CLERK_USER_ID_PATTERN.test(m.sourceId ?? '')) {
      errors.push(`${label}: sourceId "${m.sourceId}" is not a Clerk user id`);
    }
    if (!CLERK_USER_ID_PATTERN.test(m.targetId ?? '')) {
      errors.push(`${label}: targetId "${m.targetId}" is not a Clerk user id`);
    }
    if (m.sourceId && m.sourceId === m.targetId) {
      errors.push(`${label}: sourceId and targetId are identical`);
    }
    if (!isValidEmail(m.email ?? '')) errors.push(`${label}: email "${m.email}" is invalid`);

    if (seenSource.has(m.sourceId)) errors.push(`${label}: duplicate sourceId ${m.sourceId}`);
    if (seenTarget.has(m.targetId)) errors.push(`${label}: duplicate targetId ${m.targetId}`);
    const emailKey = (m.email ?? '').toLowerCase();
    if (seenEmail.has(emailKey)) errors.push(`${label}: duplicate email ${m.email}`);
    seenSource.add(m.sourceId);
    seenTarget.add(m.targetId);
    seenEmail.add(emailKey);
  });

  return errors;
}

/**
 * Decide, per mapping, whether the remap can proceed and whether an empty
 * stub row under the target id must be removed first. Any non-empty row under
 * a target id is a hard error — we never merge or overwrite real data.
 */
export function planRemap(input: RemapPlanInput): RemapPlan {
  const errors = validateMappings(input.mappings);
  const steps: RemapStep[] = [];

  for (const mapping of input.mappings) {
    if (!input.existingUserIds.has(mapping.sourceId)) {
      errors.push(`No User row found for sourceId ${mapping.sourceId} (${mapping.email})`);
      continue;
    }

    let deleteStubTarget = false;
    if (input.existingUserIds.has(mapping.targetId)) {
      const targetCounts = input.countsById.get(mapping.targetId);
      if (!targetCounts || !isEmptyCounts(targetCounts)) {
        errors.push(
          `User row ${mapping.targetId} (${mapping.email}) already exists with data — refusing to overwrite`
        );
        continue;
      }
      deleteStubTarget = true;
    }

    steps.push({
      sourceId: mapping.sourceId,
      targetId: mapping.targetId,
      email: mapping.email,
      deleteStubTarget,
    });
  }

  return { steps, errors };
}

export interface UserFkRow {
  constraintName: string;
  tableName: string;
  /** pg_constraint.confupdtype: 'c' = CASCADE, 'a' = NO ACTION, 'r' = RESTRICT, ... */
  onUpdateAction: string;
}

/** Names of User FKs that would NOT follow an id change (anything but CASCADE). */
export function findNonCascadingUserFks(rows: UserFkRow[]): string[] {
  return rows
    .filter((row) => row.onUpdateAction !== 'c')
    .map((row) => `${row.tableName}.${row.constraintName} (${row.onUpdateAction})`);
}

export interface RemapAuditEntry {
  sourceId: string;
  targetId: string;
  previousEmail: string;
  newEmail: string;
  counts: UserChildCounts;
}

/** Turn an audit file back into mappings that undo the original remap. */
export function buildRollbackMappings(entries: RemapAuditEntry[]): UserIdMapping[] {
  return entries.map((entry) => ({
    email: entry.previousEmail,
    sourceId: entry.targetId,
    targetId: entry.sourceId,
  }));
}
