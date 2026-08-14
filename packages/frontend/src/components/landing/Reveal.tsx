import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useInViewOnce } from './useLandingMotion';

interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms, applied via transition-delay. Keep within 0–240ms. */
  delay?: number;
}

/**
 * Reveal-once on scroll: transition-based (interruptible) fade + 12px rise,
 * matching the app's `animate-fade-in-up` character. The CSS side lives in
 * index.css (`.landing-reveal`) and is disabled under prefers-reduced-motion.
 */
export function Reveal({ children, className, delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInViewOnce(ref);

  return (
    <div
      ref={ref}
      className={cn('landing-reveal', inView && 'landing-reveal-visible', className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
