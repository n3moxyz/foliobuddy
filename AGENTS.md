# AGENTS.md

> **Maintenance rules**:
>
> - **Self-update**: update file when patterns, key files, commands, gotchas, or env vars change.
> - **Sync with CLAUDE.md**: Mirror changes to both files (only title + agent name differ).
> - **FORET.md**: after significant changes, add features/fixes/lessons/tech changes (keep conversational tone).

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions + net worth across crypto, equities, NFTs, + alts. Multi-user support with investor stake tracking.

## Tech Stack

- **Backend** (`packages/backend/`): Node.js + TS (ES2022), Express 4.18, Postgres (prod private host, local via Docker), Prisma 5.10, Clerk auth, node-cron 4, Zod
- **Frontend** (`packages/frontend/`): React 18 + TS, Vite 8, React Router v6, TanStack React Query (server state) + Zustand (client state), shadcn/ui + Radix + Tailwind 3.4, Recharts

## Key Files

### Backend

- `src/index.ts` - Server entry (rate limiting, logger, FX job init, `/api/v1` prefix)
- `src/routes/`/`src/services/`/`src/middleware/` - endpoints; business logic (portfolio/price/snapshot); auth + error handling
- `src/lib/` - Utils: `constants.ts` (domain enums), `fxConstants.ts` (USD→native FX fields + finite-positive `usdRateEntries()`), `queryParams.ts` (strict bounded integers + real calendar dates), `domain.ts` (backend copy of finite-safe value/cost-basis math), `authorization.ts` (admin + user-asset guards), `startupChecks.ts` (boot warnings), `TTLCache.ts`, + pagination/tradePnL/sentry/logger
- `src/__tests__/` - vitest unit + integration tests (`routes/` = supertest + mocked Prisma; `helpers/` = createTestApp/fixtures; scheduler/socketService tests cover cron fanout + WS payloads; `socketService.integration.test.ts` = real Socket.io clients with mocked Clerk)
- `prisma/schema.prisma` - DB schema

### Frontend

- `src/App.tsx` (routing); `src/pages/` (Dashboard, Portfolio, Trades, Investors, Settings); `src/stores/` (Zustand)
- `src/hooks/` - React Query hooks (usePortfolio incl. `useDrawdownStats`, useTrades, …), `useAnimatedNumber` (rAF), `usePageTitle`, `useKeyboardShortcuts` (single-key nav; disableable via `stores/shortcutsStore`, WCAG 2.1.4), `useMoneyFormatter` (monetary privacy); tests in `__tests__/`
- `src/lib/api.ts` (API client), `chunkRecovery.ts` (chunk reload), `types.ts`, `chartColors.ts` (OKLCH CSS-var chart colors), `chartUtils.ts` (time-period date helpers + drawdown math)
- `src/components/ui/` - `skeleton.tsx`, `HelpTooltip.tsx`, `creatable-select.tsx` ("+ Add new ..." Radix Select), `formatted-number-input.tsx` (thousands-separator input; pure helpers in `-utils.ts` for Fast Refresh)
- `src/components/layout/PageActionHeader.tsx` - Sticky title/action header, high-scroll data pages
- `src/components/trades/` - `Trades.tsx` split into `TradeTable.tsx`, `TradeTapeSection.tsx`, `TradeDetailDialog.tsx` (+ `formatTradeTags`), `tradeClipboard.ts`, `TradeLensViews.tsx` + `tradeLensModels.ts` (pure aggregation); page keeps shared state + dialogs
- `src/components/portfolio/` - `positionClipboard.ts`, `positionOptions.ts` (storage options + localStorage customs), `positionFormMath.ts` (pure cost/add-reduce math), `PositionDeltaEditor.tsx`, `PositionCostFields.tsx` + `PositionStorageFields.tsx`
- `react-doctor.config.json` - Root-level React Doctor triage policy

### Shared

- `packages/shared/src/types.ts` - Cross-package types, domain enums, `categoryGroup()`, position math helpers, `USD_SGD_FALLBACK_RATE`, `MAX_POSITIONS_PER_CATEGORY`. Frontend is only runtime consumer (see Gotchas: backend Docker isolation).

### E2E

- `playwright.config.ts` (Chromium only) + `e2e/smoke.spec.ts` (health, app load, auth redirect)

## First Run Setup

```bash
# 1. From root
npm install

# 2. Backend — fill DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ALLOWED_ORIGINS
cd packages/backend && cp .env.example .env && npx prisma migrate dev # creates tables

# 3. Frontend — fill VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY
cd ../frontend && cp .env.example .env

# 4. Run both (separate terminals): npm run dev in packages/backend + packages/frontend
```

## Commands

