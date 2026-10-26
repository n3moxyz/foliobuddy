# AppToaster

The app's single Sonner toaster; fire messages with the exported `toast`.

- Mount `AppToaster` once at the root, then call `toast.success("Prices refreshed")` or `toast.error("Price refresh failed")`.
- Toasts sit bottom-right on desktop. Below 640px they move to the top centre, 64px down, so they never cover a bottom-sheet dialog's buttons.
- Rich colours and a close button are on. Toasts stay clickable over modal dialogs, and dismissing one never closes the layer beneath.
- Its theme follows the app's theme store (`useThemeStore`, exported), including live OS changes on "system".
- Every failed mutation shows a failure toast. Copy, refresh and snapshot actions toast both outcomes.
- **Copy:** noun + past participle with no period ("Snapshot created", "Copy failed").

Source: `packages/frontend/src/components/layout/AppToaster.tsx`.
