# IBKR cash balances and daily reconciliation

## Decision

IBKR cash is one account balance made from several currencies, including borrowing. A positive USD cash row alone cannot represent it. Keep one USD cash position for portfolio totals and store the signed native currency balances behind it. Reveal these controls only for owned fiat cash at the IBKR broker. Other cash forms retain their existing behavior.

Daily reconciliation will read the IBKR plugin and use the existing signed-in FolioBuddy session. This avoids granting a general read-only agent key new write access or storing a new credential. Session expiration must produce a visible failure, never an unauthenticated workaround. Default schedule: 06:00 Asia/Singapore. Notify on changes or actionable failures; quiet when unchanged.

## Source and edit requirements

- Read positions, currency balances and account summary twice in a short capture window. Validate stable contract IDs, currencies, quantities and native averages. Check currency cash against the BASE aggregate and securities against the account summary. BASE is a total, never an extra cash holding.
- Convert the broker's aggregate cash using its reported base-to-USD rate, retaining native amounts, conversion rates, source and capture time. Expose positive balances as cash and negative balances as debt. Manual cash edits require recent real FX rates.
- Map holdings by saved IBKR contract ID or exact verified exchange ticker plus native currency. Unknown, ambiguous, duplicate, unsupported or unexpectedly empty portfolios stop the entire sync for review. Existing closed holdings become zero-quantity records; do not delete their histories.
- Preserve recorded USD purchase costs and all transaction histories. A current broker snapshot is a reconciliation, not evidence of a particular fill. Retain source captures and before/after records in a private, owner-scoped audit table.
- Preview and apply share one planner. Apply requires the exact current state hash, a fresh capture, and a serializable transaction. Retry of the same capture is idempotent. Restore is restricted to the exact latest unchanged financial state.
- IBKR multi-currency cash cannot fund the ordinary single-currency add/reduce control. Use the dedicated balances form or a fresh broker sync.

## Implementation

1. Merge and verify PR #52; apply the already-approved native cost repair with its downloaded backup.
2. Add nullable IBKR metadata to Position and an additive owner-scoped reconciliation audit table. Add protected cash/sync preview, apply, audit and restore routes; no broker write capability.
3. Add a cash/debt editor and source timestamp to IBKR fiat-cash details and form only. Add the broker capture and reconciliation controls there, with readable before/after values and backup download. Handle zero and negative net cash in totals, clipboard, charts and funding guards.
4. Add fictional IBKR balances to the real sandbox, meaningful source/ownership/atomicity/idempotency/restore tests, and mocked demo behavior. Inspect desktop and mobile and run the native build, checks and CI.
5. Open a feature PR with exact validation; obtain merge authority for this separate PR before deployment. Verify production and perform the first sync, then enable the daily thread heartbeat using the documented procedure.

## Acceptance

The six known equities keep their original recorded USD ledger and match IBKR quantities/native averages. IBKR cash contributes its signed net USD amount exactly once. Its selected cash position shows every currency, debt and capture time; Tiger and Binance show their ordinary controls. Incomplete, stale or conflicting inputs cannot partially change the portfolio. Backups and transaction histories survive reconciliation, and a verified restore recovers the prior state. The automation is only marked active after a successful production rehearsal.
