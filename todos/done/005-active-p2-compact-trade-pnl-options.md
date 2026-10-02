---
status: done
priority: p2
complexity: simple
depends-on: []
---

# Compare compact P&L previews between Quantity and Funding Cost

- [x] Use the explicitly requested prototype workflow; define three distinct layouts.
- [x] Build an isolated, interactive picker with realistic trade-form context.
- [x] Verify all layouts, live inputs, picker keys, reload persistence and mobile sizing.
- [x] Present the options for selection.
- [x] Apply the selected variant to the existing trade form and remove the prototype.

Explore Inline (borderless row), Strip (shallow tinted band) and Stack (centered
amount over percentage). All show figures only and retain net P&L math/privacy.
Selected: Inline, revised to sit below Funding Cost with a visible `Net P&L:`
label. Funding typing and clearing update both amount and return immediately.
Prototype files removed; final form: `http://localhost:4200/trades`.
397 frontend tests, frontend build/typecheck, changed-file lint and root
formatting passed. Desktop/mobile and focused funding-input readback verified.
Evidence: [verification](../../docs/qa/2026-10-02-trade-pnl-preview.md).
Local verification completed before the authorized publication.
