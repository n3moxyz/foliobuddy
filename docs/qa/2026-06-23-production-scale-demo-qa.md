# Production-Scale Local QA - 2026-06-23

## Scope And Safety

- Target: dev-only demo app at `http://localhost:4000/dev/demo`.
- Data policy: sanitized synthetic data only. No production database, no `db:sync`, no live account data.
- Backend note: local backend health timed out during setup, so authenticated user workflows were tested through the production-shaped `/dev/demo` mock API.
- Destructive actions skipped in browser: delete all, row deletes, export downloads, production/auth admin writes.
- Known non-actionable console warnings: React Router v7 future flags and Clerk development-key warning.

## Scale Dataset

Built through visible import/create UI workflows in the same SPA session:

- Positions: 33 total, 30 owned, 3 custody; crypto, equities, unit trusts, stablecoins, fiat cash, angel, NFT, local-currency equity, multiple storage locations.
- Trades: 49 total rows, 40 closed analytics rows, 9 open rows; long/short, profitable/loss-making, crypto/stables/cash/NFT/angel categories.
- Snapshots: 125 total rows, one-year synthetic history at 3-day intervals plus seed automatic/manual snapshots.
- Investors: 4 rows after QA add; 100% allocated stake plus one zero-stake investor.
- Assets: 65 assets after imports, reflected in Settings refresh-prices copy.

## Roles And Route Inventory

Detailed ongoing inventory lives in `docs/qa/user-facing-inventory.md`. The table below records the
scoped demo-mode pass from this date; the goal is not complete until the detailed inventory is run
against the sanitized local database and rerun after fixes.

| Surface    | User-Facing Controls And States                                                                                                                                                        | Acceptance Criteria                                                                                                                              | Finite Edge Cases                                                                                                       | QA Status                                                                |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| App shell  | Sidebar links, mobile drawer, collapse rail, currency toggle, theme toggle, refresh prices, export action, overflow menu, demo avatar                                                  | Navigation preserves SPA state, active item is visible, top actions do not overlap, mobile drawer exposes all routes                             | Desktop rail collapsed/expanded, 390px drawer, hidden desktop actions in mobile overflow                                | Pass                                                                     |
| Auth/roles | Clerk unauthenticated route, authenticated user, admin-only global asset mutations                                                                                                     | Unauthenticated production routes go through Clerk; authenticated demo user can use app; admin-only asset catalog changes remain backend-guarded | Demo bypasses Clerk by design; production/admin writes not tested without approval                                      | Static inventory only                                                    |
| Dashboard  | DB health, investor filter, net worth hero, KPI tooltips, value chart period buttons, benchmark chart, allocation donuts, performers                                                   | Renders scaled data, no blank charts, period controls update visible chart, allocation and performers tolerate duplicate assets                  | Duplicate position asset IDs, 125-point history, negative PnL, custody excluded, investor stake multiplier              | Pass after fix                                                           |
| Portfolio  | Copy All, Add Position, overflow menu, hero summary, section collapse, equity By Broker/By Type toggle, mobile All columns/Compact, Add/Edit/Import modal, custody, funding, NAV modal | Imports succeed, totals update, owned/custody split stays correct, local-currency labels render, NAV modal opens without mutation                | 33 rows, 3 custody rows, unit trust NAV age, local currency equity, repeated storage locations, mobile horizontal table | Pass                                                                     |
| Trades     | Copy All, Log Trade, overflow menu, Review/Ticker/Monthly lenses, All/Open/Closed filters, row detail modal, copy/edit/delete row actions, import tab                                  | Imports succeed, analytics recompute, filters match counts, monthly postmortem renders, detail modal opens from keyboard/click target            | 49 rows, 9 open trades, 40 closed trades, short trades, open trade with no exit, large loss/win outliers                | Pass; copy risk noted                                                    |
| History    | Copy All, Add Snapshot, overflow menu, All/Automatic/Manual filters, expand row details, copy/edit/delete actions, import tab                                                          | Imports succeed, counts update, filters render large table, performance history feeds Dashboard                                                  | 125 rows, duplicate day upsert, pending live row, manual vs automatic source split                                      | Pass for import/filter; row expand not fully exercised due broad locator |
| Investors  | Add/Edit/Delete actions, owner badge, stake/current value/YTD calculations                                                                                                             | Investor add works, totals recompute from scaled portfolio value, zero-stake investor is allowed and clear                                       | 100% allocated stake, zero-stake investor, owner row, negative YTD for new capital with no stake                        | Pass                                                                     |
| Settings   | Currency select, theme select, refresh prices, refresh FX, create snapshot, export Excel/CSV, About                                                                                    | Settings show current FX, scaled asset count, currency select changes and restores without errors                                                | 65 assets, mobile layout, export/download skipped, create snapshot skipped                                              | Pass                                                                     |

