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

## Still open

`POST /assets` and `POST /assets/unit-trust` still reject by bare symbol, crypto pickers still hide
same-ticker coins, Trades ticker views group by symbol, snapshot detail labels look up by symbol,
demo mode mirrors the old matching, and trade JSON import creates unpriceable equity rows.
