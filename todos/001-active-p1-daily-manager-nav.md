---
depends-on: []
complexity: complex
---

# Accurate daily unit-trust NAVs

User request: “can you make sure the app pulls the latest and it's reflected accurately?”

## Approach

Use official daily manager NAVs for verified Amova SGD Class SG9999004360 and
LionGlobal SGD Decumulation SGXZ58947870 (LSSD). Yahoo lags; broker pages are SPA
shells. Unknown funds retain manual pricing. Store the native NAV and valuation
date independently of check time and USD conversion. No changes to holdings,
cost basis, trades, or historical snapshots.

## Implementation and acceptance

- [x] Validated manager adapters, exact identity/currency and calendar dates.
- [x] Atomic NAV/history/position persistence, failure status, same-date safety.
- [x] Hourly refresh and idempotent existing-record mapping; dry-run utility.
- [x] Statement history/manual fallback keep automatic ownership; no regression.
- [x] Native NAV, USD valuation, FX and visible dates/status reconcile.
- [ ] Meaningful tests, native checks, review and no-mistakes gate.
- [ ] Document model change and operations; verify deployed production records.
