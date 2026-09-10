---
depends-on: []
complexity: complex
status: complete
completed: 2026-09-11
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
- [x] Meaningful tests, native checks, review and no-mistakes gate.
- [x] Document model change and operations; verify deployed production records.

## Production verification

[PR #38](https://github.com/n3moxyz/foliobuddy/pull/38) merged as
`b710ef6db0a3a923ac320ca595ed7bd29a1bf9c7`. The merged source tree exactly matches
the validated `faf2da8` tree. The no-mistakes run completed with outcome `passed`.
[Final PR CI](https://github.com/n3moxyz/foliobuddy/actions/runs/34500962079),
[main CI](https://github.com/n3moxyz/foliobuddy/actions/runs/34501368271), and
[backend deployment](https://github.com/n3moxyz/foliobuddy/actions/runs/34501368268)
passed; Vercel also reported success for the merge commit.

Read-only production reconciliation after deployment confirmed both exact fund
identities use the manager feed: Amova SGD 6.0462 and LionGlobal SGD 1.5930, both
as of 9 September 2026, matching fresh official-source responses. All three broker
positions, USD/SGD conversion, market values and P&L reconcile. Original position,
trade, position-history and snapshot fingerprints are unchanged.

The signed-in production portfolio, both NAV dialogs and position details show
the same four-decimal NAVs, valuation dates, manager source and successful check
time. The backend's initial two startup health probes returned 502; the third
returned 200 and the deployment workflow succeeded. No rollback was needed.

This completion receipt was recorded after production verification on 11 September 2026.
