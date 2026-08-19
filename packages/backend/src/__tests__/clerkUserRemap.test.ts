import { describe, expect, it } from 'vitest';
import {
  EMPTY_CHILD_COUNTS,
  assertTargetExternalIdCompatible,
  buildRollbackMappings,
  countsMatch,
  findNonCascadingUserFks,
  isEmptyCounts,
  placeholderEmail,
  planRemap,
  requireSourceUserEmail,
  validateMappings,
  type UserChildCounts,
  type UserIdMapping,
} from '../lib/clerkUserRemap.js';

const OWNER: UserIdMapping = {
  email: 'owner@example.com',
  sourceId: 'user_devOwner1',
  targetId: 'user_prodOwner1',
};
const FRIEND: UserIdMapping = {
  email: 'friend@example.com',
  sourceId: 'user_devFriend2',
  targetId: 'user_prodFriend2',
};

const OWNER_COUNTS: UserChildCounts = {
  positions: 12,
  positionHistory: 3,
  trades: 40,
  investors: 2,
  snapshots: 210,
  priceHistoryUpdates: 5,
};

describe('mirror identity guards', () => {
  it('requires every source user to have an email before producing a map', () => {
    expect(requireSourceUserEmail(OWNER.sourceId, OWNER.email)).toBe(OWNER.email);
    expect(() => requireSourceUserEmail(OWNER.sourceId, null)).toThrow(
      'has no email address; add one or provide an explicit manual mapping'
    );
  });

  it('rejects a same-email target that belongs to another source user', () => {
    expect(() =>
      assertTargetExternalIdCompatible(OWNER.email, OWNER.sourceId, 'user_differentSource')
    ).toThrow('belongs to a different source user');

    expect(() =>
      assertTargetExternalIdCompatible(OWNER.email, OWNER.sourceId, OWNER.sourceId)
    ).not.toThrow();
    expect(() => assertTargetExternalIdCompatible(OWNER.email, OWNER.sourceId, null)).not.toThrow();
  });
});

describe('validateMappings', () => {
  it('accepts a well-formed mapping list', () => {
    expect(validateMappings([OWNER, FRIEND])).toEqual([]);
  });

  it('rejects empty input, malformed ids, identical ids and bad emails', () => {
    expect(validateMappings([])).toEqual(['Mapping file contains no entries']);

    const errors = validateMappings([
      { email: 'not-an-email', sourceId: 'local-scale-user', targetId: 'user_prodX' },
      { email: 'same@example.com', sourceId: 'user_same', targetId: 'user_same' },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('sourceId "local-scale-user" is not a Clerk user id'),
        expect.stringContaining('email "not-an-email" is invalid'),
        expect.stringContaining('sourceId and targetId are identical'),
      ])
    );
  });

  it('rejects duplicate source ids, target ids and emails (case-insensitive)', () => {
    const errors = validateMappings([
      OWNER,
      { ...FRIEND, sourceId: OWNER.sourceId },
      { ...FRIEND, targetId: OWNER.targetId, sourceId: 'user_devOther3' },
      {
        ...FRIEND,
        email: 'OWNER@example.com',
        sourceId: 'user_devOther4',
        targetId: 'user_prodOther4',
      },
    ]);
    expect(errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining(`duplicate sourceId ${OWNER.sourceId}`),
        expect.stringContaining(`duplicate targetId ${OWNER.targetId}`),
        expect.stringContaining('duplicate email OWNER@example.com'),
      ])
    );
  });
});

