---
status: complete
priority: p2
complexity: simple
depends-on: []
---

# Preview net P&L before logging a trade

The form should show the result of the entered prices and quantity before saving.
A compact summary above the submit button keeps the amount and return together;
an extra input or a separate calculator would add work to a simple entry flow.

- [x] Add a live summary to the existing create/edit trade form, matching saved
      long/short P&L and funding deductions. Use existing money/privacy formatting
      and semantic profit/loss tokens; no API or persistence changes.
- [x] Check input changes, net returns, incomplete/invalid values and privacy.
- [x] Inspect the real sandbox at desktop, medium and mobile widths.
- [x] Run frontend tests, build, lint and formatting; document the behavior.

Evidence: [verification](../../docs/qa/2026-10-02-trade-pnl-preview.md).
396 frontend tests, build, changed-file lint and root formatting passed.
Full lint's existing errors and dependency audit findings are recorded there.
The local preview was verified before publication.
