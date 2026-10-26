# Button

The one button: six variants and four sizes, with 44px touch targets that compact from 640px up.

- **Variants:** `default` is the `primary` fill — once per view, for the thing the page is for. `outline` carries secondary actions and Cancel. `secondary` is a quiet filled alternative. `ghost` serves toolbar icons and row actions. `destructive` confirms a delete. `link` is inline navigation in `primary-text`.
- **Sizes:** `default` 44px → 40px; `sm` 44px → 36px (page-header actions); `lg` 44px with 32px side padding (landing calls to action); `icon` a 44px → 40px square.
- **You provide:** the label as children, plus any button attributes. `asChild` renders your child element (a router `<Link>`, an `<a>`) with button styling.
- **Icons:** lucide at 16px (`h-4 w-4`) before the label with `mr-2`; `mr-1` in `sm` header buttons. Icon-only buttons need an `aria-label`.
- **Copy:** Title Case verb + noun in the app ("Add Position", "Refresh Prices"). Sentence case on the landing page ("Sign in", "See how it works").
- **Don't** show a destructive button in a page header. "Delete All" lives in the ⋮ overflow menu.
- Keyboard focus shows `focus-ring`. Disabled drops to 50% opacity and ignores the pointer.

Source: `packages/frontend/src/components/ui/button.tsx`.
