---
status: done
priority: p2
complexity: moderate
depends-on: []
---

# Complete trade names and save the default trade order

- [x] Compare saved-default sorting with remembering each temporary header click.
- [x] Choose an explicit browser preference, shared by Settings and all trade tables.
- [x] Verify the imported asset names against primary sources and repair only those names.
- [x] Show the asset name below every ticker.
- [x] Add entry-date, exit-date, and date-logged defaults in both directions.
- [x] Keep temporary column sorting and return to the selected default after clearing it.
- [x] Test chronology, missing exit dates, persistence, and the rendered controls.
- [x] Update project guidance and record the result.

Acceptance: verified names appear under tickers. The default starts at entry date,
newest first. The selected default survives a reload and applies to the Review
and Ticker tables and their status filters. Missing dates stay last in either direction.

Keep the existing visual style. Use installed controls and client preference
patterns. Do not change prices, quantities, dates, P&L, or provider identities.

Verified in the real sandbox at desktop, 768px, and 390px widths. All 487
frontend tests passed. Backend, frontend, and shared builds passed. The live
metadata repair changed only five asset names. The frontend code awaits release.