## Bug Log

### BUG-001 - Demo mock endpoints did not cover visible workflows

- Evidence: route inventory showed trade import, snapshot import, investor CRUD, snapshot CRUD, and manual NAV update falling through to generic `{ ok: true }` or stale fixtures. User-visible workflows could show success while source pages did not update.
- Repro: use `/dev/demo/trades` Log Trade -> Import before the fix; import results expected `results[]`, but the generic response did not provide it. Similar gaps existed for `/snapshots/bulk`, `/investors`, `/assets/:id/nav`.
- Shared cause: demo mock only implemented portfolio CRUD/import deeply, while other routes were static or generic.
- Fix: `packages/frontend/src/dev/demoMode.tsx` now has mutable stores and handlers for trades, snapshots, investors, NAV, analytics, performance history, and resettable test state.
- Regression: `packages/frontend/src/dev/__tests__/demoMode.test.ts` covers trade bulk import analytics, snapshot performance history, investor CRUD/reassign, and NAV recomputation.
- Rerun: Pass through UI imports for positions/trades/snapshots and investor add.

### BUG-002 - Duplicate React keys in Dashboard performers under scale data

- Evidence: browser console error after scaled Dashboard render: duplicate key `cash-sgd` in `PerformersCard`.
- Repro: render Dashboard with multiple positions sharing one asset ID, such as separate cash positions for the same asset.
- Shared cause: performers API returns asset-level fields only, but the UI used `assetId` as a unique row key.
- Fix: `packages/frontend/src/components/dashboard/PerformersCard.tsx` keys rows by `assetId` plus rank index.
- Regression: `packages/frontend/src/components/dashboard/__tests__/PerformersCard.test.tsx` renders duplicate asset IDs and asserts no duplicate-key warning.
- Rerun: Pass; no new console errors after Dashboard rerender.

## Observations And Follow-Ups

- Demo state resets on full page reload by design. For production-scale local QA in demo mode, build data once and navigate through app links, not `tab.goto`.
- Trades subtitle currently reports closed-trade analytics (`40 trades`) while the table tab reports all rows (`All (49)`). This is not a data failure, but the copy could be clearer, for example `40 closed trades`.
- History row expansion still needs a tighter test locator or `data-testid`; filters/imports passed at 125 rows.

## Rerun Result

Clean pass for the scoped local demo QA after fixes:

- Desktop route pass: Dashboard, Portfolio, Trades, History, Investors, Settings.
- Mobile route pass: drawer navigation and Portfolio table column toggle at 390x844.
- Console: no new errors after the performer key fix; known warnings only.
- Automated validation: focused tests passed before the final full validation run.

## Real Local Stack Follow-Up

Added `npm run db:seed:scale` and `docs/qa/local-production-scale-runbook.md` for the real local
backend/database pass. Docker Desktop was later started locally, the sanitized scale seed was loaded,
and the first real local pass is recorded in `docs/qa/2026-06-23-real-local-scale-qa.md`.

That pass found and fixed the missing frontend local-auth bypass and the History snapshot limit
issue. The overall goal remains active because the full source-backed inventory still needs every
destructive cancel path, row action, validation branch, export URL, and signed-out/admin guard pass
before it can be called clean.
