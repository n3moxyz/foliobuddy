import { DismissableLayerBranch } from '@radix-ui/react-dismissable-layer';
import { Toaster } from 'sonner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useThemeStore } from '@/stores/themeStore';

/**
 * Below Tailwind's `sm` breakpoint (640px) content dialogs dock as full-width bottom
 * sheets, so a bottom-anchored toast would sit on top of — and, being interactive,
 * block — their action buttons. Toasts move to the top there instead.
 */
export const MOBILE_SHEET_QUERY = '(max-width: 639.98px)';

/** The mobile shell header is `h-14` (56px); keep top-anchored toasts just below it. */
export const MOBILE_TOP_OFFSET_PX = 64;

/**
 * The single app-wide Sonner toaster.
 *
 * - `theme` is passed through raw: Sonner resolves `'system'` itself and keeps its own
 *   `prefers-color-scheme` listener, so OS appearance changes re-theme toasts live.
 *   Resolving it here would freeze the toaster on the first-render scheme.
 * - `DismissableLayerBranch` tells Radix that pointer/focus events inside the toaster
 *   are not "outside" interactions, so dismissing a toast no longer closes whatever is
 *   open beneath it. This is app-wide by construction: every Radix layer (Dialog,
 *   Popover, Select, Tooltip, DropdownMenu) shares one `DismissableLayerContext`, which
 *   is also why the package must resolve to a single module instance (exact pin).
 *   Known limit: a modal Dialog's FocusScope still traps Tab, so keyboard users cannot
 *   reach a toast while a modal is open (pre-existing, independent of the Branch).
 * - `pointer-events-auto` undoes the `body { pointer-events: none }` lock Radix modal
 *   dialogs apply while open, which would otherwise make toasts inert.
 */
export function AppToaster() {
  const theme = useThemeStore((state) => state.theme);
  const isMobileSheetLayout = useMediaQuery(MOBILE_SHEET_QUERY);

  return (
    <DismissableLayerBranch>
      <Toaster
        theme={theme}
        position={isMobileSheetLayout ? 'top-center' : 'bottom-right'}
        offset={{ top: MOBILE_TOP_OFFSET_PX }}
        mobileOffset={{ top: MOBILE_TOP_OFFSET_PX }}
        closeButton
        richColors
        className="pointer-events-auto"
      />
    </DismissableLayerBranch>
  );
}
