# CLAUDE.md

> **Maintenance rules**:
>
> - **Self-update**: update this file when patterns, key files, commands, gotchas, or env vars change.
> - **Sync with AGENTS.md**: Mirror changes to both files (only title + agent name differ).
> - **FORET.md**: after significant changes, add features/fixes/lessons/tech changes (keep the conversational tone).

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions and net worth across crypto, equities, NFTs, and alternative investments. Multi-user support with investor stake tracking.

## Tech Stack

- **Backend** (`packages/backend/`): Node.js + TypeScript (ES2022), Express 4.18, PostgreSQL (prod private host, local via Docker), Prisma 5.10, Clerk auth, node-cron 4, Zod
- **Frontend** (`packages/frontend/`): React 18 + TS, Vite 8, React Router v6, TanStack React Query (server state) + Zustand (client state), shadcn/ui + Radix + Tailwind 3.4, Recharts, Plus Jakarta Sans + JetBrains Mono. Design context: `PRODUCT.md`

## Key Files

### Backend

- `src/index.ts` - Server entry (rate limiting, logger, FX job init, `/api/v1` prefix)
- `src/routes/`/`src/services/`/`src/middleware/` - endpoints; business logic (portfolio/price/snapshot services); auth + error handling
- `src/lib/` - Shared utilities: `constants.ts` (domain enums), `fxConstants.ts` (USD→native FX fields + `usdRateEntries()` — adding a currency is one edit), `domain.ts` (backend copy of value/cost-basis math), `authorization.ts` (admin + user-asset guards), `startupChecks.ts` (boot warnings), `TTLCache.ts`, plus pagination/tradePnL/sentry/logger
- `src/__tests__/` - vitest unit + integration tests (`routes/` = supertest + mocked Prisma; `helpers/` = createTestApp/fixtures). `scheduler.test.ts` + `socketService.test.ts` cover cron fanout + WS payloads; `socketService.integration.test.ts` uses real Socket.io clients (mocked Clerk) for auth/broadcast/user-room
- `prisma/schema.prisma` - Database schema

### Frontend

- `src/App.tsx` (routing); `src/pages/` (Dashboard, Portfolio, Trades, Investors, Settings); `src/stores/` (Zustand)
- `src/hooks/` - React Query hooks (usePortfolio, useTrades, …) + `useAnimatedNumber` (rAF ticker) + `usePageTitle` (per-route document titles) + `useKeyboardShortcuts` (single-key nav, user-disableable via `stores/shortcutsStore` toggle in Settings — WCAG 2.1.4) + `useMoneyFormatter` (reactive global monetary privacy); tests in `__tests__/`
- `src/lib/api.ts` (API client), `types.ts` (frontend types), `chartColors.ts` (OKLCH CSS-var chart colors), `chartUtils.ts` (time-period date helpers for PortfolioChart/BenchmarkComparisonChart)
- `src/components/ui/` - `skeleton.tsx`, `HelpTooltip.tsx`, `creatable-select.tsx` ("+ Add new ..." Radix Select), `formatted-number-input.tsx` (thousands-separator input; pure helpers in `-utils.ts` for Fast Refresh)
- `src/components/layout/PageActionHeader.tsx` - Sticky title/action header for high-scroll data pages
- `src/components/trades/` - `Trades.tsx` split into `TradeTable.tsx`, `TradeTapeSection.tsx`, `TradeDetailDialog.tsx` (+ `formatTradeTags`), `tradeClipboard.ts`, `TradeLensViews.tsx` (lens UI) + `tradeLensModels.ts` (pure aggregation). Page keeps shared state + create/edit/delete dialogs.
- `src/components/portfolio/` - `positionClipboard.ts`, `positionOptions.ts` (storage options + localStorage customs), `positionFormMath.ts` (pure cost/add-reduce preview math), `PositionDeltaEditor.tsx` (add/reduce UI; submit stays in PositionForm), `PositionCostFields.tsx` + `PositionStorageFields.tsx`
- `react-doctor.config.json` - Root-level React Doctor triage policy

### Shared

- `packages/shared/src/types.ts` - Cross-package types, domain enums, `categoryGroup()`, position math helpers, `USD_SGD_FALLBACK_RATE`, `MAX_POSITIONS_PER_CATEGORY`. Frontend is the only runtime consumer (see Gotchas re: backend Docker isolation).

### E2E

- `playwright.config.ts` (Chromium only) + `e2e/smoke.spec.ts` (health, app load, auth redirect)

## First Run Setup

```bash
# 1. From root
npm install

# 2. Backend — fill DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ALLOWED_ORIGINS
cd packages/backend && cp .env.example .env && npx prisma migrate dev   # migrate creates tables

# 3. Frontend — fill VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY
cd ../frontend && cp .env.example .env

# 4. Run both (separate terminals): npm run dev in packages/backend and packages/frontend
```