```bash
# Root (monorepo)
npm install · npm audit (0 vulns) · npm test (backend + frontend) · npm run build (build/typecheck all)
npm run format · npm run format:check (prettier + scripts:check [bash -n, skip Windows] + domain:check [backend↔shared parity])
npm test --workspace=@foliobuddy/backend -- --coverage # full V8 coverage (same for frontend)

# Local DB (needs Docker Desktop; db:sync pulls prod→local via PRODUCTION_DATABASE_URL in backend .env; re-runnable, prod untouched)
npm run db:local (start local Postgres, Docker 5433) · db:local:stop · db:sync · db:seed:scale (sanitized scale data)

# Backend (packages/backend/): npm run dev (4001) · build · test · npx prisma migrate dev · npx prisma studio
# Frontend (packages/frontend/): npm run dev (4000) · build
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none # optional a11y/quality scan (advisory)

# Frontend demo route (dev-only, mocked API): http://localhost:4000/dev/demo
```

## Architecture

Static frontend (React + Vite) → HTTP + Clerk JWT → Express backend → Prisma → Postgres 17 (private network). Background jobs (node-cron): price refresh (every min), snapshots (daily 5am SGT / weekly Sun / monthly 1st), FX rates (hourly).

## Key Patterns

### Auto-Create User

First-time Clerk users auto-create via `ensureUser` middleware.

### Snapshot System

Captures portfolio state over time; calculates daily/weekly/monthly/YTD returns + benchmark outperformance vs BTC/ETH. **Per-user schedule**: `User.snapshotHour` (0–23) + `User.snapshotTimezone` (IANA), default `5`/`Asia/Singapore`; edited via `GET/PATCH /users/me/preferences` (Zod: hour int, tz must format in `Intl`) + Settings → Daily Snapshot. Scheduler ticks hourly (`0 * * * *` UTC) and snapshots users in UTC tick window containing local schedule (`lib/snapshotSchedule.ts` — skipped DST hours run at first valid instant); WEEKLY local Sunday, MONTHLY local 1st. `Snapshot.scheduledLocalDate` + unique `(userId, snapshotType, scheduledLocalDate)` key = cross-instance duplicate guard; keep local-day pre-check as cheap path. Return fields stored as `percent × 100`. YTD anchor = first snapshot of _current calendar year_ (`timestamp >= Jan 1 UTC` in `portfolioService.getSummary()`) — never unfiltered `findFirst orderBy:asc`. Backfill one-shot: `packages/backend/scripts/backfill-equity-snapshots.ts`.

### Yahoo Search & Local-Currency Equities

