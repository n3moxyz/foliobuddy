import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let auth: typeof import('../authSession');
let imports: typeof import('../positionImportAttempt');
const input = '[{"quantity":0.123456789,"avgCostNative":26.9265111111111,"custodyOf":"Alice"}]';
const storageKey = 'foliobuddy-pending-position-imports-v1';
async function load(owner = 'alice', session = 'alice-session') {
  vi.resetModules();
  auth = await import('../authSession');
  auth.installAuthSession(owner, session, async () => null, 'local');
  imports = await import('../positionImportAttempt');
}
beforeEach(async () => {
  sessionStorage.clear();
  await load();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('pending position import recovery', () => {
  it('retains an uncertain attempt until acknowledgement, then permits a deliberate identical import', () => {
    const first = imports.beginPositionImport(input);
    expect(imports.beginPositionImport(input)).toBe(first);
    imports.confirmPositionImport(first);
    expect(imports.pendingPositionImports()).toEqual([]);
    expect(imports.beginPositionImport(input).requestId).not.toBe(first.requestId);
  });
  it('restores the original identity and exact payload after the JavaScript runtime reloads', async () => {
    const first = imports.beginPositionImport(input);
    await load();
    const [restored] = imports.pendingPositionImports();
    expect(restored).toMatchObject({ input, requestId: first.requestId });
    expect(restored.session).toBe(auth.captureAuthSession());
    expect(imports.beginPositionImport(input)).toBe(restored);
  });
  it('preserves a partial receipt and editable correction through reload without reviving the original batch', async () => {
    const originalInput = JSON.stringify([{ quantity: 1 }, { quantity: 2 }]);
    const original = imports.beginPositionImport(originalInput);
    const draft = imports.preparePositionImportCorrection(original, '[{"quantity":2}]');
    await load();
    const [restored] = imports.pendingPositionImports();
    expect(restored).toMatchObject({ requestId: draft.requestId, draft: true });
    expect(() => imports.beginPositionImport(originalInput)).toThrow('split into a correction');
    expect(() => imports.beginPositionImport(originalInput, restored)).toThrow(
      'split into a correction'
    );
    const dispatched = imports.beginPositionImport('[{"quantity":3}]', restored);
    expect(dispatched.requestId).toBe(draft.requestId);
    expect(dispatched.draft).toBeUndefined();
    await load();
    expect(imports.pendingPositionImports()).toHaveLength(1);
    expect(imports.beginPositionImport(dispatched.input).requestId).toBe(draft.requestId);
    imports.confirmPositionImport(imports.pendingPositionImports()[0]);
    expect(imports.pendingPositionImports()).toEqual([]);
    expect(() => imports.beginPositionImport(originalInput)).toThrow('split into a correction');
  });
  it('registers logout cleanup after reload even if Import is never opened again', async () => {
    imports.beginPositionImport(input);
    await load();
    imports.watchPositionImportSession(auth.captureAuthSession());
    auth.endAuthSession(auth.captureAuthSession());
    await Promise.resolve();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it('seals an all-failed batch when its correction succeeds and the runtime reloads', async () => {
    const original = imports.beginPositionImport(input);
    const draft = imports.preparePositionImportCorrection(original, input);
    expect(draft.draft).toBe(true);
    expect(draft.requestId).not.toBe(original.requestId);
    await load();
    const [restored] = imports.pendingPositionImports();
    expect(restored).toMatchObject({ input, requestId: draft.requestId, draft: true });
    const corrected = imports.beginPositionImport('[{"quantity":2}]', restored);
    expect(corrected.requestId).toBe(draft.requestId);
    imports.confirmPositionImport(corrected);
    await load();
    expect(imports.pendingPositionImports()).toEqual([]);
    expect(() => imports.beginPositionImport(input)).toThrow('split into a correction');
  });
  it('allows an explicit unchanged correction retry while blocking a fresh original re-paste', () => {
    const original = imports.beginPositionImport(input);
    const draft = imports.preparePositionImportCorrection(original, input);
    expect(() => imports.beginPositionImport(input)).toThrow('split into a correction');
    const retry = imports.beginPositionImport(input, draft);
    expect(retry.requestId).toBe(draft.requestId);
    expect(imports.beginPositionImport(input, retry).requestId).toBe(draft.requestId);
    imports.confirmPositionImport(retry);
    expect(() => imports.beginPositionImport(input)).toThrow('split into a correction');
  });
  it('rejects stale draft, superseded, and acknowledged identities without changing saved payloads', () => {
    const original = imports.beginPositionImport('[{"row":"A"},{"row":"B"}]');
    const draft = imports.preparePositionImportCorrection(original, '[{"row":"B"}]');
    const dispatched = imports.beginPositionImport('[{"row":"corrected B"}]', draft);
    expect(() => imports.beginPositionImport(draft.input, draft)).toThrow('already changed');
    expect(imports.pendingPositionImports()[0]).toMatchObject(dispatched);
    const nextDraft = imports.preparePositionImportCorrection(dispatched, '[{"row":"C"}]');
    expect(() => imports.beginPositionImport(dispatched.input, dispatched)).toThrow(
      'already changed'
    );
    expect(imports.pendingPositionImports()[0]).toMatchObject(nextDraft);
    const final = imports.beginPositionImport(nextDraft.input, nextDraft);
    imports.confirmPositionImport(final);
    expect(() => imports.beginPositionImport(final.input, final)).toThrow('already changed');
    expect(imports.pendingPositionImports()).toEqual([]);
  });
  it.each([
    ['bob', 'bob-session'],
    ['alice', 'new-alice-session'],
  ])(
    'clears expired recovery when reload installs %s / %s without reopening Import',
    async (owner, session) => {
      imports.beginPositionImport(input);
      await load(owner, session);
      imports.watchPositionImportSession(auth.captureAuthSession());
      expect(sessionStorage.getItem(storageKey)).toBeNull();
    }
  );
  it('retains distinct correction identities when separate batches have identical failed subsets', () => {
    const first = imports.beginPositionImport('[{"row":"A"},{"row":"B"}]');
    const second = imports.beginPositionImport('[{"row":"C"},{"row":"B"}]');
    const firstDraft = imports.preparePositionImportCorrection(first, '[{"row":"B"}]');
    const secondDraft = imports.preparePositionImportCorrection(second, '[{"row":"B"}]');
    expect(imports.beginPositionImport(secondDraft.input, secondDraft).requestId).toBe(
      secondDraft.requestId
    );
    expect(imports.beginPositionImport(firstDraft.input, firstDraft).requestId).toBe(
      firstDraft.requestId
    );
    expect(firstDraft.requestId).not.toBe(secondDraft.requestId);
  });
  it('keeps distinct batches and their full native precision through reload', async () => {
    const first = imports.beginPositionImport(input);
    const other = input.replace('1111111', '1111112');
    const second = imports.beginPositionImport(other);
    await load();
    expect(
      imports.pendingPositionImports().map(({ input, requestId }) => ({ input, requestId }))
    ).toEqual([
      { input, requestId: first.requestId },
      { input: other, requestId: second.requestId },
    ]);
  });
  it('does not expose another owner or sign-in session and ignores stale acknowledgements', async () => {
    const alice = imports.beginPositionImport(input);
    auth.installAuthSession('bob', 'bob-session', async () => null, 'local');
    expect(imports.pendingPositionImports()).toEqual([]);
    const bob = imports.beginPositionImport(input);
    imports.confirmPositionImport(alice);
    expect(imports.beginPositionImport(input)).toBe(bob);
    await load('bob', 'new-session');
    expect(imports.pendingPositionImports()).toEqual([]);
  });
  it('clears recovery on logout but retains it through same-identity effect reinstalls', async () => {
    const first = imports.beginPositionImport(input);
    auth.endAuthSession(auth.captureAuthSession());
    auth.installAuthSession('alice', 'alice-session', async () => null, 'local');
    await Promise.resolve();
    expect(imports.beginPositionImport(input).requestId).toBe(first.requestId);
    auth.endAuthSession(auth.captureAuthSession());
    await Promise.resolve();
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it('refuses to start an untracked import if storage is blocked or full', () => {
    const original = sessionStorage;
    vi.stubGlobal('sessionStorage', {
      getItem: original.getItem.bind(original),
      removeItem: original.removeItem.bind(original),
      setItem: () => {
        throw new Error('Quota');
      },
    });
    expect(() => imports.beginPositionImport(input)).toThrow('recovery could not be saved');
    expect(sessionStorage.getItem(storageKey)).toBeNull();
  });
  it('does not silently replace malformed recovery data with a new identity', () => {
    imports.beginPositionImport(input);
    const saved = JSON.parse(sessionStorage.getItem(storageKey)!);
    saved.attempts[0].requestId = 'corrupted';
    sessionStorage.setItem(storageKey, JSON.stringify(saved));
    expect(() => imports.beginPositionImport(input)).toThrow('recovery could not be read');
    expect(JSON.parse(sessionStorage.getItem(storageKey)!).attempts[0].requestId).toBe('corrupted');
  });
});
