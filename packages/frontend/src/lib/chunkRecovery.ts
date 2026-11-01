const CHUNK_RELOAD_KEY = 'foliobuddy:vite-chunk-reload-at';
const CHUNK_RELOAD_COOLDOWN_MS = 60_000;

interface ChunkRecoveryOptions {
  now?: () => number;
  reload?: () => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/**
 * Recover once from a stale Vite lazy-chunk URL after a deployment.
 *
 * The cooldown keeps a genuinely unavailable asset from creating an automatic
 * reload loop. Keep Vite's original rejection even while a reload is pending:
 * cancelling the event makes a failed import resolve to undefined, which crashes
 * React.lazy when it reads the module's default export.
 */
export function recoverFromVitePreloadError(
  _event: Event,
  { now = Date.now, reload = () => window.location.reload(), storage }: ChunkRecoveryOptions = {}
): boolean {
  const currentTime = now();

  try {
    const recoveryStorage = storage ?? window.sessionStorage;
    const previousTime = Number(recoveryStorage.getItem(CHUNK_RELOAD_KEY));
    const elapsed = currentTime - previousTime;

    if (
      Number.isFinite(previousTime) &&
      previousTime > 0 &&
      elapsed >= 0 &&
      elapsed < CHUNK_RELOAD_COOLDOWN_MS
    ) {
      return false;
    }

    recoveryStorage.setItem(CHUNK_RELOAD_KEY, String(currentTime));
  } catch {
    return false;
  }

  reload();
  return true;
}

export function installViteChunkRecovery(target: Window = window): void {
  target.addEventListener('vite:preloadError', recoverFromVitePreloadError);
}
