# StablecoinX (USDE) Missing From Equity Search

## Symptom

Portfolio → Add → Equity → Stock/ETF: searching `USDE` or `StablecoinX` shows nothing, although
Yahoo lists StablecoinX Inc. on Nasdaq as `USDE`. Company-name searches for any stock (`Nvidia`,
`DBS Group`) also return nothing; exact tickers (`NVDA`) still work. Unit-trust PDF import stops
mapping ISINs to Yahoo symbols.

## Cause

Three stacked bugs:

1. yahoo-finance2 3.14.0 validates `/v1/finance/search` against a schema expecting
   `typeDisp: "equity"`; Yahoo now sends `"Equity"`, so every `yahooFinance.search()` threw
   "Failed Yahoo Schema validation" in every region. The provider's `/v1/finance/lookup` fallback
   answers HTTP 429, leaving only the direct-quote path for ticker-shaped queries.
2. `PositionForm.tsx` hid a Yahoo hit whose ticker matched any catalog asset. The Ethena USDe
   stablecoin is stored as `USDE` (CoinGecko symbols are upper-cased), so StablecoinX was hidden.
3. `POST /assets/from-provider` (and from-coingecko, position bulk import, trade bulk import)
   reused any asset with the same symbol regardless of class, so picking StablecoinX would have
   attached the position to the stablecoin row.

## Fix

- `YahooFinanceProvider.search()`/`searchByIsin()` pass `{ validateResult: false }` and keep only
  well-formed quotes via `searchQuotesOf()`. `getNews()` (zero quotes) still validates.
- `components/portfolio/assetSearchMatching.ts` `isListedEquityCandidate()` hides a hit only when
  it is already listed: same Yahoo id, or same ticker on an EQUITY asset.
- `lib/domain.ts` `sameClassSymbolWhere()` / `sameClassSymbolKey()` restrict symbol fallbacks to the
  requested category group. Create routes check identity first (exact provider pair, then the
  legacy `coingeckoId` column). Position bulk import rows without a category reuse a ticker only
  when one group holds it and the row's price feed agrees; otherwise the row fails with
  "add category".

Regression coverage: `YahooFinanceProvider.searchSchema.test.ts` (real yahoo-finance2 against the
captured payload), `YahooFinanceProvider.test.ts`, `routes/assets.test.ts`,
`routes/positions.test.ts`, `routes/trades.test.ts` (catalog mocks evaluate Prisma `where` via
`__tests__/helpers/catalog.ts`), and `assetSearchMatching.test.ts`.

## Verification

Run the real provider against live Yahoo (`npx tsx` with `YahooFinanceProvider().search(...)`):
`StablecoinX` → `USDE` (StablecoinX Inc., NASDAQ), `Nvidia` → `NVDA`, `DBS Group` → `D05.SI`,
`searchByIsin('US0378331005')` → `AAPL`.

## Follow-up (same day): remaining symbol-only lookups

The first fix left nine more places treating a ticker as an identity. All now match identity
first, then a same-class ticker:

- `POST /assets` checks duplicates per category group (fiat cash `USD` beside a `USD` ETF).
- `POST /assets/unit-trust` looks up provider pair, then ISIN, then a unit-trust code.
- Crypto pickers (`PositionForm`, `AssetSearchDropdown`) hide a CoinGecko hit only via
  `isListedCoinCandidate()`: its CoinGecko id is catalogued, or a crypto asset has its ticker.
- Trades ticker views group by asset id; `?ticker=` stays readable and gains `&asset=<id>` only
  when two traded assets share the ticker (labels such as "BTC · Crypto" / "BTC · Equity", then
  the name, then a number for duplicate rows of one instrument).
- `SnapshotPosition.assetId` (migration `20260926000000_add_snapshot_position_asset_id`,
  nullable, no FK) is written on new snapshots. Older rows resolve by symbol; a shared symbol
  resolves only to an asset in an owned position created before the snapshot, otherwise
  `category: null`, and "Copy positions" then omits the category so a pasted import asks for one.
- Trade and position JSON imports create rows with `importPriceFeed()` (EQUITY → Yahoo ticker,
  coin → CoinGecko id, UNIT_TRUST → manual; a fund code is never used as a Yahoo id) and look that
  provider pair up first. Per-row errors in position, trade and snapshot bulk imports go through
  `userSafeErrorMessage()`, never raw Prisma text.
- Demo mode mirrors all of the above and seeds Ethena USDe plus a StablecoinX equity search hit, so
  `/dev/demo` reproduces the collision.
