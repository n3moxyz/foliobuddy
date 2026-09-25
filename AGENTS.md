# AGENTS.md

> **Maintenance rules**:
>
> - **Self-update**: update file when patterns, key files, commands, gotchas, or env vars change.
> - **Sync with CLAUDE.md**: Mirror changes to both files (only title + agent name differ); keep each under 35,000 characters.
> - **FORET.md**: after significant changes, add features/fixes/lessons/tech changes (keep conversational tone).

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions + net worth across crypto, equities, NFTs, + alts. Multi-user support with investor stake tracking.

## Tech Stack

- **Backend** (`packages/backend/`): Node.js + TS (ES2022), Express 4.18, Postgres (prod private host, local via Docker), Prisma 5.10, Clerk auth, node-cron 4, Zod
- **Frontend** (`packages/frontend/`): React 18 + TS, Vite 8, React Router v6, TanStack React Query (server state) + Zustand (client state), shadcn/ui + Radix + Tailwind 3.4, Recharts

## Key Files

### Backend

Under `packages/backend/`; full file map: [docs/CODEBASE.md](docs/CODEBASE.md#backend).

- `src/index.ts`: server, rate limiting, logger, FX job init, `/api/v1` prefix; `src/routes/`/`src/services/`/`src/middleware/`: endpoints/business logic/auth + errors; `src/lib/`: utilities.
- `src/__tests__/`: vitest unit + integration; `prisma/schema.prisma`: DB schema.
- `vitest.globalSetup.ts`: probe generated Prisma client in a child process; regenerate before tests if missing. Keep probe isolated so backend env cannot leak into workers.

### Frontend

Under `packages/frontend/src/`; full file map: [docs/CODEBASE.md](docs/CODEBASE.md#frontend).

- `App.tsx`: routing; `pages/`: Dashboard, Portfolio, Trades, News, History, Investors, Settings; `hooks/`: React Query; `stores/`: Zustand.
- `components/ui/`: shared primitives; `formatted-number-input.tsx` pure helpers live in `-utils.ts` for Fast Refresh.
- `Trades.tsx`: shared state + dialogs; `components/trades/`: table, detail, clipboard + lens UI/aggregation; `components/portfolio/`: position form UI/math, clipboard + storage options.
- Root `react-doctor.config.json`: React Doctor triage policy.

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
# Root; test = backend + frontend; build = all build/typecheck
npm install · npm audit (0 vulns) · npm test · npm run build
npm run format · npm run format:check # Prettier + scripts:check (bash -n, skips Windows) + domain:check (backend↔shared parity)
npm test --workspace=@foliobuddy/backend -- --coverage # full V8; same for frontend
# DB: Docker Desktop, Postgres 5433; db:sync uses backend .env PRODUCTION_DATABASE_URL (prod→local, re-runnable, prod untouched)
npm run db:local · npm run db:local:stop · npm run db:sync · npm run db:seed:scale # sanitized scale data
# packages/backend: dev 4001; packages/frontend: dev 4000
npm run dev · npm run build # both packages
npm run test · npx prisma migrate dev · npx prisma studio # backend only
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none # optional advisory a11y/quality scan
# Dev-only mocked frontend demo: http://localhost:4000/dev/demo
```

## Architecture

Static frontend (React + Vite) → HTTP + Clerk JWT → Express backend → Prisma → Postgres 17 (private network). Background jobs (node-cron): price refresh (every min), manager NAVs (startup + hourly :05), snapshots (daily 5am SGT / weekly Sun / monthly 1st), FX rates (hourly).

## Key Patterns

### Auto-Create User

First-time Clerk users auto-create via `ensureUser` middleware.

### Snapshot System

Portfolio snapshots: daily/weekly/monthly/YTD returns + BTC/ETH outperformance. `User.snapshotHour` (int 0–23) + `User.snapshotTimezone` (IANA, must format in `Intl`), default `5`/`Asia/Singapore`; Zod-validated `GET/PATCH /users/me/preferences`. Hourly `0 * * * *` UTC selects users due in that tick (`lib/snapshotSchedule.ts`; skipped DST hours → first valid instant); WEEKLY local Sunday, MONTHLY local 1st. `Snapshot.scheduledLocalDate` + unique `(userId, snapshotType, scheduledLocalDate)` guards cross-instance duplicates; keep local-day pre-check. Returns stored `percent × 100`. YTD anchor = current year's first snapshot (`timestamp >= Jan 1 UTC`, `portfolioService.getSummary()`), never unfiltered `findFirst orderBy:asc`. One-shot backfill: `scripts/backfill-equity-snapshots.ts`.

### Yahoo Search & Local-Currency Equities

Yahoo search IP-filters by region; `YahooFinanceProvider.search()` falls back to IP-neutral `/v7/finance/quote` for ticker-shaped queries without an exact match. Suffix→currency: `.SI`→SGD, `.T`→JPY, `.TW`/`.TWO`→TWD, `.KS`/`.KQ`→KRW, `.OL`→NOK; prefer primary local exchanges over OTC/EU listings. Keep Kioxia (`285A.T`) + Oslo tests in `YahooFinanceProvider.test.ts`; story: FORET.md.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement`: `pdf-parse` text → first successful broker parser in `src/services/statementParsers/` (deterministic ISIN/value anchors). Brokers: **UOB Kay Hian**, **FSMOne/iFAST**. `statementMatching.ts` (ISIN/currency must agree): ISIN → provider symbol → exact symbol → exact name; broker storage breaks ties. New broker: add parser + append to `routes/assets.ts` `parsers`; update error string + broker→`storageLocation` map; keep `statementMatching.test.ts` coverage.

### Daily Unit-Trust NAVs

Unit trusts: `currentPriceNative`/`priceAsOf` (4 decimals) are authoritative, separate from check status; every NAV/FX valuation write is atomic; imports never seize automatic ownership. Details: [NAV runbook](docs/solutions/2026-09-10-daily-unit-trust-nav.md).

### CoinGecko Rate Limiting

Queue-based: 2.1s between calls, 30s in-memory cache, batch up to 50 coins.

### TTLCache

`TTLCache` uses `Map` insertion order for LRU eviction; eviction must check iterator's `done` flag, not key `undefined` (a legal `Map` key). Keep `TTLCache.test.ts` coverage for both cases.

### React Query + Zustand Split

- React Query: server state. No global `refetchInterval`; global `refetchOnWindowFocus` stays `false`. Money-sensitive `usePortfolio.ts` queries opt into `refetchOnWindowFocus` + `refetchOnReconnect`. First-load skeletons gate on `isPending`, not `isLoading` (a paused offline/hidden-tab load isn't fetching); never on `enabled: false` queries.
- Zustand: client state (currency + global monetary-privacy preferences)

### Structured Logging

All backend code uses `logger` (`src/lib/logger.ts`) — no `console.log` in prod. Respects `LOG_LEVEL` (debug/info/warn/error); invalid values fall back to `info`, so a typo can't suppress warn/error.

### Rate & Payload Limits

Global express-rate-limit on `/api`: 200 req/15 min, override `RATE_LIMIT_MAX` (local dev 10000); constants in `src/lib/constants.ts`. Express JSON cap **1mb** (`MAX_PAYLOAD_SIZE`), deliberately tight — if bulk import 413s, bump constant, don't widen globally.

Catalog caps: every asset-writing route MUST Zod-validate trimmed `name` ≤ `MAX_ASSET_NAME_LENGTH` (200), `symbol` ≤ 20 (manual/provider) or `MAX_ASSET_SYMBOL_LENGTH` (40: unit trust/CoinGecko/bulk); names feed regex. Shared + backend constants (`domain:check`).

### Pagination (Backend)

Trades/snapshots: optional `?page=1&limit=50`; no `page` → full array. Use `parsePagination()`/`paginatedResponse()` (`src/lib/pagination.ts`); preserve compatibility, clamp offset to Postgres's safe integer range. Numeric/date queries MUST use `parseBoundedIntegerQuery()`/`parseDateQuery()` (`src/lib/queryParams.ts`): reject partial/repeated/non-finite/fractional/impossible-calendar inputs; cap history/limit work before Prisma/providers.

### Atomic Investor Mutations

Investor create, stake update, owner reassignment + delete/reassign are multi-row changes — keep each in a `Serializable` Prisma transaction so a failed stake-history write can't clear owner or partially transfer/delete investor. Validate stake capacity before owner mutation.

### Trade Date & Analytics Contracts

Create/update/close/import dates: real calendar values, `exitDate >= entryDate`; analytics month buckets UTC. `TradeAnalytics.profitFactor = null` = JSON-safe ∞ (wins, no losses) → UI `∞`; best/worst trade null unless the corresponding trade exists. Optional USD `fundingCost` ≥ 0, default `0`: closed `realizedPnL` = `price P&L - fundingCost`, `realizedPnLPct` = net ÷ entry size → analytics inherit it; create/edit/bulk-import, clipboard, exports + demo mode MUST keep it; trade details show deduction beside net Realized P&L.

### Lazy-Loaded Routes

All pages lazy-loaded (`React.lazy()` + `Suspense`); Vite `manualChunks` splits vendors (recharts, socket.io-client, @sentry/react, @clerk/clerk-react). `chunkRecovery.ts` gives `vite:preloadError` one reload per 60 seconds; keep the cap to avoid loops.

### Public Landing Page

Signed-out: `/` → lazy `pages/Landing.tsx` (`components/landing/` sections), else `pages/SignInPage.tsx`; signed-in `/sign-in` → `/`. `dark` wrapper forces dark; only deterministic local `landingData.ts` (no API calls); hand-rolled SVG (never recharts); `landing-*` `index.css` utils (reduced-motion covered); never grow the signed-in bundle. **Key-feature rule**: each major user-facing feature (new tab/page, headline capability) → assess landing fit; if yes, usually a `CapabilityBento` on local data (mirror real UI, never fetch); News = reference.

### Dev Demo Route

`src/dev/demoMode.tsx` — local-only `/dev/demo`, UI testing without Clerk/backend; never prod write APIs.

- `App.tsx` lazy-loads only under `import.meta.env.DEV`; never prod, no extra env gates.
- Mocks `/api/*` + `/api/v1/*`; unmount restores `fetch` + token getter; child routes await mocks (`DemoPages` `useLayoutEffect` + readiness timer), else React Query caches empties.
- Stateful CRUD/import resets on refresh; new mocked write/import routes → update `src/dev/__tests__/demoMode.test.ts`.
- Seed spans all buckets; sync `Position.assetId`/`asset` via `demoAsset(id)`, never array indexes; perf history: `days`/`from`/`to`/`all=true`.

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

- sonner `AppToaster` (`components/layout/AppToaster.tsx`): raw `theme` (Sonner resolves `system` + tracks OS); Radix `DismissableLayerBranch` prevents toast clicks/focus closing any Radix layer. Pin `@radix-ui/react-dismissable-layer` to one Radix-wide version (`npm ls` after any Radix bump; `docs/DEPENDENCIES.md`).
- Toaster `className="pointer-events-auto"` counters modal body pointer lock; `top-center` below `sm`, `offset`/`mobileOffset` top 64px clears `h-14`. Modal FocusScope traps Tab: toasts unreachable by keyboard while modal open (pre-existing).
- `MutationCache.onError` toasts every failed mutation; handlers must never fail silently (`console.error`-only catch = bug); copy/refresh/snapshot toast success + failure. Story: FORET.md.
- Skeletons `role="status"` + sr-only text; inline errors `role="alert"` + `aria-invalid`/`aria-describedby`.

### Responsive Mobile Design

iOS HIG, all pages:

- **Tables → cards**: `PositionTable` → `renderMobilePositionRow` below `md`; full table only on "All columns" (`showMobileColumnToggle`). `mobileVariant` `focus` (symbol+name, value, P&L pill, meta) / `compact` (value + P&L); row actions → 44px `⋮` menu; Trades column-hides (`hidden md:table-cell`).
- **Dialogs**: content-heavy dock full-width to mobile's bottom (`!bottom-0`, rounded top, safe-area bottom padding), centered modal `sm+`; all `w-[calc(100%-2rem)]` + `max-h-[85vh] overflow-y-auto`.
- **Touch**: 44px, compacting `sm+`/`md+`; `Input`/`SelectTrigger`/`DropdownMenuItem`/asset-search options/creatable-select row actions bake `h-11`/`min-h-11` → `sm:`; never redo per-call-site heights; dense row actions need `shrink-0`.
- **Headers**: `flex-col gap-3 sm:flex-row`; secondary actions → `DropdownMenu` overflow.

### Smart Price Formatting

`formatPrice()` (`lib/utils.ts`): per-unit entry/exit/current prices, not `formatCurrency(..., 0)`; decimals <$0.01→5, <$0.10→4, <$10→3, <$1,000→2, ≥$1,000→0. Totals/sizes/P&L → `formatCurrency`; cost/total amounts → `currencyDecimals(currency)` (0 JPY/KRW, else 2), not magnitude-based `priceDecimals`. Portfolio Price/Avg Cost: app currency + differing `asset.nativeCurrency` on a muted second line via `localPriceLabel()` + `/fx/rates` USD→native map. Full-opacity `text-muted-foreground` (opacity variants fail contrast at 11px). Unit trusts: see Daily Unit-Trust NAVs.

### Smart Quantity Formatting

Use `formatQuantity()` for read-only quantity displays (tables, dialogs, history, previews) — trims trailing zeroes, caps precision by asset type (equities 4, UT 3, crypto 8, cash 2). Keep editable fields as raw `FormattedNumberInput` strings so precision survives typing/saving.

### Formatted Amount Inputs

Use `FormattedNumberInput` for editable money/quantity/NAV/capital/exposure fields — renders `10,000` over raw-string state so `parseFloat()`/payloads stay safe. Avoid raw `type="number"` for finance amounts unless min/max needed. Never coerce leading-negative input positive (`sanitizeNumberInput('-1')` → `''`). Gate submit on `isPositiveNumberInput()`/`isNonNegativeNumberInput()` (`src/lib/formValidation.ts`), not `required`/`parseFloat`, so UI guard matches backend Zod.

### Trades Review Lenses

`Trades.tsx`: 3 lenses above shared Trade Tape: **Review** default (collapsed stats, All/Open/Closed table); **Ticker Dossier** (`?ticker=SOL`, chip clears param); **Monthly Postmortem** (`?view=monthly`, month summaries, edge tags, loss review, open watchlist). `useTrades()` fetches all once; local filters preserve summaries across tab switches. Keep demo `TradeAnalytics.bestTrade/worstTrade` synced to seeds. `TradeForm` optional `trade` prop = edit; defaults entry 5 days ago, exit today. Tape rows clickable + keyboard-activatable (Clickable Rows). UI: `TradeLensViews.tsx`; aggregation: `tradeLensModels.ts`.

### News Tab

`/news` (shortcut `N`): owned (`custodyOf: null`) + open-trade holdings. Top stories → Crypto/Equities (one card per holding: top story + "N stories"; quiet and past-cap holdings listed below) → Macro. Holding search → `?asset=<assetId>` page (60 days, newest first). Sources, endpoints, ranking detail: [docs/NEWS.md](docs/NEWS.md).

- Queries (`services/news/newsQuery.ts`): US tickers by ticker; suffixed listings by cleaned company name; coins by name (Yahoo returns nothing for `D05.SI`/`SOL-USD`). Keep Yahoo results only when `relatedTickers` has the ticker or the headline names the company; fail open when no tags; still bound `Asset.name` before any regex (rows can predate the ingestion cap). `.SI` also queries Google News RSS (`googleNews.ts`): never fails the page, pauses on 403/429/503/non-RSS; linear CDATA-safe parse, `news.google.com` links only; classify by `sourceUrl`, never enrich its redirects.
- `GET /news` fetches the 40 largest targets; `holdings` lists all (`loaded`). Uncached failures reject; partial refresh keeps successes; all-Yahoo-failed rejects so React Query keeps last-good headlines. `GET /news/asset/:assetId`: 404 unless an owned/open-trade news target.
- Ranking: tiers 1–4, unknown = tier 4/null label, never "verified"; tier 1/primary ONLY from official domains (gov/allowlist or `Asset.officialDomain`), never publisher strings. One story, one place (a holding with only shared coverage shows it too). `topStories`: high materiality + (tier ≤2 or tier 3 with ≥2 distinct publishers), cap 4, empty on quiet days. API: labels only, never scores/weights/position values/provider tags (test-enforced).
- UI: `News.tsx` + `components/news/`; `useNews`/`useAssetNews` 5-min staleTime; no money → no privacy wiring. Flag feedback logs story metadata only. Demo mocks every news route.
- Stage 2 enrichment (optional `ANTHROPIC_API_KEY`): Top stories only, from the FETCHED article body (no text = no enrichment), pinned public-DNS fetches; success cache keyed by story id + sorted `affectedSymbols` (never serve one holding context's explanation to another); low confidence never served.

### Portfolio Hero Summary

Borderless hero (matching Net Worth). **Desktop** (`hidden sm:block`): large tabular Total Value + inline YTD trend arrow, then 5-col `divide-x` grid (YTD Start, DD from ATH, Exposure, Positions, YTD P&L — drawdown via shared `useDrawdownStats()`), `HelpTooltip` on every label. **Mobile** (`sm:hidden`): compact bordered card — Total Value, YTD P&L, inline "Add". Exposure = owned non-stable/non-cash + server-backed perp ÷ total; custody excluded.

### Perp Exposure Persistence

`User.perpExposureUsd Float?` = signed-in user's aggregate open perp size in USD; round-trips via `GET/PATCH /users/me/preferences`; Portfolio + Dashboard share the React Query value (cross-device). `null` = never initialized, `0` = explicitly none. First load: a valid positive `foliobuddy-perp-exposure`/legacy `pa-portfolio-perp-exposure` seeds only a `null` server field (non-null server wins); clear local keys only after the migration PATCH succeeds. Perps affect Exposure + Cash/Perps allocation, never net worth or snapshots. Demo mode mirrors the round-trip, resets to `null`.

### Portfolio Section Headers

2-level, all breakpoints: **Crypto/Equities/Cash** (`Portfolio.tsx` via `CollapsibleCard`, `icon` + `accentColor`) → **CEX/Broker account/Bank/Onchain** (`PositionTable`, trigger $ totals). Equities: persisted By Broker/By Type. Accent tokens `crypto`/`equities`/`cash`/`custody` in `index.css`/`tailwind.config.js`, never raw `-500`; custody accent `CUSTODY_CONFIG`. Heading wraps trigger (`<h2><button>`), never reversed: invalid HTML hides headings from SR nav. Desktop `hidden sm:block` full table rows; mobile `sm:hidden` `mobileVariant="compact"`, no column toggle; custody own section on both.

### Custody Positions ("Held for Others")

`Position.custodyOf String?` — `null`=owned. Excluded from net worth, P&L, allocations, snapshots, exposure (backend filters `custodyOf: null`); Zod `z.string().nullable().optional()` (empty string → null). `Portfolio.tsx` splits owned vs custody (purple "Held for Others" card). `CustodyCheckbox.tsx` sits at bottom of every form, name dropdown (positions + `foliobuddy-custody-names` + "Add new person"); edit sends empty string to clear. Clipboard JSON has `custodyOf` when set.

### Creatable Storage Location Dropdowns

Only free-text location dropdowns (CEX/wallet/broker/bank) use `CreatableSelect`: no "Others", "+ Add new ..." row; Category/storage type/fiat currency/direction/theme stay fixed.

- Customs: popover pencil/trash pointer-only, Rename/Remove under trigger keyboard; keep both.
- Defaults protected; customs → `foliobuddy-storage-location-options` by storage type (`positionOptions.ts`); delete drops only the option, positions keep value (edit forms re-add one-off).
- `onValueChange` must ignore empties Radix emits on create-row close.
- `SelectContent` sizes to content, above dialogs (`z-[60]`); never force `h-[var(--radix-select-trigger-height)]` or reuse dialog `z-50` (menus open but clipped).

### Cash Positions (Stablecoins + Fiat)

Former Stables category is now **Cash**. `PositionForm.tsx` Cash shows a **Type** dropdown (USDT, USDC, USDe, FDUSD, DAI, **Cash (fiat)**); Cash (fiat) reveals a **Currency** dropdown (`USD`/`SGD`/`GBP`), creates/reuses a `CASH` asset (SGD priced from summary rate at creation; fiat cash is `priceProvider='manual'`). Storage by Type: stablecoins → CEX/Onchain; fiat → Broker account/Bank. Broker defaults `BROKER_LOCATIONS` (`FSMOne`, `IBKR`, `Tiger`, `UOB KH` — never `DBS`); bank defaults `Citi`, `DBS`, `SCB`, `Trust+`, `UOB`. `PositionForm` guards storage-type validity when Type changes.

### Equity Positions (Stock/ETF + Unit Trust)

Create-only sub-type toggle (edit infers category). Provider contract: **Stock/ETF** = `single`/`EQUITY`/`yahoo`; **Unit Trust** = `fund`/`UNIT_TRUST`/`manual`|`yahoo`|`fund-manager` (configured automatic NAV).

- **Form:** creatable broker, `storageType='BROKERAGE'`; cost currency = `asset.nativeCurrency` (SGD/JPY/TWD/KRW/NOK inputs, stored USD). Non-USD cost basis MUST await real `/fx/rates` (or SGD summary rate); fallback FX display-only. Edit USD→local via `costInitialized`.
- **Display:** default `groupBy='broker'`; header toggles `equityType`, persisted `foliobuddy-equity-group-by`. UT: `Unit Trust` badge + `NavStatus` (`priceAsOf` age, failed-check line); manual-priced non-UT non-cash: `priceAgeClass` age (muted <7d, amber 7–30d, red ≥30d/null).
- **Upload:** dashed `<label>` wraps PDF input (click/drag-drop); matched UTs update, never duplicate: `statementMatching.ts` → `PUT /positions/:id` (parsed units/cost, `mode='reset'`) + parsed NAV via `PATCH /assets/:id/nav` (history/fallback; automatic NAV wins). No cash funding for matched statements (reconciliation).
- **Copy/Paste:** non-coingecko clipboard keeps `priceProvider`/`providerAssetId`/`nativeCurrency`/`exchange`/`isin`. Bulk import honors these only for new Assets (defaults `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`); existing assets match verified fund identity before symbol.

### Position Edit Modes

`PositionForm.tsx`: `Edit Totals` (corrections) + `Add/Reduce Position` tabs.

- `Add`: extra quantity + required total/avg cost → weighted avg. `Reduce`: quantity + same pair as optional sale proceeds (`Total Proceeds`/`Avg Price`); basis removed at current avg; proceeds never alter avg/basis. Quantity 0 deletes the position (history cascades, cash row stays; preview warns).
- Optional `Fund From` (Add: debit pile, balance ≥ cost) / `Fund To` (Reduce: credit proceeds >0, empty piles allowed). Tab switch clears amounts + pile; direction-aware confirmation.
- Persist custody changes from either tab. Old/New preview (qty, avg, total cost). Preview + submit share `applyPositionDelta()`; never hand-roll basis math. UI `PositionDeltaEditor.tsx`, math `positionFormMath.ts`, submit `PositionForm.tsx`.

### Position Add/Reduce History

`PUT /positions/:id` + `positionDelta` writes `PositionHistory`; validate next quantity/basis against delta, update position + history in one `Serializable` transaction (pile read inside; P2034 → 409). `fundingCashPositionId` needs `positionDelta`, never custody rows (hide picker). Funded add ↔ cash `reduce`; reduce-only `positionDelta.proceedsUsd` → `PositionHistory.proceedsUsd` (>0 with pile) ↔ cash `add` (quantity = proceeds ÷ pile USD price, basis = proceeds). Shared `operationId`: cancel restores both. Proceeds ledger: `Sold for … · Realized …`. `Edit Totals`: `mode='reset'`, collapse old rows, never delete history. `DELETE .../history/:historyId`: only newest add/reduce, totals must match. Demo mirrors; story: FORET.md.

### Global Value Privacy

`AppShell` eye → `privacyStore`, persisted `foliobuddy-values-hidden`. All read-only money MUST use `useMoneyFormatter()` (`formatCurrency`/`formatPrice`/`formatSignedCurrency`): pages, dialogs, tables, chart labels/tooltips, import previews; inputs stay visible. Native sublabels: `positionPriceDisplay.ts` takes `valuesHidden`. Percentages, quantities, counts, chart geometry stay visible; copied charts reflect current privacy.

### Dashboard Charts

- **Portfolio Value**: AreaChart, `$`/`%` lens (`%` rebases to range's first positive point); 7D/1M/3M/1Y/YTD/Max; loading `isFetching`. `getDateRange('Max')` MUST send `all=true` to `/snapshots/performance` (empty query defaults to 30 days).
- **Portfolio % vs Benchmarks**: normalized % vs BTC/ETH/SPX/custom. Keep `provider` + `providerAssetId` (crypto→CoinGecko, TradFi→Yahoo); SPX = `SPY`, not `^GSPC`, via `yahooFinance.chart()`. Failed `priceService.getAssetHistory()` falls back to stored `PriceHistory` (1 point/UTC day; needed for local QA). Baseline = price at first portfolio timestamp. Tooltip renderer `useCallback`'d; inline arrows break memoization.
- **4 donuts**, `AllocationCharts.tsx`; filter custody first: **By Asset** Crypto/Equities/Cash (`bucketFor()`), carve Perps from Cash (`allocationMath.ts`, clamp to cash), slice-click drills detail; **Detailed** Auto=dominant bucket, <2%→Other (`groupSmallDetailedSlices`); **By Storage** CEX splits Cash/Crypto, <3%→Other (`groupSmallStorageSlices`), protect CEX/Onchain; **Cash Breakdown** by symbol. Titles/totals separate header rows; center=top item's %; no Recharts Tooltip (legend overlap); legends 44px targets.
- **Image copy**: every chart card `ChartCopyButton` + `chartCopy.ts` → high-res PNG, exclude button; disable Recharts draw animations (immediate copies must not capture partial SVG). Needs `ClipboardItem` + `navigator.clipboard.write`; toast failures.

### Dashboard Investor Default

Dashboard investor filter defaults to primary owner (`isOwner = true`), not "all investors", when an owner record exists.

### Net Worth Card

Borderless hero, investor title (`Net Worth (Nemo)`). Ordered 9-metric rail: YTD P&L, YTD Start, YTD ATH, MDD, MDD (1D), DD from ATH, Exposure, Positions, Trades. `xl+` shares width; narrower: one horizontal snap-scroll rail, 9rem cells, never wrap; visible scrollbar, keyboard-focusable region. Compact footer: alternate USD/SGD total. `useDrawdownStats()` (`usePortfolio.ts`, shared Portfolio hero) → `calculatePortfolioDrawdownStats()` on YTD snapshots + live value: 4 metrics/one pass, positive magnitudes displayed as negative %. `HelpTooltip` labels need distinct accessible `label`; buttons OUTSIDE `<Link>`s, never nest interactive content in links. Key values share `useAnimatedNumbers()` loop.

### Performers Card

Borderless `divide-y` list, profit/loss-tinted title icons, muted tabular ranks. Ranking (`getTopPerformers`/`getWorstPerformers`): by absolute `unrealizedPnL` USD, not %.

### Page Entrance Animations

`animate-fade-in-up` on page headers only — no staggered section animations. Respects `prefers-reduced-motion`; `index.css` reduced-motion block zeroes tailwindcss-animate/collapsible utilities via attribute selectors (plain class selectors can't match variant-prefixed classes) — cover new animation utilities there.

### Settings & Investors Page Layouts

Settings: flat layout, `<h2>` headings + `<Separator>`, no Card wrappers. Investors: summary stats in a flat inline row (matches History).

### Consistent Page Headers

All pages use same header pattern: `flex-col gap-3 sm:flex-row ... justify-between` wrapper, `text-2xl font-bold` title + muted subtitle, `size="sm"` buttons, `mr-1` icons. Every page sets `usePageTitle('...')`. High-scroll pages use `PageActionHeader` (sticks below shell at `top-14 sm:top-16`; `stickyOnMobile={false}` on Portfolio/News; hosts body panes — hero stats, lens tabs, counts). Dashboard intentionally scrolls normally.

### Destructive Actions in Headers

"Delete All" MUST live inside overflow `DropdownMenu` (⋮), never standalone header button. Only non-destructive actions (Copy All, Add/Log) are visible header buttons.

### Design System & Visual Identity

- **Colors**: indigo-tinted neutrals; `--primary` AA-safe as fill, not text. `index.css` fill→text: `.text-primary`→`--primary-text`, `.text-destructive`→`--loss-foreground`, `.text-warning`/`.text-info`→`-foreground` variants (+ `hover:`/`focus:` forms, no revert to fill). Never raw amber/green/blue for semantic text; fills `bg-warning`/`bg-info`; P&L `text-profit`/`text-loss`; chart colors only from `chartColors.ts`, never inline hex; dialog/nav scrims theme-invariant `bg-black/60|40`, never `bg-foreground/*` (dark-mode wash).
- **Theme**: `themeStore` `light`/`dark`/`system`; `resolveTheme()`+`useThemeEffect` track live OS changes; Clerk `baseTheme: dark` when resolved dark; `index.html` `theme-color` metas both schemes.
- **Fonts**: Plus Jakarta Sans (body) + JetBrains Mono (numbers); `.skeleton` shimmer everywhere; scrollbars thin 6px rounded thumb; empty states = icon + heading + description + CTA.
- **HelpTooltip**: `?` on finance terms; controlled open, tap-to-toggle, `stopPropagation` on pointer events (taps must not toggle `CollapsibleCard`). **Sidebar**: Linear-style active state (`border border-primary/30 bg-primary/10 text-primary font-semibold`, no stripe); desktop collapses to persisted 72px icon rail (`foliobuddy-sidebar-collapsed`), mobile full-width drawer.

## Environment Variables

All vars + comments: `packages/backend/.env.example` + `packages/frontend/.env.example`. Extra gotchas:

- Backend `PORT=4001`, never 3001 (reserved for other projects); local `RATE_LIMIT_MAX=10000`, prod default 200. `VITE_API_URL` needs full `/api/v1`.
- Empty `ADMIN_USER_IDS` warns at boot; catalog edit/delete then 403s for all users. `AGENT_API_KEY` authenticates agent calls; `AGENT_USER_ID` picks portfolio. After owner Clerk-ID rotation run `sync-backend-env.yml` to align `ADMIN_USER_IDS` + `AGENT_USER_ID`, else agent calls return HTTP 200 + empty portfolio.
- `ALLOW_LOCAL_AUTH_BYPASS`/`VITE_LOCAL_AUTH_BYPASS`: local scale-QA only; ignored under `NODE_ENV=production`/non-DEV Vite builds.

### Frontend-Only Development / UI Testing

See **Dev Demo Route** (mocked `/api`, `/dev/demo`); **Local QA Auth Bypass** (sanitized real-API scale QA — flags + CORS gotcha): `docs/qa/local-production-scale-runbook.md`. Never with prod data/builds.

## Deployment

- Backend Node: `https://api.foliobuddy.xyz`; static frontend: `https://foliobuddy.xyz` (rewrites API calls); Postgres private network. Backend auto-deploy: GitHub Actions, main pushes touching backend; frontend: Vercel. DB backups daily/weekly/monthly → private object storage.
- `DEPLOYMENT.md`: public shape, checks, monitoring, smoke tests, backups; secrets in private ops notes. API-path changes: backend before frontend. Env-var workflow: `printf`, never `echo`.
- Clerk Development `pk_test_`/`sk_test_` are the only keys that work on localhost; Production `pk_live_`/`sk_live_`, Frontend API `clerk.foliobuddy.xyz`. Users never transfer instances; `User.id` IS Clerk id. Switching needs `packages/backend/scripts/` mirror + remap; runbook/rollback: DEPLOYMENT.md "Auth (Clerk)" + `docs/solutions/2026-08-17-clerk-dev-to-prod-user-id-remap.md`. Backend GitHub secrets `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY`/`ADMIN_USER_IDS` → Coolify via `sync-backend-env.yml`; frontend key in Vercel.

### Copy/Paste JSON Import Pattern

Portfolio/Trades/History share 1 pattern: per-row clipboard icon, Copy All header button, Import tab in Add/Log dialog — 1 JSON format for copy + import.

### Branding

- **FolioBuddy**, flat Embrace master `packages/frontend/public/logo.svg`; app identity uses `components/layout/BrandMark.tsx`, never recreate retired growth-chart mark.
- `apple-touch-icon.png` + `public/icons/` raster exports MUST stay synced to SVG; `manifest.webmanifest` install metadata; `index.html` links 180px Apple touch icon (favicon doesn't control iOS icon).
- Packages `@foliobuddy/*`, root `foliobuddy`; repo `n3moxyz/foliobuddy`; local DB `example_portfolio_db`; prod storage/buckets in private ops notes.

### Clickable Rows (Keyboard Safety)

AUTOMATIC snapshot + position rows: click anywhere. Every keyboard-activatable row MUST guard `onKeyDown` with `e.currentTarget === e.target`; actions `TableCell` must stop BOTH `onClick`/`onKeyDown` propagation, else nested Enter/Space fires row action (WCAG 2.1.1). Apply to non-table rows too. References: `TradeTable`, `PositionRow`, `SnapshotTable`, `PositionTable` mobile cards.

## Design Context

See `PRODUCT.md` — source of truth for users, brand, aesthetic, design principles. Dark mode primary; Linear/Raycast polish × Dune data-density. Old tool asks for `.impeccable.md`? Point it at `PRODUCT.md`.

## Gotchas & Notes

- Wrong ports/"DB Down": check `.env.local` first; it overrides Vite `.env`.
- Always Prisma `onDelete: Cascade` (avoids FK errors); snapshots need unique constraint + check-before-create.
- Position P&L displays as %; bulk import `skipPriceFetch: true`, scheduler fetches in 1 min.
- Push/PR CI: typecheck, tests, NAV Postgres verify, frontend build, `npm run format:check`.
- npm 10.8.2/`uuid` override/ExcelJS rules: `docs/DEPENDENCIES.md`.
- Sentry: unexpected 500s only, skip Zod 400s + AppErrors <500. Node `console.error` crashes on ZodError: integration tests MUST mock logger.
- vitest `exclude: ['dist/**']` prevents duplicate runs after `npm run build`.
- Mutating by `id` alone = security bug (Ownership Checks on Mutations).
- `@foliobuddy/shared` imports MUST be declared in consumer `package.json`: hoisting masks omissions, Vercel `npm ci` rejects them; CI `npm ls --workspaces` guards.
- Backend Dockerfile package-isolated: `src/lib/constants.ts`/`domain.ts` duplicate shared enums/helpers; `npm run domain:check` enforces parity.
- Vercel `VITE_API_URL` needs full `/api/v1`; prod WebSocket needs `VITE_WS_BACKEND_URL`: `DEPLOYMENT.md`.
