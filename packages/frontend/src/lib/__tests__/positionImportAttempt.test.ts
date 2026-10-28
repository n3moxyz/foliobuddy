import { afterEach, describe, expect, it } from 'vitest';
import { beginPositionImport, confirmPositionImport } from '../positionImportAttempt';
import { captureAuthSession, endAuthSession, installAuthSession } from '../authSession';

afterEach(() => endAuthSession(captureAuthSession()));

describe('pending position import identities', () => {
  it('retains an uncertain attempt through later callers until acknowledgement', () => {
    const first = beginPositionImport('[{"quantity":0.123456789}]');
    expect(beginPositionImport(first.input)).toBe(first);
    confirmPositionImport(first);
    expect(beginPositionImport(first.input).requestId).not.toBe(first.requestId);
  });

  it('keeps different batches distinct without changing their raw input', () => {
    const first = beginPositionImport('[{"avgCostNative":26.9265111111111}]');
    const second = beginPositionImport('[{"avgCostNative":26.9265111111112}]');
    expect(second.requestId).not.toBe(first.requestId);
    expect(first.input).toBe('[{"avgCostNative":26.9265111111111}]');
    expect(beginPositionImport(first.input)).toBe(first);
  });

  it('isolates pending attempts across sign-in sessions and stale acknowledgements', () => {
    installAuthSession('alice', 'alice-session', async () => null, 'local');
    const alice = beginPositionImport('same batch');
    installAuthSession('bob', 'bob-session', async () => null, 'local');
    const bob = beginPositionImport('same batch');
    expect(bob.requestId).not.toBe(alice.requestId);
    confirmPositionImport(alice);
    expect(beginPositionImport('same batch')).toBe(bob);
    installAuthSession('alice', 'new-alice-session', async () => null, 'local');
    expect(beginPositionImport('same batch').requestId).not.toBe(alice.requestId);
  });
});
