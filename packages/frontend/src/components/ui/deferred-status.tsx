import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Long enough for screen readers to register the empty region before its text arrives. */
export const DEFERRED_STATUS_DELAY_MS = 150;

/**
 * A polite live region (`role="status"`) that mounts empty and fills in its text a
 * moment later.
 *
 * Screen readers announce changes to a live region they already know about. A region
 * that mounts together with its text, such as a loading message rendered in place of
 * content, is often not announced at all. Mounting empty first turns the message into a
 * change. Later changes to `children` are announced as usual. A load that finishes
 * within the delay announces nothing, which is fine: there was nothing to wait for.
 *
 * Visually hidden by default. Keep any visible copy of the text `aria-hidden` so it is
 * not read twice.
 */
export function DeferredStatus({
  children,
  className = 'sr-only',
}: {
  children: ReactNode;
  className?: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setReady(true), DEFERRED_STATUS_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <span role="status" className={cn(className)}>
      {ready ? children : null}
    </span>
  );
}
