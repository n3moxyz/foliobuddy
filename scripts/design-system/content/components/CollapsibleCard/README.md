# CollapsibleCard

A card whose header opens and closes its body: chevron, optional category icon, title, optional help and a right-hand summary.

- **You provide:** `title`, `isExpanded`, `onToggle`, `children`, and optionally `icon`, `accentColor` (classes such as `border-crypto/40 bg-crypto/5`), `titleHelp` (a `HelpTooltip`), `headerRight` (totals, P&L) and `headerExtra`.
- The heading wraps the trigger button (`<h2><button>`), never the reverse, so screen readers can jump between sections.
- **Portfolio sections:** Crypto (`Coins`, `accent-crypto`), Equities (`LineChart`, `accent-equities`), Cash (`Banknote`, `accent-cash`), Held for Others (`Users`, `accent-custody`).
- It opens over 200ms and closes over 150ms. Remember each section's state between visits.

Source: `packages/frontend/src/components/portfolio/CollapsibleCard.tsx`.