Yahoo search IP-filters by caller region; `YahooFinanceProvider.search()` falls back to IP-neutral `/v7/finance/quote` for ticker-shaped queries with no exact match. Local-currency suffixes `.SI`/`.T`/`.TW`+`.TWO`/`.KS`+`.KQ`/`.OL` → SGD/JPY/TWD/KRW/NOK; ranking prefers primary local exchanges over OTC/EU cross-listings. Keep Kioxia (`285A.T`) + Oslo coverage in `YahooFinanceProvider.test.ts` (full story: FORET.md).

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` extracts text via `pdf-parse`, walks broker parsers in `src/services/statementParsers/` until one succeeds (each anchors on a deterministic ISIN/value marker). Supported: **UOB Kay Hian**, **FSMOne/iFAST**. Holdings reconcile via `statementMatching.ts` (ISIN → provider symbol → exact symbol → exact name; broker storage breaks ties). **Add a broker**: new parser file, append to `parsers` in `routes/assets.ts`, update error string + broker→`storageLocation` map, keep `statementMatching.test.ts` coverage.

### CoinGecko Rate Limiting

Queue-based: 2.1s between calls, 30s in-memory cache, batch up to 50 coins.

### TTLCache

`TTLCache` uses `Map` insertion order for LRU eviction; eviction must check iterator's `done` flag, not key `undefined` (a legal `Map` key). Keep `TTLCache.test.ts` coverage for both cases.

### React Query + Zustand Split

- React Query: server state. No global `refetchInterval`; global `refetchOnWindowFocus` stays `false`. Money-sensitive `usePortfolio.ts` queries opt into `refetchOnWindowFocus` + `refetchOnReconnect`.
- Zustand: client state (currency + global monetary-privacy preferences)

### Structured Logging

All backend code uses `logger` (`src/lib/logger.ts`) — no `console.log` in prod. Respects `LOG_LEVEL` (debug/info/warn/error); invalid values fall back to `info`, so a typo can't suppress warn/error.

### Rate & Payload Limits

Global express-rate-limit on `/api`: 200 req/15 min, override `RATE_LIMIT_MAX` (local dev 10000); constants in `src/lib/constants.ts`. Express JSON cap **1mb** (`MAX_PAYLOAD_SIZE`), deliberately tight — if bulk import 413s, bump constant, don't widen globally.

### Pagination (Backend)

Trades + snapshots routes support optional `?page=1&limit=50`; returns full array when no `page` param. Uses `parsePagination()`/`paginatedResponse()` from `src/lib/pagination.ts`.

Numeric/date query params must use `parseBoundedIntegerQuery()`/`parseDateQuery()` (`src/lib/queryParams.ts`): reject partial/repeated/non-finite/fractional/impossible-calendar inputs, cap history/limit work before Prisma/price provider. Pagination stays backwards-compatible but clamps offset to Postgres's safe integer range.

### Atomic Investor Mutations

Investor create, stake update, owner reassignment + delete/reassign are multi-row changes — keep each in a `Serializable` Prisma transaction so a failed stake-history write can't clear owner or partially transfer/delete investor. Validate stake capacity before owner mutation.

### Trade Date & Analytics Contracts

Trade create/update/close/import dates must be real calendar values with `exitDate >= entryDate`; analytics month buckets use UTC. `TradeAnalytics.profitFactor = null` is JSON-safe sentinel for infinite profit factor (wins, no losses); UI renders `∞`. Best/worst trade fields are null unless such trade exists.

Trades support an optional non-negative USD `fundingCost` (default `0`). Closed-trade `realizedPnL` is net of funding (`price P&L - fundingCost`); `realizedPnLPct` uses that net over entry size, so all analytics inherit deduction; create/edit/bulk-import, clipboard, exports + demo mode must preserve field; trade details show deduction beside net Realized P&L.

### Lazy-Loaded Routes

All pages lazy-loaded (`React.lazy()` + `Suspense`); Vite `manualChunks` splits vendors (recharts, socket.io-client, @sentry/react, @clerk/clerk-react). `chunkRecovery.ts` gives `vite:preloadError` one reload per 60 seconds; keep the cap to avoid loops.

### Public Landing Page

Signed-out `/` → lazy `pages/Landing.tsx` (sections in `components/landing/`); other signed-out paths → `pages/SignInPage.tsx`; signed-in `/sign-in` redirects to `/`. Landing forces dark via `dark` wrapper, uses only deterministic local data (`landingData.ts`, no API calls), hand-rolled SVG (never recharts) + `landing-*` utilities in `index.css` (reduced-motion covered). Never let it grow signed-in bundle.

### Dev Demo Route

`src/dev/demoMode.tsx` — local-only `/dev/demo` route for UI testing without Clerk/backend:

- **Dev-only**: `App.tsx` lazy-loads it only when `import.meta.env.DEV` — never ships in prod; don't add extra env gates.
- Mocks `/api/*` + `/api/v1/*` in-browser (restores `fetch` + token getter on unmount); child routes wait for mock install (`DemoPages` `useLayoutEffect` + readiness timer) else React Query caches empties.
- Stateful CRUD/import resets on refresh; update `src/dev/__tests__/demoMode.test.ts` when adding mocked write/import routes.
- Seed data spans all buckets; sync `Position.assetId`/embedded `asset` via `demoAsset(id)`, never array indexes. Perf history honors `days`/`from`/`to`/`all=true`.
- UI testing only — never point at prod write APIs.

### React Doctor Quality Scan

Advisory frontend audit — see pinned command in Commands. Triage input, not a refactor plan; be skeptical of React 19 advice on React 18. `react-doctor.config.json` suppresses reviewed noise. Don't suppress new accessibility/keyboard/ownership/render-correctness/data-integrity findings without noting why they're FPs. Known FPs (reviewed): `apiMockReady` in `demoMode.tsx`, `autoFocus` on Portfolio's inline perp input, `PerformersCard` index-suffixed key (same asset can appear twice — test-enforced).

### Ownership Checks on Mutations

Protected update/delete routes must filter by both `id` + `req.userId!`, never `id` alone (blocks cross-user mutation).

Global Asset catalog rows are shared, so follow split rules (`src/lib/authorization.ts`): `PUT`/`DELETE /assets/:id` need an admin from `ADMIN_USER_IDS`; per-user flows (`POST /assets/:id/refresh-price`, `PATCH /assets/:id/nav`) 403 unless user holds asset. `GET /assets/:id` has only user's positions.

### WebSocket CORS

Socket.io origin validation uses exact matching (`origin === allowed`), same as Express CORS. Never prefix-match trusted origins.

### Optimistic Deletes

Delete mutations (`usePortfolio`/`useTrades`/`useSnapshots`) use optimistic updates, rollback on error.

### Async Feedback (Toasts + Status)

sonner: `AppToaster` (`components/layout/AppToaster.tsx`) gets the raw `theme` — Sonner resolves `system` + tracks OS changes itself; never pre-resolve it. It is wrapped in Radix `DismissableLayerBranch`, so toast clicks/focus are not "outside" interactions for **any** open Radix layer app-wide (Dialog, Popover, Select, Tooltip, DropdownMenu all share one `DismissableLayerContext`) and dismissing a toast never closes them — keep `@radix-ui/react-dismissable-layer` pinned to the single version every Radix package resolves (`npm ls @radix-ui/react-dismissable-layer` after any Radix bump; see `docs/DEPENDENCIES.md`). Known limit: a modal Dialog's FocusScope still traps Tab, so keyboard users cannot reach a toast while a modal is open (pre-existing), carries `className="pointer-events-auto"` (Radix modals body-lock pointer events), and anchors `top-center` below `sm` (640px) where dialogs dock as bottom sheets (`offset`/`mobileOffset` top 64px clears the `h-14` header) + global `MutationCache.onError` toasts every failed mutation — handlers must never fail silently (`console.error`-only catch = bug). Copy/refresh/snapshot handlers toast success + failure. Skeletons carry `role="status"` + sr-only text; inline form errors use `role="alert"` + `aria-invalid`/`aria-describedby`.

### Responsive Mobile Design

iOS HIG-inspired patterns, all pages:

- **Tables → card rows**: below `md`, `PositionTable` renders card rows (`renderMobilePositionRow`); full table only when "All columns" toggled (`showMobileColumnToggle`). `mobileVariant`: `focus` (symbol+name, value, P&L pill, meta) or `compact` (value + P&L). Row actions collapse into 44px `⋮` menu. Trades column-hides (`hidden md:table-cell`).
- **Dialogs → bottom sheet**: content-heavy dialogs dock full-width to mobile's bottom edge (`!bottom-0 … rounded-t-lg` + `pb-[max(1rem,env(safe-area-inset-bottom))]`), centered modal at `sm+`.
- **Touch targets**: 44px hit areas compacting at `sm+`/`md+` (`Button` sizes, sortable headers, allocation legends, `HelpTooltip`). `Input`, `SelectTrigger`, `DropdownMenuItem`, asset-search options, creatable-select row actions bake `h-11`/`min-h-11` → `sm:` into primitives — don't redo per-call-site heights. Dense row actions need `shrink-0`.
- **Responsive headers**: `flex-col gap-3 sm:flex-row`; secondary actions move to `DropdownMenu` overflow.
- **Dialog safety**: `w-[calc(100%-2rem)]` margins + `max-h-[85vh] overflow-y-auto`.

### Smart Price Formatting

`formatPrice()` (`lib/utils.ts`) — per-unit prices (entry/exit, current) instead of `formatCurrency(..., 0)`. Decimals by magnitude: < $0.01 → 5 (0.00842), < $0.10 → 4 (0.0812), < $10 → 3 (0.780), < $1,000 → 2 (32.15), ≥ $1,000 → 0 (67,200).

Use `formatCurrency` for totals/sizes/P&L. For cost/total _amounts_ use `currencyDecimals(currency)` (0 for JPY/KRW, else 2) — not magnitude-based `priceDecimals`.

Portfolio rows show app-currency price + avg cost; if `asset.nativeCurrency` differs, a muted second line under **Price**/**Avg Cost** uses `localPriceLabel()` + `/fx/rates` USD→native map (full-opacity `text-muted-foreground` — opacity variants fail contrast at 11px). Never store native price on `Asset` — derive from USD × FX.