## Commands

```bash
# Root (monorepo)
npm install · npm audit (0 vulns) · npm test (backend + frontend) · npm run build (build/typecheck all)
npm run format · npm run format:check (formatting + shell syntax + domain parity)
npm run scripts:check (bash -n root scripts; skips on Windows) · npm run domain:check (backend↔shared parity)

# Local Database
npm run db:local (start local Postgres, Docker 5433) · db:local:stop · db:sync (pull prod → local) · db:seed:scale (sanitized scale data)

# DB backups (on droplet): ./scripts/backup-db.sh daily|weekly|monthly · ./scripts/restore-db.sh [path]

# Backend (packages/backend/): npm run dev (4001) · build · test · npx prisma migrate dev · npx prisma studio
# Frontend (packages/frontend/): npm run dev (4000) · build
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none  # optional a11y/quality scan (advisory)

# Frontend demo route (dev-only, mocked API): http://localhost:4000/dev/demo
```

## Architecture

```
Static host (Frontend: React + Vite)
    ↓ HTTP + Clerk JWT
Node host (Backend: Express.js)
    ↓ Prisma ORM
PostgreSQL 17 (private network)

Background Jobs (node-cron): price refresh (every min), snapshots (daily midnight UTC / weekly Sun / monthly 1st), FX rates (hourly)
```

## Key Patterns

### Auto-Create User

First-time Clerk users are auto-created via `ensureUser` middleware.

### Local QA Auth Bypass

For sanitized real-API browser QA only: backend `ALLOW_LOCAL_AUTH_BYPASS=true LOCAL_AUTH_USER_ID=local-scale-user` + frontend `VITE_LOCAL_AUTH_BYPASS=true`. Backend bypass is ignored under `NODE_ENV=production`; frontend bypass requires Vite dev mode. Set `ALLOWED_ORIGINS` to the Vite origin or browser calls fail CORS. Never use with production data.

### Snapshot System

Captures portfolio state over time; calculates daily/weekly/monthly/YTD returns + benchmark outperformance vs BTC/ETH. Return fields stored as `percent × 100`. YTD anchor = first snapshot of the _current calendar year_ (`timestamp >= Jan 1 UTC` in `portfolioService.getSummary()`) — never an unfiltered `findFirst orderBy:asc`.

### Snapshot Backfill Script

`packages/backend/scripts/backfill-equity-snapshots.ts` — one-shot for retroactively inserting positions into historical snapshots; usage + semantics documented in the script header.

### Yahoo Search & Local-Currency Equities

