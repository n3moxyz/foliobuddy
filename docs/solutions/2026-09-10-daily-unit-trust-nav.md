# Daily unit-trust NAV accuracy

## Symptoms and cause

Amova's SGD Class had only an April statement NAV; generic refresh read that
history row and set `priceUpdatedAt` to today. LionGlobal Decumulation was on the
correct Yahoo ticker, but Yahoo lagged its manager and the provider discarded
`regularMarketTime`. Multiplying a frozen USD price by newer FX could also change
the apparent SGD NAV. WebSocket “Live” describes connectivity, not NAV timing.

## Source contracts

- [Amova SGD Class](https://sg.amova-am.com/general/funds/detail/amova-singapore-equity-fund-sgd-class):
  SG9999004360, DBSTTFI SP. Parse the active header and labelled NAV, not class A/B
  options or the performance table. The FSMOne parser maps the exact legacy
  label and SGD currency from `FUND_MANAGER_SOURCES` to this ISIN.
- [LionGlobal Decumulation](https://www.lionglobalinvestors.com/en/fund.html?officialNav=LSSD):
  SGXZ58947870, LNWSSGC SP. Fetch `fundlist?fcode=LSSD` and `ffacts?fcode=LSSD`
  at `https://api.lionglobalinvestors.com/` and verify identity/currency/daily frequency.
  LSDS and FSM LCP058 identify other classes.

Both are dealing-day NAVs. Sources are checked at startup and hourly at minute 5.
The two manager adapters fail closed on changed markup, invalid/missing identity,
currency, date or value; redirects and non-allowlisted identifiers are rejected.
No API key is required. Unknown funds remain manual.

## Persistence and ownership

`Asset.currentPriceNative` is an intentional exception to the old “USD only”
rule for unit trusts. It preserves the published NAV. `priceAsOf` is its valuation
date; `priceCheckedAt`/`priceCheckStatus` describe an attempted external check.
`priceSource` distinguishes a verified automatic quote from a statement fallback;
`priceFxRateToUsd` explains USD conversion. `priceUpdatedAt` mirrors the source date
for unit trusts for older consumers. Do not derive NAV freshness from check time.

NAV, history and every linked position valuation change in a Serializable
transaction. All FX write paths revalue native NAVs in the same transaction as the
rates. No fallback FX is used for NAV writes; a valid rate within 48 hours is
required. Same-day rechecks use the same observation key; the date never advances
just because FX changes. Automatic quotes older than the last accepted automatic
NAV or more than seven days old are rejected. Failures retain all last-good
valuation fields.

`PriceHistory` uniqueness includes source, preserving both a statement observation
and the manager NAV on the same day. Imports never change an automatic provider
or overwrite its verified current quote. Manual entries can initialize a dated
fallback before an automatic quote has succeeded. They remain history thereafter.
The first valid manager quote takes ownership from that fallback even when the
fallback carries a later date (a today-dated form default against a T-1 dealing
NAV); the manual record stays in source-separated history. Manual-only older
imports also cannot regress current valuation.

## Operations and verification

The schema migration recovers manual NAV dates from dated history. The startup
mapping is idempotent and limited to three exact identities: a verified
ISIN/currency pair, the known legacy Amova record (id/symbol/name/provider), or
a no-ISIN SGD unit trust already priced by Yahoo on the exact LionGlobal ticker
`0P0001OPAN.SI`. That Yahoo record is rewritten to the `fund-manager` provider on
the next startup or hourly tick. Ambiguous candidates are reported and left
unchanged; established feeds and unaffected funds continue refreshing. Imports
reuse the verified share-class identity before trying a symbol. Neither imports
nor the admin catalog edit (`PUT /assets/:id`) can change currency, provider
identity or category behind a stored native NAV; both answer 409 and write
nothing, while name, symbol, exchange and official-domain edits stay allowed.
Invalid legacy native records are explicitly logged and retained while valid FX
valuations continue.
Mapping does not alter positions, costs, snapshots or trades. No historical equity
backfill is involved.

For an operator dry-run, set `DATABASE_URL` explicitly (or in backend `.env.local`)
and run from `packages/backend`:

```sh
npx tsx scripts/configure-unit-trust-nav.ts
npx tsx scripts/configure-unit-trust-nav.ts --apply
```

`--apply` maps and checks manager sources; exits nonzero on conflicts or price errors. Normal
production startup performs the same mapping/check without a separate script.
Check both fund assets for exact ISIN/native NAV, `priceAsOf`, `priceCheckedAt`,
`priceCheckStatus`, USD conversion and all linked market values. Compare dates
and native amounts directly with the manager endpoints. Verify the deployed
commit/container before trusting the global health endpoint.

The schema changes the history unique key. An older backend must not be restored
without a compatible forward fix: old manual upserts target the retired key.
Keep the source-separated history; do not delete observations to enable rollback.

CI runs `scripts/verify-unit-trust-nav.ts` against isolated PostgreSQL 17 after
all migrations. The script refuses anything except the named
`foliobuddy_nav_test` database on loopback. It checks two broker rows, unchanged
native NAV with changed FX, concurrent refresh, history separation, wrong/stale
quotes, transaction rollback and unchanged snapshots. Parser/service/UI tests
also run in the ordinary test suites.

The integration script replays both managers' wire responses over loopback HTTP
through the real providers and refresh service. Fifteen wrong-class, currency,
price, date and malformed-response cases must retain the last good quote,
history and every broker value while recording a failed check. Valid responses
before and after each fund's failure cases verify the setup and recovery. Only
transport is redirected; parser and persistence logic are never stubbed. This
gives runtime failure evidence without changing or relying on broken public
manager endpoints.

Review regressions cover legacy intraday timestamps, same-day source precedence,
failed-check cache invalidation, initial-save atomicity and open-detail updates.
FX invalidation is published after every successful FX transaction. Generic
position recalculation excludes unit trusts, whose valuation is owned by the
NAV transaction, so it cannot overwrite a concurrent FX revaluation.
Create, bulk import, edit and history cancellation also read and write NAV
valuations in Serializable transactions. FX revaluation prevalidates every
linked position before writing a fund, so an overflowing legacy position is
reported without blocking healthy funds or partially updating its own asset.
