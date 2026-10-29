---
status: active
priority: p1
complexity: complex
depends-on: []
---

# Recover imports after reload and value fiat cash at current FX

Edward explicitly requested both remaining limits from the journey audit be fixed.

Approach: persist pending position import batches and their request IDs in tab-scoped
session storage. Bind recovery to the API, owner, and sign-in session. Restore only
through an explicit recovery action. Refuse an import if recovery cannot be saved.

Fiat cash uses validated current USD FX instead of creation-time quotes. Reuse the
existing FX transaction for stored valuation refreshes. Preserve native quantities,
recorded cost basis, historical snapshots, and managed IBKR aggregate semantics.

- [x] Add durable pending import identities and a recovery action after reload.
- [x] Cover session isolation, storage failure, uncertain responses, and acknowledgement.
- [x] Price supported fiat cash consistently in reads, funding, proceeds, and FX updates.
- [x] Add real-rate GBP support and reject missing or stale FX for cash writes.
- [x] Verify reload after a committed response loss against real local PostgreSQL.
- [x] Verify SGD funding, proceeds, cancellation, and FX refresh against real records.
- [x] Run project checks and document changed contracts and remaining limits.
- [ ] Complete PR review, merge, and exact production deployment verification.

Acceptance: reload recovery replays the original request ID without duplicate rows.
SGD400 of funding consumes SGD400 when the purchase and cash use the same rate.
Fiat value changes with validated FX. Cost basis and native balances remain intact.
No authentication policy, schema migration, dependency, or live configuration change is needed.
