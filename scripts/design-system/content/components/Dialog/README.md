# Dialog

Radix modal dialog: a centred card (`radius-lg`, `shadow-lg`, at most 512px wide) over the theme-invariant `scrim-dialog`, with a 44px close button.

- **Parts:** `Dialog` (`open`, `onOpenChange`), `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.
- Always give it a `DialogTitle`, and usually a `DialogDescription`. The header reserves room for the close button.
- Footer buttons stack below 640px (the action on top) and sit right-aligned from 640px: outline "Cancel", then the action.
- Content scrolls inside the dialog (`max-height: 100dvh − 2rem`). Long forms add `max-h-[85vh] overflow-y-auto`. Content-heavy dialogs dock to the bottom of phones as sheets.
- Focus returns to whatever opened it, even for controlled dialogs without a trigger. Escape closes it unless an open asset search consumes Escape first.
- **Destructive confirm:** title "Delete Position"; description "Are you sure you want to delete your BTC position? This action cannot be undone."; footer Cancel and a destructive "Delete".

Source: `packages/frontend/src/components/ui/dialog.tsx`.
