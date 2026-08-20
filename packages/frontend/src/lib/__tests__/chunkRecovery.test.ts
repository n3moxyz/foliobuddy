import { describe, expect, it, vi } from 'vitest';
import { recoverFromVitePreloadError } from '../chunkRecovery';

function createStorage(initialValue: string | null = null) {
  let value = initialValue;

  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, nextValue: string) => {
      value = nextValue;
    }),
  };
}

describe('recoverFromVitePreloadError', () => {
  it('reloads once and prevents Vite from surfacing the stale chunk error', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = createStorage();

    expect(recoverFromVitePreloadError(event, { now: () => 1_000, reload, storage })).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.setItem).toHaveBeenCalledWith('foliobuddy:vite-chunk-reload-at', '1000');
  });

  it('does not create a reload loop when the chunk is still unavailable', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = createStorage('1000');

    expect(recoverFromVitePreloadError(event, { now: () => 30_000, reload, storage })).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('allows another recovery attempt after the cooldown', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = createStorage('1000');

    expect(recoverFromVitePreloadError(event, { now: () => 61_000, reload, storage })).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('falls back to the normal error boundary when session storage is unavailable', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('blocked');
      }),
      setItem: vi.fn(),
    };

    expect(recoverFromVitePreloadError(event, { reload, storage })).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