Yahoo `/v1/finance/search` IP-filters by caller region; `YahooFinanceProvider.search()` falls back to the IP-neutral `/v7/finance/quote` for ticker-shaped queries with no exact match. Local-currency suffixes `.SI`/`.T`/`.TW`+`.TWO`/`.KS`+`.KQ`/`.OL` → SGD/JPY/TWD/KRW/NOK; ranking prefers primary local exchanges over OTC/EU cross-listings. Keep Kioxia (`285A.T`) + Oslo coverage in `YahooFinanceProvider.test.ts`. Full story: FORET.md.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` extracts text via `pdf-parse`, then walks broker parsers in `src/services/statementParsers/` until one succeeds (each anchors on a deterministic ISIN/value marker). Supported: **UOB Kay Hian**, **FSMOne / iFAST**. Holdings reconcile against existing UT positions via `statementMatching.ts` (ISIN → provider symbol → exact symbol → exact name; broker storage breaks ties). **Add a broker**: new parser file, append to `parsers` in `routes/assets.ts`, update the error string + broker→`storageLocation` map, keep `statementMatching.test.ts` coverage.

### CoinGecko Rate Limiting

Queue-based, 2.1s between calls, 30s in-memory cache, batch up to 50 coins.

### TTLCache

`TTLCache` uses `Map` insertion order for LRU eviction; eviction must check the iterator's `done` flag, not key `undefined` (a legal `Map` key). Keep `TTLCache.test.ts` coverage for both cases.

### React Query + Zustand Split

- React Query: server state. No global `refetchInterval`; global `refetchOnWindowFocus` stays `false`. Money-sensitive `usePortfolio.ts` queries opt into `refetchOnWindowFocus` + `refetchOnReconnect`.
- Zustand: client state (currency and global monetary-privacy preferences)

### Structured Logging

All backend code uses `logger` (`src/lib/logger.ts`) — no `console.log` in prod. Respects `LOG_LEVEL` (debug/info/warn/error); invalid values fall back to `info` so a typo can't suppress warn/error.

### Rate Limiting

Global express-rate-limit on `/api`: 200 req / 15 min, override `RATE_LIMIT_MAX` (local dev 10000). Constants in `src/lib/constants.ts`.

### Request Payload Limit

Express JSON cap **1mb** (`MAX_PAYLOAD_SIZE`), deliberately tight; if a bulk import 413s, bump the constant rather than widening globally.

### Pagination (Backend)

Trades and snapshots routes support optional `?page=1&limit=50`; returns the full array when no `page` param. Uses `parsePagination()` / `paginatedResponse()` from `src/lib/pagination.ts`.

### Lazy-Loaded Routes

All pages lazy-loaded (`React.lazy()` + `Suspense`); Vite `manualChunks` splits heavy vendors (recharts, socket.io-client, @sentry/react, @clerk/clerk-react).

### Dev Demo Route

`src/dev/demoMode.tsx` — local-only `/dev/demo` route for UI testing without Clerk or a backend:

- **Dev-only**: `App.tsx` lazy-loads it only when `import.meta.env.DEV` — never ships in prod; don't add extra env gates.
- Mocks `/api/*` + `/api/v1/*` in-browser (restores `fetch` + token getter on unmount); child routes wait for mock install (`DemoPages` `useLayoutEffect` + readiness timer) else React Query caches empties.
- Stateful CRUD/import resets on refresh; keep handlers in sync with UI workflows that claim success — update `src/dev/__tests__/demoMode.test.ts` when adding mocked write/import routes.
- Seed data spans all buckets; sync `Position.assetId`/embedded `asset` via `demoAsset(id)`, never array indexes. Perf history honors `/snapshots/performance` params (`days`/`from`/`to`/`all=true`).
- UI/responsive testing only — never point at production write APIs.

### React Doctor Quality Scan

Advisory frontend audit — see the pinned command in Commands. Triage input, not a refactor plan; be skeptical of React 19 advice on React 18. `react-doctor.config.json` suppresses reviewed noise. Don't suppress new accessibility/keyboard/ownership/render-correctness/data-integrity findings without documenting why they're false positives. Known FPs: `apiMockReady` in `demoMode.tsx` (gates rendering until the fetch mock installs); `autoFocus` on Portfolio's inline perp input (explicit edit-in-place activation); `PerformersCard` index-suffixed key (same asset can appear twice — a test enforces this).

### Dependency Audit Notes

Root `package.json` overrides `exceljs`'s transitive `uuid` to `11.1.1` (ExcelJS 4.4 declares `uuid@^8.3.0`, `GHSA-w5hq-g745-h8pq`; ExcelJS only uses `v4()`). Do not `npm audit fix --force` — it downgrades ExcelJS to 3.4.0. Keep `npm audit` clean.

ExcelJS treats worksheet name `History` as protected; exports use `Snapshots`. Keep `export.test.ts` coverage.

### Ownership Checks on Mutations

Protected update/delete routes must filter by both `id` and `req.userId!`, never `id` alone (prevents cross-user mutation via guessed IDs).

Global Asset catalog rows are shared, so they follow split rules (`src/lib/authorization.ts`): `PUT`/`DELETE /assets/:id` require an admin from `ADMIN_USER_IDS`; per-user flows (`POST /assets/:id/refresh-price`, `PATCH /assets/:id/nav`) 403 unless the user holds the asset. `GET /assets/:id` includes only the user's positions.

### WebSocket CORS

Socket.io origin validation uses exact matching (`origin === allowed`), same as Express CORS. Never prefix-match trusted origins.

### Optimistic Deletes

Delete mutations (`usePortfolio`/`useTrades`/`useSnapshots`) use optimistic updates with rollback on error.

### Async Feedback (Toasts + Status)

Frontend feedback layer is sonner: `AppToaster` in `main.tsx` (themed via `resolveTheme`), plus a global `MutationCache.onError` that toasts every failed mutation — UI handlers must never fail silently (`console.error`-only catch blocks are a bug). Copy/refresh/snapshot handlers toast success + failure. Loading skeleton blocks carry `role="status"` + sr-only text; inline form errors use `role="alert"` (wire `aria-invalid`/`aria-describedby` on the field where present).

### Responsive Mobile Design

iOS HIG-inspired patterns on all pages:

- **Mobile tables → card rows**: Below `md`, `PositionTable` renders stacked card rows (`renderMobilePositionRow`); the full table appears only when "All columns" is toggled (icon button, gated by `showMobileColumnToggle`). `mobileVariant`: `focus` (symbol+name, value, P&L pill, meta line) or `compact` (value + P&L only). Row actions collapse into a `⋮` menu (Details/Copy/Update NAV/Edit/Delete, 44px). Trades still column-hides (`hidden md:table-cell`) instead.
- **Mobile dialogs → bottom sheet**: Content-heavy detail dialogs (position detail, trade detail) dock to the bottom edge full-width on mobile (`!bottom-0 … rounded-t-lg` + `pb-[max(1rem,env(safe-area-inset-bottom))]`), centered modal at `sm+`.
- **Touch targets**: shared `Button` sizes give 44px mobile hit areas, compacting at `sm+`/`md+`. Dense row actions need `shrink-0`. Sortable headers, allocation legends, and `HelpTooltip` also need 44px mobile hit areas. `Input`, `SelectTrigger`, `DropdownMenuItem`, asset-search options, and creatable-select row actions bake the `h-11`/`min-h-11` → `sm:` compaction into the primitives — don't re-add per-call-site heights.
- **Responsive headers**: stack vertically on mobile (`flex-col gap-3 sm:flex-row`); secondary actions move to `DropdownMenu` overflow.
- **Dialog safety**: `w-[calc(100%-2rem)]` margins + `max-h-[85vh] overflow-y-auto`.

### Smart Price Formatting

`formatPrice()` (`lib/utils.ts`) — per-unit prices (entry/exit, current) instead of `formatCurrency(..., 0)`. Decimals by magnitude:

| Price Range | Decimals | Example  |
| ----------- | -------- | -------- |
| < $0.01     | 5        | $0.00842 |
| < $0.10     | 4        | $0.0812  |
| < $10       | 3        | $0.780   |
| < $1,000    | 2        | $32.15   |
| >= $1,000   | 0        | $67,200  |

Use `formatCurrency` for totals/sizes/P&L. For cost/total _amounts_ use `currencyDecimals(currency)` (0 for JPY/KRW, else 2) — not magnitude-based `priceDecimals`.

Portfolio rows keep the app currency as primary price + avg cost; if `asset.nativeCurrency` differs, a muted second line under **Price**/**Avg Cost** uses `localPriceLabel()` + the `/fx/rates` USD→native map. Sub-labels use full-opacity `text-muted-foreground` (opacity-modified variants fail contrast at 11px). Never store native current price on `Asset` — derive from USD × FX.

