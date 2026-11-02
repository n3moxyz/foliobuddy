import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from its previous value to the target using
 * requestAnimationFrame with ease-out-expo deceleration.
 *
 * Respects prefers-reduced-motion — returns the raw value instantly.
 */
export function useAnimatedNumber(target: number | null | undefined, durationMs = 600): number {
  const [display, setDisplay] = useState(target ?? 0);
  const prevTarget = useRef(target ?? 0);
  const rafId = useRef(0);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const value = target ?? 0;
    const from = prevTarget.current;
    prevTarget.current = value;

    // Skip animation if reduced motion preferred
    if (prefersReducedMotion.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(rafId.current);
    }

    // Skip animation on first render (from === 0 and value is the initial load)
    const diff = value - from;
    if (diff === 0) return;

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out-expo: fast start, smooth deceleration
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplay(from + diff * eased);

      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId.current);
  }, [target, durationMs]);

  return display;
}

/**
 * Multi-value variant of {@link useAnimatedNumber}: animates an array of targets
 * with a single shared requestAnimationFrame loop (one re-render per frame) rather
 * than N independent loops. The array length and ordering must be stable across renders.
 *
 * Only a change to a value already on screen ticks. A value that first arrives (null or
 * undefined before) shows at once, and so does every value when `resetKey` changes: pass the
 * view's unit or scope (currency, investor stake) so switching it doesn't count between views.
 *
 * Respects prefers-reduced-motion — returns the raw values instantly.
 */
export function useAnimatedNumbers(
  targets: Array<number | null | undefined>,
  durationMs = 600,
  resetKey?: string | number
): number[] {
  const normalized = targets.map((t) => t ?? 0);
  // A null entry is a value that hasn't arrived yet.
  const [shown, setShown] = useState<{ values: Array<number | null>; resetKey: typeof resetKey }>(
    () => ({ values: targets.map((t) => t ?? null), resetKey })
  );
  const prevTargets = useRef<Array<number | null>>(shown.values);
  const prevResetKey = useRef(resetKey);
  const rafId = useRef(0);
  const prefersReducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Stable primitive key encoding every value (an empty entry for a missing one) — the effect
  // fires only on real changes and fully reconstructs the values from it, so no array identity
  // leaks into deps.
  const key = targets.map((t) => t ?? '').join('|');

  useEffect(() => {
    const values = key.split('|').map((v) => (v === '' ? null : Number(v)));
    const reset = prevResetKey.current !== resetKey;
    const from = reset ? values : prevTargets.current;
    prevTargets.current = values;
    prevResetKey.current = resetKey;

    if (!reset && values.every((v, i) => v === from[i])) return;

    const hasChange = values.some((v, i) => v !== null && from[i] != null && v !== from[i]);
    if (prefersReducedMotion.current || !hasChange) {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => setShown({ values, resetKey }));
      return () => cancelAnimationFrame(rafId.current);
    }

    const start = performance.now();
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setShown({
        resetKey,
        values: values.map((v, i) => {
          const f = from[i];
          return v === null || f == null ? v : f + (v - f) * eased;
        }),
      });
      if (progress < 1) {
        rafId.current = requestAnimationFrame(tick);
      }
    };

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId.current);
  }, [key, resetKey, durationMs]);

  // Until the effect catches up, a new view and newly arrived values render as their targets.
  if (shown.resetKey !== resetKey) return normalized;
  return shown.values.map((v, i) => v ?? normalized[i]);
}
