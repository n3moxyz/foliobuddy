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
