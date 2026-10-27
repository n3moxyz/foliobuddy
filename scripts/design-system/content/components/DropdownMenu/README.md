# DropdownMenu

Radix dropdown menu for overflow (⋮) actions: a `popover` surface with `shadow-md` and items that grow to 44px on touch layouts.

- **Parts:** `DropdownMenu`, `DropdownMenuTrigger` (usually `asChild` around an icon `Button` with an `aria-label`), `DropdownMenuContent` (`align="end"` under header buttons), `DropdownMenuItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuShortcut`, and the checkbox, radio and sub-menu parts.
- Give each item a 16px lucide icon with `mr-2`.
- Destructive bulk actions ("Delete All Positions") live here, last, after a separator, with `className="text-destructive"` and a `Trash2` icon. They never appear as header buttons.
- On phones, secondary header actions (Refresh, Export) move into this menu.

Source: `packages/frontend/src/components/ui/dropdown-menu.tsx`.