### Smart Quantity Formatting

Use `formatQuantity()` for read-only quantity displays (tables, dialogs, history, previews) — trims trailing zeroes, caps precision by asset type (equities 4, UT 3, crypto 8, cash 2). Keep editable fields as raw `FormattedNumberInput` strings so precision survives typing/saving.

### Formatted Amount Inputs

Use `FormattedNumberInput` for editable money/quantity/NAV/capital/exposure fields — renders `10,000` over raw-string state so `parseFloat()`/payloads stay safe. Avoid raw `type="number"` for finance amounts unless min/max needed. Never coerce leading-negative input positive (`sanitizeNumberInput('-1')` → `''`). Gate submit on `isPositiveNumberInput()`/`isNonNegativeNumberInput()` (`src/lib/formValidation.ts`), not `required`/`parseFloat`, so UI guard matches backend Zod.

### Trades Review Lenses

`Trades.tsx` — 3 lenses above shared Trade Tape table: **Review** (default; collapsed `TradeStatsCard` + `TickerPnLCard`, then All/Open/Closed table), **Ticker Dossier** (`?ticker=SOL`; per-ticker stats — chip clears param), **Monthly Postmortem** (`?view=monthly`; month summaries, edge tags, loss review, open watchlist). Fetches all trades once via `useTrades()`, filters locally so lens summaries survive tab switches. Keep demo `TradeAnalytics.bestTrade/worstTrade` in sync with seeded rows. `TradeForm` edit = optional `trade` prop; defaults entry 5 days ago, exit today. Tape rows are clickable + keyboard-activatable (see Clickable Rows). Lens UI: `TradeLensViews.tsx`; aggregation: `tradeLensModels.ts`.

### Portfolio Hero Summary

