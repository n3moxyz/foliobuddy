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
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;
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
