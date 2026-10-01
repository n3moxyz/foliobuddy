---
depends-on: []
complexity: complex
status: active
---

# Sync IBKR on demand

User request: sync the latest IBKR records now, then build a button to sync IBKR
whenever needed.

The owner accepted a two-step handoff on 2026-10-01: the Mac is on, the button
opens the existing connected Codex chat, and the owner presses Send. The manual
reconciliation is complete and the daily Codex sync remains in place.

- [x] Fresh broker capture validated and current production records reconciled.
- [x] Private checkpoint verified before apply; independent readback confirms the
      saved state and preservation of USD records, histories and other brokers.
- [x] Existing implementation and official connection requirements inspected.

- [x] Verify a supported connection or Codex handoff without daily IBKR sign-in.
      The owner accepted opening the existing Codex chat and pressing Send.
- [x] Implement the owned-IBKR-only entry point and safe sync flow.
- [x] Verify sandbox setup, validation, keyboard focus, nested cash panel and
      desktop/mobile layouts. Link/request generation and failure handling tested.
- [x] Publish PR #55 and confirm CI. Pre-merge review found a manual-cash timestamp
      label issue; fixed with regression coverage before merging.
- [ ] After explicit merge authority, deploy and verify the first owner handoff.
      Computer Use blocks inspection of the Codex app itself, so the destination
      composer cannot be automatically inspected. No sandbox prompt was sent.

Plan: [On-demand IBKR sync](../docs/plans/2026-10-01-ibkr-on-demand-sync.md).
Private live reconciliation evidence remains under `.local/ibkr-sync/2026-10-01/`
and must not be committed.