Borderless hero (matching Net Worth). **Desktop** (`hidden sm:block`): large tabular Total Value + inline YTD P&L trend arrow, then 5-col `divide-x` grid (YTD Start, DD from ATH, Exposure, Positions, YTD P&L — drawdown via shared `useDrawdownStats()`, same definition as Net Worth), `HelpTooltip` on every label. **Mobile** (`sm:hidden`): compact bordered card — Total Value, YTD P&L, inline "Add" button. Exposure = owned non-stable/non-cash + local perp ÷ total; custody excluded.

### Portfolio Section Headers

2-level grouping, all breakpoints: **Crypto/Equities/Cash** (primary, `Portfolio.tsx` via `CollapsibleCard`) → **CEX/Broker account/Bank/Onchain** (secondary, `PositionTable`); Equities honors persisted By Broker/By Type choice. `CollapsibleCard` takes `icon` + `accentColor` (category tokens `crypto`/`equities`/`cash`/`custody` in `index.css` + `tailwind.config.js` — never raw `-500`; custody accent in `CUSTODY_CONFIG`). Heading wraps trigger (`<h2><button>`, never reversed — invalid HTML, hides heading from SR nav). Secondary triggers show dollar totals. Desktop (`hidden sm:block`) = full table rows; mobile (`sm:hidden`) keeps hierarchy via `mobileVariant="compact"`, no column toggle. Custody gets its own section on both.

### Custody Positions ("Held for Others")

Positions held for others: `Position.custodyOf String?` — `null`=owned. Excluded from net worth, P&L, allocations, snapshots, exposure (backend filters `custodyOf: null`); Zod `z.string().nullable().optional()` (empty string → null). `Portfolio.tsx` splits owned vs custody (purple "Held for Others" card). `CustodyCheckbox.tsx` sits at bottom of every form, name dropdown (positions + `foliobuddy-custody-names` + "Add new person"); edit sends empty string to clear. Clipboard JSON has `custodyOf` when set.

### Creatable Storage Location Dropdowns

CEX exchanges, wallets, brokers, banks use `CreatableSelect` (no generic "Others"): "+ Add new ..." row + pencil/trash for customs.

- Popover pencil/trash are pointer-only (listbox keyboard = arrows/typeahead); inline Rename/Remove buttons under trigger for selected custom are keyboard path — keep both.
- Defaults are protected; customs persist under `foliobuddy-storage-location-options` bucketed by storage type, merged via `positionOptions.ts`. Deleting only removes option — positions keep value (edit forms re-add it as a one-off).
- Fixed domain selects stay fixed (Category, storage type, fiat currency, direction, theme) — only free-text location dropdowns are creatable.
- Radix Select can emit a trailing empty value after create row closes — creatable `onValueChange` must ignore empties.
- Shared `SelectContent` sizes to content, sits above dialogs (`z-[60]`); never force `h-[var(--radix-select-trigger-height)]` or reuse dialog's `z-50` (menus open but clipped).

### Cash Positions (Stablecoins + Fiat)

Former Stables category is now **Cash**. `PositionForm.tsx` Cash shows a **Type** dropdown (USDT, USDC, USDe, FDUSD, DAI, **Cash (fiat)**); Cash (fiat) reveals a **Currency** dropdown (`USD`/`SGD`/`GBP`), creates/reuses a `CASH` asset (SGD priced from summary rate at creation; fiat cash is `priceProvider='manual'`). Storage by Type: stablecoins → CEX/Onchain; fiat → Broker account/Bank. Broker defaults `BROKER_LOCATIONS` (`FSMOne`, `IBKR`, `Tiger`, `UOB KH` — never `DBS`); bank defaults `Citi`, `DBS`, `SCB`, `Trust+`, `UOB`. `PositionForm` guards storage-type validity when Type changes.

### Equity Positions (Stock/ETF + Unit Trust)

2 sub-types via UI toggle (enums unchanged): **Stock/ETF** = `equityMode='single'`, `asset.category='EQUITY'`, `priceProvider='yahoo'` (ETFs go here, not Unit Trust); **Unit Trust** = `equityMode='fund'`, `asset.category='UNIT_TRUST'`, `priceProvider='manual'|'yahoo'`.

**Form:** create-only toggle (edit infers from category). Storage = creatable broker dropdown (`storageType` stays `'BROKERAGE'`). Cost currency follows `asset.nativeCurrency` (SGD/JPY/TWD/KRW/NOK take local inputs; backend stores USD). Fallback FX is display-only: non-USD submits must wait for a real `/fx/rates` (or SGD summary rate) before persisting cost basis. Edit converts stored USD → local via `costInitialized`.

**Display:** default `groupBy='broker'`; header switches to `equityType` (persisted in `foliobuddy-equity-group-by`); UT rows get `Unit Trust` badge. **NAV-age badge** under symbol for UT/manual-priced non-cash positions via `priceAgeClass` (muted <7d, amber 7–30d, red ≥30d/null); live tickers + fiat cash skip it.