describe('planRemap', () => {
  it('plans a plain re-key when the target id does not exist yet', () => {
    const plan = planRemap({
      mappings: [OWNER],
      existingUserIds: new Set([OWNER.sourceId]),
      countsById: new Map([[OWNER.sourceId, OWNER_COUNTS]]),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.steps).toEqual([{ ...OWNER, deleteStubTarget: false }]);
  });

  it('deletes an empty auto-created stub under the target id first', () => {
    const plan = planRemap({
      mappings: [OWNER],
      existingUserIds: new Set([OWNER.sourceId, OWNER.targetId]),
      countsById: new Map([
        [OWNER.sourceId, OWNER_COUNTS],
        [OWNER.targetId, EMPTY_CHILD_COUNTS],
      ]),
    });
    expect(plan.errors).toEqual([]);
    expect(plan.steps[0].deleteStubTarget).toBe(true);
  });

  it('refuses to overwrite a target row that already holds data', () => {
    const plan = planRemap({
      mappings: [OWNER],
      existingUserIds: new Set([OWNER.sourceId, OWNER.targetId]),
      countsById: new Map([
        [OWNER.sourceId, OWNER_COUNTS],
        [OWNER.targetId, { ...EMPTY_CHILD_COUNTS, positions: 1 }],
      ]),
    });
    expect(plan.steps).toEqual([]);
    expect(plan.errors).toEqual([
      expect.stringContaining(`${OWNER.targetId} (${OWNER.email}) already exists with data`),
    ]);
  });

  it('reports a missing source row and still plans the others', () => {
    const plan = planRemap({
      mappings: [OWNER, FRIEND],
      existingUserIds: new Set([FRIEND.sourceId]),
      countsById: new Map([[FRIEND.sourceId, EMPTY_CHILD_COUNTS]]),
    });
    expect(plan.errors).toEqual([
      expect.stringContaining(`No User row found for sourceId ${OWNER.sourceId}`),
    ]);
    expect(plan.steps.map((s) => s.sourceId)).toEqual([FRIEND.sourceId]);
  });

  it('surfaces structural mapping errors alongside database errors', () => {
    const plan = planRemap({
      mappings: [{ ...OWNER, targetId: 'nope' }],
      existingUserIds: new Set([OWNER.sourceId]),
      countsById: new Map([[OWNER.sourceId, OWNER_COUNTS]]),
    });
    expect(plan.errors).toEqual([
      expect.stringContaining('targetId "nope" is not a Clerk user id'),
    ]);
  });
});

describe('count helpers', () => {
  it('detects empty vs populated rows and exact matches', () => {
    expect(isEmptyCounts(EMPTY_CHILD_COUNTS)).toBe(true);
    expect(isEmptyCounts({ ...EMPTY_CHILD_COUNTS, snapshots: 1 })).toBe(false);
    expect(countsMatch(OWNER_COUNTS, { ...OWNER_COUNTS })).toBe(true);
    expect(countsMatch(OWNER_COUNTS, { ...OWNER_COUNTS, trades: 39 })).toBe(false);
  });

  it('builds the placeholder email ensureUser uses', () => {
    expect(placeholderEmail('user_abc')).toBe('user_abc@clerk.user');
  });
});

describe('findNonCascadingUserFks', () => {
  it('returns only constraints that would not follow an id change', () => {
    const rows = [
      { constraintName: 'Position_userId_fkey', tableName: 'Position', onUpdateAction: 'c' },
      { constraintName: 'Trade_userId_fkey', tableName: 'Trade', onUpdateAction: 'a' },
      { constraintName: 'Snapshot_userId_fkey', tableName: 'Snapshot', onUpdateAction: 'r' },
    ];
    expect(findNonCascadingUserFks(rows)).toEqual([
      'Trade.Trade_userId_fkey (a)',
      'Snapshot.Snapshot_userId_fkey (r)',
    ]);
  });
});

describe('buildRollbackMappings', () => {
  it('reverses ids and restores the previous email', () => {
    expect(
      buildRollbackMappings([
        {
          sourceId: OWNER.sourceId,
          targetId: OWNER.targetId,
          previousEmail: 'user_devOwner1@clerk.user',
          newEmail: OWNER.email,
          counts: OWNER_COUNTS,
        },
      ])
    ).toEqual([
      { email: 'user_devOwner1@clerk.user', sourceId: OWNER.targetId, targetId: OWNER.sourceId },
    ]);
  });
});
