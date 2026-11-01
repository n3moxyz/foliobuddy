# HelpTooltip

The "?" button that defines a finance term: a 14px `HelpCircle` in a 44px round hit area (36px from 640px up) that opens a 240px tooltip on hover, focus or tap.

- **You provide:** `content` (one or two plain sentences) and `label` (the term). The accessible name becomes "Help: Exposure", so screen-reader control lists are not all "Help".
- Place it right after the label it explains: `flex items-center gap-1`, label `text-xs text-muted-foreground`.
- One definition shows at a time: opening one closes any other. A tap toggles it, a mouse or pen click keeps it open, and Enter toggles it. It stops propagation, so it never toggles a parent collapsible card. Keep it outside links.
- Write definitions the way the product does: "Largest peak-to-trough decline in USD this year. The date below marks the trough."

Source: `packages/frontend/src/components/ui/HelpTooltip.tsx`.
