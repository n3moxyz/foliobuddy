import { useEffect, useRef, useState, type RefObject } from 'react';

/** Live prefers-reduced-motion flag (updates if the OS setting changes mid-session). */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** True once the element has entered the viewport; stays true after (reveal-once). */
export function useInViewOnce<T extends Element>(ref: RefObject<T>, rootMargin = '-80px'): boolean {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, rootMargin, inView]);

  return inView;
}

/**
 * Scroll progress (0..1) through a tall container: 0 when its top reaches the
 * viewport top, 1 when its bottom reaches the viewport bottom. rAF-throttled,
 * passive listeners, no state updates when the value is unchanged.
 */
export function useScrollProgress<T extends HTMLElement>(ref: RefObject<T>): number {
  const [progress, setProgress] = useState(0);
  const frame = useRef(0);
  const last = useRef(-1);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const measure = () => {
      frame.current = 0;
      const rect = element.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;
      if (scrollable <= 0) {
        if (last.current !== 1) {
          last.current = 1;
          setProgress(1);
        }
        return;
      }
      const raw = -rect.top / scrollable;
      const next = Math.min(Math.max(raw, 0), 1);
      // Quantize so a 1px scroll doesn't trigger a render for an invisible change.
      const quantized = Math.round(next * 1000) / 1000;
      if (quantized !== last.current) {
        last.current = quantized;
        setProgress(quantized);
      }
    };

    const schedule = () => {
      if (frame.current) return;
      frame.current = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [ref]);

  return progress;
}

/**
 * Pointer-follow tilt for the hero panel: lerps toward the pointer each frame so
 * the motion has momentum instead of snapping. Returns a style transform string.
 * Disabled for touch-only devices and reduced motion (returns a flat transform).
 */
export function usePointerTilt<T extends HTMLElement>(ref: RefObject<T>, maxDegrees = 7): string {
  const [transform, setTransform] = useState('perspective(1200px)');
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const element = ref.current;
    if (!element || reduced) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const tick = () => {
      const dx = target.current.x - current.current.x;
      const dy = target.current.y - current.current.y;
      current.current.x += dx * 0.12;
      current.current.y += dy * 0.12;
      setTransform(
        `perspective(1200px) rotateX(${(-current.current.y * maxDegrees).toFixed(2)}deg) rotateY(${(
          current.current.x * maxDegrees
        ).toFixed(2)}deg)`
      );
      if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
        frame.current = requestAnimationFrame(tick);
      } else {
        frame.current = 0;
      }
    };

    const schedule = () => {
      if (!frame.current) frame.current = requestAnimationFrame(tick);
    };

    const onPointerMove = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect();
      target.current = {
        x: ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        y: ((event.clientY - rect.top) / rect.height - 0.5) * 2,
      };
      schedule();
    };

    const onPointerLeave = () => {
      target.current = { x: 0, y: 0 };
      schedule();
    };

    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerleave', onPointerLeave);
    return () => {
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerleave', onPointerLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [ref, maxDegrees, reduced]);

  return reduced ? 'none' : transform;
}