- Dev scripts `importExcel.ts` and `seed.ts` look up by identity. Excel Trading rows carry no
  category, so they reuse a ticker only when one asset class holds it.

Tests: `routes/assets.test.ts`, `routes/positions.test.ts`, `routes/trades.test.ts`,
`routes/snapshots.test.ts`, `snapshotService.test.ts`, `domain.test.ts`,
`assetSearchMatching.test.ts`, `AssetSearchDropdown.test.tsx`, `tradeLensModels.test.ts`,
`TickerPnLCard.test.tsx`, `SnapshotTable.test.tsx`, `dev/__tests__/demoMode.test.ts`.

## Follow-up 2: unpriced rows, repair runbook, deploy window

"Unpriced" means an automatic feed with no provider id (`isUnpricedAsset()` in `lib/domain.ts`):
the refresh job skips such rows forever. Older trade imports left equities like this on the
`coingecko` default, and the equity picker counted them as listed, hiding the real Yahoo hit.

- **Self-heal.** `POST /assets/from-provider` and `/from-coingecko` adopt the requested identity
  onto a row found only by the same-class symbol fallback when `canAdoptIdentity()` allows it:
  unpriced, the exact requested category (an ANGEL/NFT row shares the crypto group), and no
  coingeckoId, ISIN or native NAV of its own. A symbol match holding another coin's coingeckoId is
  never repointed. `/from-coingecko` also backfills the provider id of a legacy row found by its
  coingeckoId column (from-provider already did).
- **Pickers.** Selecting an unpriced equity in Add Position re-posts it to from-provider with its
  implied Yahoo ticker, which heals the row (or returns the live row that holds that ticker). The
  request carries identity only (`unpricedEquityRepairRequest()`): sending the dead row's exchange
  or currency would overwrite the live row through from-provider's metadata repair. The form then
  accepts only the same row or that live listing (`acceptsRepairedAsset()`, extending #47's pick
  guard, which refuses any other asset the server returns). In the crypto
  pickers an unpriced row never hides the CoinGecko hit (`isListedCoinCandidate()`), because
  picking that hit is what heals the row.
- **Bare tickers.** `impliedYahooTicker()` (backend `lib/domain.ts`, frontend
  `assetSearchMatching.ts`): Yahoo lists non-US shares with a suffix (`D05.SI`), so a bare ticker
  is a Yahoo id only on a USD row. Imports, the picker, the repair and demo mode all use it; a
  non-USD row with a bare ticker stays unpriced until the suffixed listing is picked.
- **Deploy window.** Position bulk import treats `category: null` like a missing category, so JSON
  copied by an old frontend during a deploy imports instead of failing validation.
- **Demo parity.** The unit-trust mock uses the backend's provider identity (fund manager, then
  `yahooSymbol`, then the fund-code slug); position import matches unit trusts by ISIN and refuses a
  different share class; from-provider/from-coingecko mirror the self-heal.

### Repair runbook (existing rows)

From `packages/backend`, with `DATABASE_URL` pointing at the target database:

```bash
npx tsx scripts/repair-unpriced-equities.ts
npx tsx scripts/repair-unpriced-equities.ts --apply
npx tsx scripts/repair-unpriced-equities.ts --apply --merge-duplicates
```

The first run is a dry run: it lists each unpriced EQUITY row with its ticker, name, currency,
exchange and the action it would take. `--apply` points lone rows at `(yahoo, TICKER)` in one
Serializable transaction. A row whose ticker a live Yahoo equity already holds is a duplicate:
`--merge-duplicates` repoints its positions, position history, trades and snapshot rows to the
live row, recounts, and only then deletes the dead row (asset deletes cascade, so the order
matters; any leftover reference aborts the whole run). The runner exits 1 while duplicates or
conflicts remain: a non-USD bare ticker, a ticker held by a non-equity row, or a bare ticker whose
live row lists in another currency or exchange. Resolve those by hand. `repairUnpricedEquities()`
lives in `src/services/catalogRepair.ts` (tests: `catalogRepair.test.ts`); it was also run against
a throwaway Postgres 16 with seeded rows (dry run, apply, merge) before shipping.

## Still open

- A merge can leave one user with two positions on the live row (the dead row's and their own);
  they value correctly but show as two rows until combined by hand.
- A merge drops the dead row's own metadata (ISIN, exchange, official domain) rather than copying
  it onto the live row. Dead rows from trade imports carry none.
