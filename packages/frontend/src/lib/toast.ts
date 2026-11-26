import { toast as sonnerToast } from 'sonner';

type Toast = typeof sonnerToast;

/**
 * Sonner's `toast`, except that error toasts stay until the user dismisses them.
 *
 * An error toast often carries the only explanation of what failed. Sonner's 4-second
 * default can remove it before someone using a screen reader, magnification or a slow
 * reading pace has read it (WCAG 2.2.1). Every toast has a close button (AppToaster), so
 * a persistent error costs one click. A caller can still pass its own `duration`.
 *
 * Import `toast` from here, not from 'sonner'.
 */
const error: Toast['error'] = (message, data) =>
  sonnerToast.error(message, { ...data, duration: data?.duration ?? Infinity });

export const toast: Toast = Object.assign(
  (...args: Parameters<Toast>) => sonnerToast(...args),
  sonnerToast,
  { error }
);