### Smart Quantity Formatting

Use `formatQuantity()` for read-only quantity displays (tables, dialogs, history, previews) — trims trailing zeroes, caps precision by asset type (equities 4, UT 3, crypto 8, cash 2). Keep editable fields as raw `FormattedNumberInput` strings so precision survives typing/saving.

### Formatted Amount Inputs

Use `FormattedNumberInput` for editable money/quantity/NAV/capital/exposure fields — renders `10,000` while keeping raw-string state so `parseFloat()`/payloads stay safe. Don't use raw `type="number"` for finance amounts unless native min/max is needed. Never coerce leading-negative input positive (`sanitizeNumberInput('-1')` → `''`). Gate submit on `isPositiveNumberInput()`/`isNonNegativeNumberInput()` (`src/lib/formValidation.ts`) — not `required`/`parseFloat` — so the UI guard matches the backend Zod rule. Inline validation errors get `role="alert"` + `aria-invalid`/`aria-describedby` on the field.

### Trades Review Lenses

`Trades.tsx` — three lenses above the shared Trade Tape table:

- **Review** (default `/trades`): collapsed `TradeStatsCard` + `TickerPnLCard`, then the All/Open/Closed table.
- **Ticker Dossier** (`?ticker=SOL`): ticker P&L, win rate, avg hold, largest win/loss, tags, recent closed, focused table. The ticker chip clears the query param.
- **Monthly Postmortem** (`?view=monthly`): month summaries, repeatable-edge tags, loss review, open-trade watchlist.

Fetches all trades once via `useTrades()`, filtering locally so lens summaries survive tab switches. Keep demo `TradeAnalytics.bestTrade/worstTrade` in sync with seeded rows. Trade form defaults entry to 5 days ago, exit today. Tape rows are clickable + keyboard-activatable (see Clickable Rows pattern). Lens UI in `TradeLensViews.tsx`, aggregation in `tradeLensModels.ts`.

### Portfolio Hero Summary

Borderless hero (matching Net Worth). **Desktop** (`hidden sm:block`): large tabular Total Value + inline YTD P&L trend arrow, then a 4-col `divide-x` grid (YTD Start, Exposure, Positions, YTD P&L), `HelpTooltip` on every label. **Mobile** (`sm:hidden`): compact bordered card — Total Value, YTD P&L, inline "Add" button. Exposure = owned non-stable/non-cash + local perp ÷ total; custody excluded.

### Portfolio Section Headers

Two-level grouping: **Crypto/Equities/Cash** (primary, `Portfolio.tsx` via `CollapsibleCard`) → **CEX/Broker account/Bank/Onchain** (secondary, `PositionTable`). `CollapsibleCard` takes `icon` + `accentColor` (hairline borders + subtle tints via category tokens `border-crypto/40 bg-crypto/5`; tokens `crypto`/`equities`/`cash`/`custody` in `index.css` + `tailwind.config.js` — never raw `-500` palette; custody accent centralized in `CUSTODY_CONFIG`). Its heading wraps the trigger button (`<h2><button>`, never the reverse — invalid HTML + hides the heading from SR navigation). Secondary triggers always show their dollar total. **Mobile/desktop split**: desktop (`hidden sm:block`) = per-category `CollapsibleCard` stack + custody card; mobile (`sm:hidden`) = one flat `PositionTable` (`groupBy="broker"`, `mobileVariant="compact"`, no column toggle). Custody renders desktop-only (documented tradeoff).

