# Tooltip

Radix tooltip: a short label in a small `popover` box, portaled to `<body>` so it never inherits text styles or gets clipped.

- **Parts:** `TooltipProvider` (the app uses a 150–200ms delay), `Tooltip`, `TooltipTrigger` (`asChild`), `TooltipContent` (`side`).
- Label icon-only controls and the collapsed sidebar rail with it.
- Hover tooltips never hold information people need on touch screens. Definitions use `HelpTooltip`, which opens on tap.

Source: `packages/frontend/src/components/ui/tooltip.tsx`.
