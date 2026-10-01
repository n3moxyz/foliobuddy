---
status: complete
priority: p1
complexity: complex
depends-on: []
---

# One-click IBKR sync without a chat Send step

Plan: [one-click sync](../docs/plans/2026-10-01-ibkr-one-click-sync.md).

- [x] Verify a supported direct connector read without credentials or a model turn.
- [x] Implement read-only Mac helper, pairing, receipts and verified checkpoints.
- [x] Implement signed-in browser orchestration and exact independent readback.
- [x] Test failure/ownership/concurrency paths and real sandbox UI.
- [x] Run relevant project checks and document setup/limits.
- [x] Deploy and pair only with the required authority.
- [x] Verify production button sync with broker-authoritative cash and bounded FX drift.

Implementation verified against the real local sandbox, including first pairing,
normal one-click sync, changed-line results and a verified no-change result.
PR #56 is merged and deployed, and the owner installed/paired the production helper.
Fresh broker verification passed before merge; the owner's subsequent button runs
hit a currency/BASE FX timing mismatch and stopped before writing. Browser-side
recovery now starts at most three independent fresh captures for that specific
preview failure. A persistent independently refreshed FX quote still blocked that
flow. The follow-up keeps the broker BASE authoritative and allows bounded FX
differences while retaining native-amount, ownership and write protections.

PR #58 is merged and deployed. The production button completed a fresh two-sample
capture at 2026-10-01T17:58:34.157Z, saved its private checkpoint and independently
verified all owned IBKR holdings, cash, source timestamps and unchanged history.
Native quantities, averages and currency balances were unchanged; the latest BASE
valuation was saved exactly. The page was reloaded and the persisted cash panel
verified while connected. Existing Mac pairing remains intact.
