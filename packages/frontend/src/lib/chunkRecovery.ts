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
 * reload loop. When recovery is suppressed, Vite throws the original error so
 * the normal Sentry error boundary remains available to the user.
 */
export function recoverFromVitePreloadError(
  event: Event,
  {
    now = Date.now,
    reload = () => window.location.reload(),
    storage = window.sessionStorage,
  }: ChunkRecoveryOptions = {}
): boolean {
  const currentTime = now();

  try {
    const previousTime = Number(storage.getItem(CHUNK_RELOAD_KEY));
    const elapsed = currentTime - previousTime;

    if (
      Number.isFinite(previousTime) &&
      previousTime > 0 &&
      elapsed >= 0 &&
      elapsed < CHUNK_RELOAD_COOLDOWN_MS
    ) {
      return false;
    }

    storage.setItem(CHUNK_RELOAD_KEY, String(currentTime));
  } catch {
    return false;
  }

  event.preventDefault();
  reload();
  return true;
}

export function installViteChunkRecovery(target: Window = window): void {
  target.addEventListener('vite:preloadError', recoverFromVitePreloadError);
}