### Custody Positions ("Held for Others")

Positions held for others (e.g. "bought BTC for Mum"). `Position.custodyOf String?` — `null`=owned, non-null=custody. Excluded from net worth, P&L, allocations, snapshots, exposure: backend services filter `custodyOf: null`; Zod is `z.string().nullable().optional()` (empty string → null). `Portfolio.tsx` splits owned vs custody (purple "Held for Others" `CollapsibleCard`). `CustodyCheckbox.tsx` renders at the bottom of every form with a name dropdown (positions + `foliobuddy-custody-names` + "Add new person"); edit sends empty string to clear. Clipboard JSON includes `custodyOf` when set.

### Creatable Storage Location Dropdowns

CEX exchanges, wallets, brokers, banks use `CreatableSelect` (no generic "Others") with a "+ Add new ..." row + pencil/trash for custom options:

- Default options are protected; customs persist under `foliobuddy-storage-location-options` bucketed by storage type, merged via `positionOptions.ts`. Deleting only removes from the dropdown — existing positions keep their value; edit forms include it as a one-off option.
- Keep fixed domain selects fixed (Category, storage type, fiat currency, direction, theme) — only free-text location dropdowns are creatable.
- Radix Select can emit a trailing empty value after the create row closes — creatable `onValueChange` must ignore empties.
- Shared `SelectContent` sizes to content (max-height) and sits above dialogs (`z-[60]`); never force `h-[var(--radix-select-trigger-height)]` or reuse the dialog's `z-50`, or menus appear open but clipped.

### Cash Positions (Stablecoins + Fiat)

The former Stables category is labeled **Cash**. In `PositionForm.tsx`, Cash shows a **Type** dropdown (USDT, USDC, USDe, FDUSD, DAI, **Cash (fiat)**); Cash (fiat) reveals a **Currency** dropdown (`USD`/`SGD`/`GBP`) and creates/reuses a `CASH` asset (SGD priced from the summary rate at creation; fiat cash is `priceProvider='manual'`). Storage by Type: stablecoins → CEX/Onchain; fiat → Broker account/Bank. Broker defaults `BROKER_LOCATIONS` (`FSMOne`, `IBKR`, `Tiger`, `UOB KH` — never `DBS`); bank defaults `Citi`, `DBS`, `SCB`, `Trust+`, `UOB`. `PositionForm` guards storage-type validity when Type changes.

### Equity Positions (Stock/ETF + Unit Trust)

Two sub-types via UI toggle (enums unchanged):

- **Stock / ETF**: `equityMode='single'`, `asset.category='EQUITY'`, `priceProvider='yahoo'`. ETFs go here (live ticker prices), not Unit Trust.
- **Unit Trust**: `equityMode='fund'`, `asset.category='UNIT_TRUST'`, `priceProvider='manual'|'yahoo'`.

**Form:** Category = Crypto / Cash / Equities. Equities shows the toggle (create only; edit infers from category). Storage is a creatable broker dropdown (`storageType` stays `'BROKERAGE'`). Cost currency follows `asset.nativeCurrency` — SGD/JPY/TWD/KRW/NOK equities show local cost inputs with a USD conversion note; backend stores USD. Fallback FX is display-hint only: non-USD create/edit/add submits MUST wait for a real `/fx/rates` row (or real SGD summary rate) before persisting cost basis. Edit converts stored USD → local via `costInitialized`.

**Display:** Equities `PositionTable` defaults to `groupBy='broker'`; UT shows a `Unit Trust` badge. Header control switches to `groupBy='equityType'` (persists in `foliobuddy-equity-group-by`). **NAV-age badge** under the symbol for UT or manual-priced non-cash positions; color via `priceAgeClass` (muted <7d, amber 7–30d, red ≥30d/null). Live tickers + fiat cash skip it.

**Statement upload:** Dashed card is a `<label>` wrapping the file input (click or drag-drop PDF). A matched existing UT position is updated, not duplicated: `statementMatching.ts` match → `PUT /positions/:id` with parsed units/cost + a `mode='reset'` boundary; manual-priced assets also get parsed NAV via `PATCH /assets/:id/nav`. Cash funding is disabled for matched statements (reconciliation, not a funded purchase).

