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
- [ ] Deploy and pair only with the required authority; verify production separately.

Implementation verified against the real local sandbox, including first pairing,
normal one-click sync, changed-line results and a verified no-change result.
Direct broker reads through the final helper succeeded; that live capture failed
the existing currency/BASE total guard and was not applied. No validation tolerance
was widened. Production activation remains separate from code delivery.