**Upload:** dashed card = `<label>` wrapping file input (click or drag-drop PDF). Matched UT positions update, never duplicate: `statementMatching.ts` → `PUT /positions/:id` with parsed units/cost + `mode='reset'` boundary; manual-priced assets get parsed NAV via `PATCH /assets/:id/nav`. Cash funding is disabled for matched statements (reconciliation, not purchase).

**Copy/Paste:** clipboard has `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets. Bulk import honors them only when creating a new Asset (defaults `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`); existing symbols match by symbol first.

### Position Edit Modes

`PositionForm.tsx` edit has 2 tabs — `Edit Totals` (manual corrections) + `Add/Reduce Position`:

- `Add` takes extra quantity + total cost, recomputes weighted avg cost; `Reduce` takes quantity only, removes cost basis at current avg cost (avg unchanged unless position hits zero).
- Custody changes from either tab must persist. Preview shows an Old/New table (quantity, avg cost, total cost).
- Preview + submit both use shared `applyPositionDelta()` — never hand-roll cost-basis math in form. Rendering in `PositionDeltaEditor.tsx`, math in `positionFormMath.ts`, submit in `PositionForm.tsx`.

### Position Add/Reduce History

Add/reduce edits persist as `PositionHistory` rows via `PUT /positions/:id` with `positionDelta`; backend validates next quantity/cost basis against delta metadata, updates position + history in 1 transaction. Funded adds share an `operationId` with paired cash reduce so canceling restores both. `Edit Totals` writes a `mode='reset'` row (old rows collapse), never deletes history. `DELETE .../history/:historyId` cancels only newest add/reduce row while totals match. `/dev/demo/portfolio` mirrors this. Narrative: FORET.md.

### Global Value Privacy

`AppShell` eye button persists `foliobuddy-values-hidden` via `privacyStore`. Every read-only monetary display must use `useMoneyFormatter()` (`formatCurrency`/`formatPrice`/`formatSignedCurrency`) so a toggle updates every page, dialog, table, chart label/tooltip + import preview; editable inputs stay visible. `positionPriceDisplay.ts` gets `valuesHidden` for native-currency sublabels. Percentages, quantities, counts + chart geometry stay visible; copied chart images reflect current state.

### Dashboard Charts

- **Portfolio Value**: AreaChart with `$` (default)/`%` lens (`%` rebases range to first positive point); periods 7D/1M/3M/1Y/YTD/Max; loading uses `isFetching`. `getDateRange('Max')` must send `all=true` to `/snapshots/performance` (empty query = backend's 30-day default).
- **Portfolio % vs Benchmarks**: normalized % vs BTC/ETH/SPX + custom; each stores `provider` + `providerAssetId` (crypto→CoinGecko, TradFi→Yahoo). SPX = Yahoo `SPY` (not `^GSPC`) via `yahooFinance.chart()` (raw fetch fails, datacenter IPs). On failure, `priceService.getAssetHistory()` falls back to stored `PriceHistory` (1 point/UTC day) — local QA depends on this. Baseline = price at first portfolio timestamp. Tooltip renderer stays `useCallback`'d — inline arrows break memoization.
- **Allocation donuts** (4, `AllocationCharts.tsx`): **By Asset** (Crypto/Equities/Cash via `bucketFor()`; slice click drills detail chart); **Detailed** (`Auto · All · Crypto · Cash · Equities`; Auto = dominant bucket, dynamic title; sub-2% → "Other" via `groupSmallDetailedSlices`); **By Storage** (CEX split Cash/Crypto; sub-3% → "Other" via `groupSmallStorageSlices`, CEX/Onchain protected); **Cash Breakdown** (by symbol). Custody filtered first. Titles/totals on separate header rows so titles never truncate. Center label = top item's %; hover shows `name · $value · %`; no Recharts Tooltip (overlaps legend); legends keep 44px targets.
- **Image copy**: every chart card uses `ChartCopyButton` + `chartCopy.ts` → high-res PNG (copy button excluded). Recharts draw animations stay disabled, so immediate copy can't capture a partial SVG. Needs `ClipboardItem` + `navigator.clipboard.write`; failures toast.

### Dashboard Investor Default

Dashboard investor filter defaults to primary owner (`isOwner = true`), not "all investors", when an owner record exists.

### Net Worth Card

Borderless hero with merged stats; title shows investor label (`Net Worth (Nemo)`). 9 metrics stay in one ordered rail (YTD P&L, YTD Start, YTD ATH, MDD, MDD (1D), DD from ATH, Exposure, Positions, Trades). At `xl+` all 9 share available width; narrower screens keep one horizontally scrollable, snap-aligned rail (9rem cells) instead of wrapping into rows. Keep scrollbar visible + region keyboard-focusable. A compact footer shows total in alternate USD/SGD currency. `useDrawdownStats()` (`usePortfolio.ts`, shared with Portfolio hero) summarizes YTD snapshots + live value via `calculatePortfolioDrawdownStats()` (all 4 drawdown metrics in one pass; helpers return positive magnitudes shown as negative %). All labels have `HelpTooltip` (pass `label` for distinct accessible names). Tooltip buttons sit OUTSIDE `<Link>`s — never nest interactive content in a link. Key values use shared `useAnimatedNumbers()` loop.

### Performers Card

Borderless `divide-y` list, profit/loss-tinted title icons, muted tabular ranks. Ranking (`getTopPerformers`/`getWorstPerformers`): by absolute `unrealizedPnL` USD, not %.

### Page Entrance Animations

`animate-fade-in-up` on page headers only — no staggered section animations. Respects `prefers-reduced-motion`; `index.css` reduced-motion block zeroes tailwindcss-animate/collapsible utilities via attribute selectors (plain class selectors can't match variant-prefixed classes) — cover new animation utilities there.

### Settings & Investors Page Layouts

Settings: flat layout, `<h2>` headings + `<Separator>`, no Card wrappers. Investors: summary stats in a flat inline row (matches History).

### Consistent Page Headers

All pages use same header pattern: `flex-col gap-3 sm:flex-row ... justify-between` wrapper, `text-2xl font-bold` title + muted subtitle, `size="sm"` buttons, `mr-1` icons. Every page sets `usePageTitle('...')`. High-scroll pages use `PageActionHeader` (sticks below shell at `top-14 sm:top-16`; `stickyOnMobile={false}` on Portfolio; hosts body panes — hero stats, lens tabs, counts). Dashboard intentionally scrolls normally.

### Destructive Actions in Headers

"Delete All" MUST live inside overflow `DropdownMenu` (⋮), never standalone header button. Only non-destructive actions (Copy All, Add/Log) are visible header buttons.

### Design System & Visual Identity

- **Colors**: indigo-tinted neutrals — `--primary: 234 89% 55%`/`62%` (light/dark; AA-safe as fill, not text). `index.css` maps fill→text tokens: `.text-primary`→`--primary-text` (dark `234 89% 72%`), `.text-destructive`→`--loss-foreground`, `.text-warning`/`.text-info`→`-foreground` variants, + `hover:`/`focus:` forms (can't revert to fill). Never raw amber/green/blue for semantic text; fills: `bg-warning`/`bg-info`; P&L: `text-profit`/`text-loss`. Chart colors only from `chartColors.ts`, never inline hex. Dialog/nav scrims: theme-invariant `bg-black/60|40`, never `bg-foreground/*` (dark-mode wash).
- **Theme**: `themeStore` = `light`/`dark`/`system` (`resolveTheme()` + `useThemeEffect` follow live OS changes); Clerk gets `baseTheme: dark` when resolved dark. `index.html` carries `theme-color` metas both schemes.
- **Fonts**: Plus Jakarta Sans (body) + JetBrains Mono (numbers). **Skeleton**: `.skeleton` shimmer everywhere.
- **HelpTooltip**: `?` tooltips on finance terms; controlled open, tap-to-toggle, `stopPropagation` on pointer events so taps don't toggle `CollapsibleCard`.
- **Sidebar**: Linear-style active state (`border border-primary/30 bg-primary/10 text-primary font-semibold`, no stripe); desktop collapses to a persisted 72px icon rail (`foliobuddy-sidebar-collapsed`), mobile is full-width drawer.
- **Scrollbars**: thin 6px rounded thumb. **Empty states**: icon + heading + description + CTA.

## Environment Variables

Source of truth: `packages/backend/.env.example` + `packages/frontend/.env.example` (every var, with comments). Gotchas not in those files:

- Backend `PORT=4001` — never 3001 (reserved for other projects). `RATE_LIMIT_MAX=10000` for local dev (prod defaults to 200).
- Boot warns when `ADMIN_USER_IDS` is empty (else global catalog edit/delete 403s for every user).
- `AGENT_API_KEY` authenticates agent calls, while `AGENT_USER_ID` selects the portfolio. After an owner Clerk-ID rotation, run `sync-backend-env.yml` so `ADMIN_USER_IDS` and the single-user `AGENT_USER_ID` stay aligned; otherwise agent calls can return HTTP 200 with an empty portfolio.
- `ALLOW_LOCAL_AUTH_BYPASS` / `VITE_LOCAL_AUTH_BYPASS` are local scale-QA only: ignored under `NODE_ENV=production` / non-DEV Vite builds.
- `VITE_API_URL` must include the full `/api/v1` path.

### Frontend-Only Development / UI Testing

See **Dev Demo Route** (mocked `/api`, `/dev/demo`); **Local QA Auth Bypass** (sanitized real-API scale QA — flags + CORS gotcha): `docs/qa/local-production-scale-runbook.md`. Never with prod data/builds.

## Deployment

- **Hosts**: backend `https://api.foliobuddy.xyz` (Node), frontend `https://foliobuddy.xyz` (static, rewrites API calls), DB Postgres on private network.
- **Auto-deploy**: backend via GitHub Actions on push to main (backend files); frontend via Vercel. DB backups daily/weekly/monthly to private object storage.
- **Runbook**: `DEPLOYMENT.md` (public shape only; secrets in private ops notes) — deploy checks + ordering (backend before frontend on API-path changes), env-var workflow (`printf`, never `echo`), monitoring, smoke checks, backups.
- **Auth (Clerk)**: two instances — Development (`ins_38h5HV8e…`, `pk_test_`/`sk_test_`, the only keys that work on localhost) and Production (`ins_3I2EtX7O…`, `pk_live_`/`sk_live_`, Frontend API `clerk.foliobuddy.xyz`). Users never transfer between instances and `User.id` IS the Clerk user id, so an instance switch needs `packages/backend/scripts/clerk-mirror-users.ts` (create users on the target, write an id map) then `remap-clerk-user-ids.ts` (re-key `User` + cascade in one transaction; `--rollback <audit>`). Backend `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`ADMIN_USER_IDS` are GitHub secrets pushed to Coolify by `sync-backend-env.yml`; the frontend key lives in Vercel. Full runbook + rollback: DEPLOYMENT.md "Auth (Clerk)".

### Copy/Paste JSON Import Pattern

Portfolio/Trades/History share 1 pattern: per-row clipboard icon, Copy All header button, Import tab in Add/Log dialog — 1 JSON format for copy + import. Copy handlers toast success/failure (sonner).

### Branding

- **App name**: FolioBuddy. **Logo**: `packages/frontend/public/logo.svg` (flat Embrace mark: near-black, indigo, warm bone). All in-app identity surfaces use `components/layout/BrandMark.tsx`; don't recreate retired growth-chart mark inline.
- **PWA icons**: `apple-touch-icon.png` + `public/icons/` are raster exports of SVG master — keep in sync when logo changes. `manifest.webmanifest` owns install metadata; `index.html` links 180px Apple touch icon (favicon doesn't control iOS icon).
- **Package scope**: `@foliobuddy/*` (root `foliobuddy`); repo `n3moxyz/foliobuddy`. Local DB `example_portfolio_db`; prod storage/bucket names in private ops notes.

### Clickable Rows (Keyboard Safety)

Snapshot rows (AUTOMATIC) + position rows are clickable anywhere. Every keyboard-activatable row MUST guard `onKeyDown` with `e.currentTarget === e.target`; actions `TableCell` must stop BOTH `onClick`/`onKeyDown` propagation — else Enter/Space on a nested button bubbles up and fires row action instead (WCAG 2.1.1); non-table clickable rows need it too. References: `TradeTable`, `PositionRow`, `SnapshotTable`, `PositionTable` mobile card rows.

## Design Context

See `PRODUCT.md` — source of truth for users, brand, aesthetic, design principles. Dark mode primary; Linear/Raycast polish × Dune data-density. Old tool asks for `.impeccable.md`? Point it at `PRODUCT.md`.

## Gotchas & Notes

- `.env.local` overrides `.env` in Vite — wrong ports / "DB Down"? check it first.
- Always `onDelete: Cascade` in Prisma relations (avoids FK errors).
- Snapshots use unique constraint + check-before-create to prevent duplicates.
- Position P&L displays as % for clarity.
- Bulk import skips price fetching (`skipPriceFetch: true`); scheduler updates in 1 min.
- CI (push/PR): typecheck + full test suite + frontend build + `npm run format:check`.
- Lockfile/dependency rules (npm 10.8.2, `uuid` override, ExcelJS): `docs/DEPENDENCIES.md`.
- Sentry captures only unexpected 500s (Zod 400s + AppErrors < 500 skipped).
- `console.error` crashes on ZodError in Node — integration tests must mock logger.
- vitest `exclude: ['dist/**']` blocks duplicate runs after `npm run build`.
- Protected routes mutating by `id` only = security bug (see Ownership Checks on Mutations).
- Workspace imports (`@foliobuddy/shared`) MUST be in consumer's `package.json` — hoisting masks it locally; Vercel `npm ci` rejects it (CI guards via `npm ls --workspaces`).
- Backend Dockerfile is package-isolated — `src/lib/constants.ts`/`domain.ts` duplicate shared enums/helpers; `npm run domain:check` enforces parity.
- Vercel env gotchas (`VITE_API_URL` needs full `/api/v1` path; `VITE_WS_BACKEND_URL` needed for prod WebSocket): `DEPLOYMENT.md`.