**Copy/Paste:** Clipboard includes `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets. Bulk import honors these only when creating a new Asset (defaults `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`); existing symbols match by symbol first.

### Position Edit Modes

`PositionForm.tsx` edit has two tabs — `Edit Totals` (manual corrections) and `Add/Reduce Position` (normal changes without editing aggregates):

- `Add` asks for additional quantity + total cost, recomputes weighted average cost automatically.
- `Reduce` asks for quantity only, removes cost basis at current avg cost, so avg cost is unchanged unless the position hits zero.
- Custody changes from either tab must persist. Confirmation preview uses an Old/New comparison table (quantity, avg cost, total cost).
- Preview + submit both go through shared `applyPositionDelta()` (via `positionFormMath.ts`) — never hand-roll cost-basis math in the form. Rendering in `PositionDeltaEditor.tsx`, math in `positionFormMath.ts`, submit/mutation in `PositionForm.tsx`.

### Position Add/Reduce History

Add/reduce edits persist as `PositionHistory` rows via `PUT /positions/:id` with `positionDelta`; backend validates next quantity/cost basis against delta metadata, then updates position + history in one transaction. Funded adds share one `operationId` with the paired cash-pile reduce so canceling restores both. Manual `Edit Totals` changes write a `mode='reset'` row (old rows collapse) instead of deleting history. `DELETE /positions/:id/history/:historyId` cancels only the newest add/reduce row when totals still match; older/reset rows are blocked. `/dev/demo/portfolio` mirrors this. Full narrative: FORET.md.

### Global Value Privacy

The eye button in `AppShell` sits immediately after the currency selector and persists `foliobuddy-values-hidden` through `privacyStore`. Every read-only monetary display must use `useMoneyFormatter()` (`formatCurrency`, `formatPrice`, or `formatSignedCurrency`) so a toggle updates Dashboard, Portfolio, Trades, History, Investors, dialogs, tables, chart labels/tooltips, and import previews reactively; editable amount inputs remain visible. `positionPriceDisplay.ts` receives `valuesHidden` for native-currency sublabels. Percentages, quantities, counts, and chart geometry stay visible, and copied chart images reflect the current state. The store migrates the old Dashboard-only `foliobuddy-dashboard-values-hidden` key.

### Dashboard Charts

- **Portfolio Value**: Recharts AreaChart with a `$` (default) / `%` lens; `%` normalizes the selected range to its first positive point. Period selector = 7D/1M/3M/1Y/YTD/Max, with a reference line at the baseline and an end-of-line label; loading uses `isFetching`. `getDateRange('Max')` MUST send `all=true` to `/snapshots/performance` (empty query falls back to the backend's 30-day default).
- **Portfolio % vs Benchmarks**: normalized % vs BTC/ETH/SPX + custom; each stores `provider` + `providerAssetId` (crypto→CoinGecko, TradFi→Yahoo). SPX = Yahoo `SPY` (not `^GSPC`) via `yahooFinance.chart()` (raw fetches fail on datacenter IPs). On live-history failure, `priceService.getAssetHistory()` falls back to stored `PriceHistory` (one point per UTC day) — local scale QA depends on this. Baseline = price at first portfolio timestamp. Tooltip renderer is `useCallback`'d (inline arrows defeat Recharts memoization); colors from `chartColors.ts`.
- **Allocation donuts** (4, `AllocationCharts.tsx`): **By Asset** (Crypto/Equities/Cash via `bucketFor()`; slice click drills the detail chart); **Detailed** (dropdown `Auto · All · Crypto · Cash · Equities`; Auto = dominant bucket, dynamic `[Bucket] Breakdown` title; crypto + equities roll sub-2% slices into "Other" via `groupSmallDetailedSlices`); **By Storage** (brokerage by location + Bank/Onchain; CEX split into CEX Cash/CEX Crypto; sub-3% custodians → "Other" via `groupSmallStorageSlices`, protecting CEX/Onchain buckets); **Cash Breakdown** (by symbol, when cash exists). Custody filtered out first. Titles and parenthesized totals occupy separate header rows so dynamic breakdown titles never truncate. Center label = top item's %; hover shows `name · $value · %`; no Recharts Tooltip (overlaps legend); colors from `chartColors.ts`; legends keep 44px targets.
- **Chart image copy**: every dashboard chart card uses `ChartCopyButton` + `chartCopy.ts` to copy the current rendered card as a high-resolution PNG. The copy button excludes itself from the image; Recharts draw animations stay disabled so an immediate copy cannot capture a partial/empty SVG. Clipboard image writes require `ClipboardItem` + `navigator.clipboard.write`; failures toast explicitly.

### Dashboard Investor Default

Dashboard investor filter defaults to the primary owner (`isOwner = true`), not "all investors", when an owner record exists.

### Net Worth Card

Borderless hero with merged stats; title shows the investor label (`Net Worth (Nemo)`). Desktop `grid-cols-7 divide-x` (YTD P&L, YTD Start, vs 30D, MDD, Exposure, Positions, Trades), mobile 2-col. MDD is the YTD maximum peak-to-trough decline from snapshots plus the live value; `calculateMaxDrawdown()` returns the positive magnitude and the card displays it as a negative percentage. All labels have `HelpTooltip` (pass `label` so accessible names read "Help: Exposure", not 15× "Help"). Tooltip buttons sit OUTSIDE `<Link>`s — never nest interactive content in a link. Key values use `useAnimatedNumber`.

### Performers Card

Borderless `divide-y` list, profit/loss-tinted title icons, muted tabular ranks. **Ranking** (`getTopPerformers`/`getWorstPerformers`): sort by absolute `unrealizedPnL` in USD, not percent.

### Page Entrance Animations

`animate-fade-in-up` on page headers only — no staggered section animations. Respects `prefers-reduced-motion`.

### Settings & Investors Page Layouts

Settings: flat layout, `<h2>` headings + `<Separator>`, no Card wrappers. Investors: summary stats in a flat inline row (matches History).

### Consistent Page Headers

All pages use the same header pattern: `flex-col gap-3 sm:flex-row ... justify-between` wrapper, `text-2xl font-bold` title + muted subtitle, `size="sm"` buttons with `mr-1` icons. Every page sets `usePageTitle('...')`. High-scroll pages use `PageActionHeader` (sticks below shell at `top-14 sm:top-16`; `stickyOnMobile={false}` on Portfolio; hosts body panes — hero stats, lens tabs, counts). Dashboard intentionally scrolls normally.

### Destructive Actions in Headers

"Delete All" MUST live inside the overflow `DropdownMenu` (⋮), never a standalone header button. Only non-destructive actions (Copy All, Add/Log) are visible header buttons.

### Design System & Visual Identity

- **Colors**: indigo-tinted neutrals — `--primary: 234 89% 55%`/`62%` (light/dark; AA-safe **as a fill**, not as text). Fill tokens are never used as text: `index.css` overrides `.text-primary` → `--primary-text` (dark `234 89% 72%`), `.text-destructive` → `--loss-foreground`, `.text-warning`/`.text-info` → their `-foreground` variants — each including `hover:`/`focus:` forms so hover states don't flip back to the unreadable fill color. Profit/loss via `text-profit`/`text-loss`. Use these tokens for semantic-state text (never raw amber/green/blue palette); use `bg-warning`/`bg-info` for fills. Chart colors only from `chartColors.ts` — never inline hex. Dialog/nav scrims are theme-invariant `bg-black/60|40` — never `bg-foreground/*` (inverts into a lightening wash in dark mode).
- **Theme**: `themeStore` supports `light`/`dark`/`system` (`resolveTheme()` maps system → OS preference; `useThemeEffect` follows live OS changes). Clerk `SignIn`/`UserButton` pass `baseTheme: dark` (from `@clerk/themes`) when the resolved theme is dark. `index.html` carries `theme-color` metas for both schemes.
- **Fonts**: Plus Jakarta Sans (body) + JetBrains Mono (numbers). **Skeleton**: `.skeleton` shimmer everywhere.
- **HelpTooltip**: `?` tooltips on finance terms; controlled open, tap-to-toggle, `stopPropagation` on pointer events so taps don't toggle `CollapsibleCard`.
- **Sidebar**: Linear-style active state (`border border-primary/30 bg-primary/10 text-primary font-semibold`, no side stripe); desktop collapses to a persisted 72px icon rail (`foliobuddy-sidebar-collapsed`), mobile is a full-width drawer.
- **Scrollbars**: thin 6px rounded thumb. **Empty states**: icon + heading + description + CTA. **Design context**: `PRODUCT.md` (legacy `.impeccable.md` migrated — don't recreate both).

## Environment Variables

### Backend (`.env`)

```
DATABASE_URL=              # Local: postgresql://dev:dev@localhost:5433/example_portfolio_db
PRODUCTION_DATABASE_URL=   # Optional DB mirror source; never commit a real value
PORT=4001                  # DO NOT use 3001 (reserved for other projects)
CLERK_SECRET_KEY=
ADMIN_USER_IDS=            # Clerk IDs allowed to edit/delete the global Asset catalog
ALLOWED_ORIGINS=http://localhost:4000
RATE_LIMIT_MAX=10000       # Local dev override (prod defaults to 200)
ALLOW_LOCAL_AUTH_BYPASS=false  # Local scale QA only; ignored when NODE_ENV=production
LOCAL_AUTH_USER_ID=local-scale-user
SENTRY_DSN=                # Optional error tracking (skipped if empty)
```

Boot warns when `ADMIN_USER_IDS` is empty (else global catalog edit/delete 403s for every user).

### Frontend (`.env`)

```
VITE_API_URL=http://localhost:4001/api/v1    # Backend API URL (or prod URL for frontend-only dev)
VITE_WS_BACKEND_URL=http://localhost:4001    # WebSocket URL
VITE_CLERK_PUBLISHABLE_KEY=                  # Clerk frontend key
VITE_LOCAL_AUTH_BYPASS=false                 # Local scale QA only; requires Vite DEV mode
```

### Frontend-Only Development / UI Testing

See **Dev Demo Route** (UI without a backend, mocked `/api`, `/dev/demo`) and **Local QA Auth Bypass** (sanitized real-API scale QA). Never use bypass flags with production data/builds.

## Deployment

- **Hosts**: backend `https://api.foliobuddy.xyz` (Node), frontend `https://foliobuddy.xyz` (static, rewrites API calls), DB PostgreSQL on a private network.
- **Auto-deploy**: backend via GitHub Actions on push to main (backend files); frontend via Vercel. DB backups daily/weekly/monthly to private object storage.
- **Uptime**: `.github/workflows/uptime.yml` hits `/api/v1/health/db` every 10 min; non-200 emails the owner.
- **Public docs**: `DEPLOYMENT.md` (shape only; real hosts/IDs/secrets in private ops notes).
- **Env var writes**: pipe through `printf` (not `echo`) for `vercel env add` — `echo` appends `\n`, silently breaking URL construction.

### Copy/Paste JSON Import Pattern

Portfolio/Trades/History share one pattern: per-row clipboard icon, Copy All header button, Import tab in the Add/Log dialog — one JSON format for copy + import. Copy handlers toast success/failure (sonner).

### Trade Form Editing

`TradeForm` takes an optional `trade` prop — present = edit, absent = create.

## Local Database Setup

Prereq: Docker Desktop. Add `PRODUCTION_DATABASE_URL` to `packages/backend/.env` (`DATABASE_URL` defaults to local 5433). Then `npm run db:local` → `npm run db:sync` (pull prod → local, re-runnable) → `npm run dev`. Local backend hits local Postgres; production is untouched.

### Branding

- **App name**: FolioBuddy. **Logo**: `public/logo.svg` (indigo→purple gradient); sidebar icon is inline SVG with `bg-primary` for theme adaptivity.
- **Package scope**: `@foliobuddy/*` (root `foliobuddy`); repo `n3moxyz/foliobuddy`. Local DB `example_portfolio_db`; prod storage/bucket names in private ops notes.

### Clickable Rows (Keyboard Safety)

Snapshot rows (AUTOMATIC) and position rows are clickable anywhere. Every keyboard-activatable row MUST guard `onKeyDown` with `e.currentTarget === e.target`, and the actions `TableCell` must stop BOTH `onClick` and `onKeyDown` propagation — else Enter/Space on a nested button bubbles to the row, `preventDefault()` cancels the button, and the row action fires instead (WCAG 2.1.1). References: `TradeTable`, `PositionRow`, `SnapshotTable`.

## Design Context

See `PRODUCT.md` — source of truth for users, brand, aesthetic, design principles. Dark mode primary; Linear/Raycast polish × Dune data-density. Old tool asks for `.impeccable.md`? Point it at `PRODUCT.md`.

## Gotchas & Notes

- `.env.local` overrides `.env` in Vite — wrong ports / "DB Down"? check it first.
- Always `onDelete: Cascade` in Prisma relations (avoids FK errors).
- FX fallback rates are display-hint only; persisted non-USD cost-basis conversions must wait for real rates.
- Snapshots use unique constraint + check-before-create to prevent duplicates.
- Position P&L displays as percentage for clarity.
- Bulk import skips price fetching (`skipPriceFetch: true`); the scheduler updates within 1 minute.
- `LOG_LEVEL` controls backend verbosity (default `info` prod, `debug` dev).
- CI runs typecheck + full test suite + frontend build + `npm run format:check` (formatting + shell syntax + domain parity) on push/PR.
- Sentry captures only unexpected 500s (Zod 400s + AppErrors < 500 skipped).
- `console.error` crashes on ZodError in Node — integration tests must mock the logger.
- vitest `exclude: ['dist/**']` prevents duplicate runs after `npm run build`.
- Protected routes mutating by `id` only = security bug — positions/trades/investors writes must be ownership-scoped.
- Don't gate the dev demo route with extra env flags; `import.meta.env.DEV` can't be enabled in prod accidentally.
- `VITE_WS_BACKEND_URL` must be set in Vercel for prod WebSocket (warns + disables if missing).
- Deploy backend before frontend when API version paths change (frontend uses `/api/v1`).
- Workspace imports (`@foliobuddy/shared`) MUST be in the consumer's `package.json` — hoisting masks it locally; Vercel's `npm ci` rejects it (CI guards via `npm ls --workspaces`).
- Backend Dockerfile is package-isolated — `src/lib/constants.ts`/`domain.ts` duplicate shared enums/helpers; `npm run domain:check` enforces parity.
- `VITE_API_URL` in Vercel must be the full `/api/v1` path — verify with `curl .../api/v1/health/db`.
