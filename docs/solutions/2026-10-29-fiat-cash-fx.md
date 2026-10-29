# Current FX for fiat cash

## Problem

Manual fiat cash kept the quote saved when its asset was created. Current FX
could then price a purchase differently from its funding pile. An SGD400
purchase consumed more than SGD400 in the stale-quote fixture.

## Current contract

Manual `CASH` assets with USD, SGD, or GBP symbols represent native currency units.
USD has a unit price of one. SGD and GBP use validated USD FX within 48 hours.
Missing, invalid, stale, and future FX block cash writes. Catalog reads mark an
unavailable quote unpriced. Portfolio reads fail rather than report a false value.
The currency symbol also resolves legacy cash records with default USD metadata.

`fiatCashService` supplies the same quote rules for reads and transactions.
`projectNativeCosts` also projects cash value and uses the caller's transaction
when provided. Callers inside a transaction must pass it through. A cash import
must work with a one-connection pool.

FX publication writes the rate, cash quote, and stored current position values
in one Serializable transaction. Generic price refreshes skip these FX-managed
cash records. Read projection immediately fixes existing creation-time quotes,
without waiting for the next hourly refresh. An update failure rolls back the
entire FX transaction.
The existing FX job also refreshes at startup, so new GBP support does not wait
for the next hourly tick after deployment. Its hourly schedule stays the same.

Same-currency funding and proceeds use the captured native amount directly.
SGD400 consumes SGD400 even if USD FX moved after the form was reviewed.
Other transfers divide their USD amount by the destination's current USD quote.
Cancellation restores the recorded native units and basis, then values them at current FX.

GBP joins persisted USD rates. CoinGecko supplies its rate through the existing
exchange-rates response. Yahoo publication fallback bypasses stored and cached
values, requires a recent quote, and preserves its source timestamp. Refresh
must never label an old stored value as fresh.

Automatic snapshots capture summary, position rows, and conversion FX from one
database transaction. Benchmark network requests and historical metric queries
stay outside that transaction. A cash-only snapshot retains its native value
when the provider and stored FX differ.

Native quantities, recorded USD basis, history, and past snapshots are preserved.
Stablecoins and managed IBKR aggregate balances keep their existing contracts.
No schema migration, dependency, authentication policy, or live configuration change is required.

## Verification

The isolated real-API/PostgreSQL checks cover SGD funding, proceeds, cancellation,
insufficient funds, stale destination FX, and rollback after an injected valuation failure.
They also cover imports and snapshots with one database connection. Tests compare
native balances and recorded basis before and after each reversible operation.

This fixes current valuation. It does not reconstruct historic FX or rewrite past snapshots.
