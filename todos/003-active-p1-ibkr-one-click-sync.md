---
status: active
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
- [ ] Verify production button sync after bounded FX-capture recovery.

Implementation verified against the real local sandbox, including first pairing,
normal one-click sync, changed-line results and a verified no-change result.
PR #56 is merged and deployed, and the owner installed/paired the production helper.
Fresh broker verification passed before merge; the owner's subsequent button runs
hit a currency/BASE FX timing mismatch and stopped before writing. Browser-side
recovery now starts at most three independent fresh captures for that specific
preview failure, preserving all existing validation and write protections.
