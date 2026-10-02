---
status: active
priority: p1
complexity: complex
depends-on: []
---

# Daily IBKR reconciliation on Merlin

Approved plan: [Merlin background sync](../docs/plans/2026-10-02-ibkr-merlin-background.md).

- [x] Verify Merlin's existing read-only connector and confirm scheduling limits.
- [x] Obtain approval for a browser-free worker and narrowly scoped app authorization.
- [x] Implement and test device grants, replay protection and atomic reconciliation.
- [x] Implement and test private worker, enrollment, scheduling and crash guards.
- [x] Add and visually verify owner connection/status/revocation in the IBKR panel and Settings.
- [x] Complete database integration, project checks and independent review.
- [x] Document setup/recovery.
- [x] Publish the reviewable PR and verify CI.
- [ ] Deploy, install and complete owner enrollment with required authority.
- [ ] Verify a fresh production run, then retire the old local heartbeat.

Complexity: files 3, dependencies 1, cross-cutting 3, unknowns 3, regression risk 3
(13/15). No new runtime dependency is planned. The existing heartbeat remains active
until the replacement is verified; implementation is not a completed migration.

Local verification: 1,277 tests, full build, formatting/shell/domain checks, isolated
PostgreSQL integration, and desktop/mobile sandbox checks passed. The signed worker
rehearsal covered changed holdings, FX-only updates, initial contract linking,
private checkpoints, independent readback, and confirmed device revocation. Final
security, architecture, performance and correctness review findings were resolved.

[PR #59](https://github.com/n3moxyz/foliobuddy/pull/59) contains the implementation
and multi-user corrections. Merlin's 23 worker tests also passed. Its public
enrollment proof, immutable runtime and private file permissions are verified;
the schedule is disabled and no production grant is enrolled. Merge is authorized once the multi-user review passes;
owner authorization and a fresh verified production run remain outstanding.

Multi-user follow-through: separate login caches, token identity checks, queued
mutation guards and async cancellation; fresh owner permits for the on-demand
helper; persistent connector-owner binding; generic Mac setup; two-owner database,
HTTP and account-switch regressions. The final real-app sandbox run preserved all
native records, unrelated positions and histories, verified its private checkpoint
and independently read back the saved source timestamp. Merge requires the final
independent review and matching-commit CI; production activation remains separate.
