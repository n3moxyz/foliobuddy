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
  it('reloads once and preserves the original Vite rejection while navigation is pending', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = createStorage();

    expect(recoverFromVitePreloadError(event, { now: () => 1_000, reload, storage })).toBe(true);
    expect(event.defaultPrevented).toBe(false);
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
    expect(event.defaultPrevented).toBe(false);
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

  it('does not reload when the cooldown cannot be persisted', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };

    expect(recoverFromVitePreloadError(event, { reload, storage })).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('preserves the original error when accessing sessionStorage itself throws', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const reload = vi.fn();
    const storageGetter = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new DOMException('Storage unavailable', 'SecurityError');
    });

    try {
      expect(recoverFromVitePreloadError(event, { reload })).toBe(false);
      expect(event.defaultPrevented).toBe(false);
      expect(reload).not.toHaveBeenCalled();
    } finally {
      storageGetter.mockRestore();
    }
  });

  it('reloads only once for multiple failures before navigation completes', () => {
    const reload = vi.fn();
    const storage = createStorage();
    const first = new Event('vite:preloadError', { cancelable: true });
    const second = new Event('vite:preloadError', { cancelable: true });

    expect(recoverFromVitePreloadError(first, { now: () => 1_000, reload, storage })).toBe(true);
    expect(recoverFromVitePreloadError(second, { now: () => 2_000, reload, storage })).toBe(false);
    expect(reload).toHaveBeenCalledOnce();
    expect(first.defaultPrevented).toBe(false);
    expect(second.defaultPrevented).toBe(false);
  });
});
