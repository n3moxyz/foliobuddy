# CLAUDE.md

> **Maintenance rules**:
>
> - **Self-update**: Update this file when patterns, key files, commands, gotchas, or env vars change.
> - **Sync with AGENTS.md**: Mirror changes to both files (only title + agent name differ).
> - **FORET.md**: After significant changes, update `FORET.md` with new features, bugs/fixes, lessons, and tech changes. Keep the conversational, teaching tone.

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions and net worth across crypto, equities, NFTs, and alternative investments. Multi-user support with investor stake tracking.

## Tech Stack

- **Backend** (`packages/backend/`): Node.js + TypeScript (ES2022 modules), Express 4.18, PostgreSQL (private production host, local via Docker), Prisma 5.10, Clerk auth, node-cron 4, Zod
- **Frontend** (`packages/frontend/`): React 18 + TypeScript, Vite 8, React Router v6, TanStack React Query (server state), Zustand (client state), shadcn/ui + Radix UI + Tailwind CSS 3.4, Recharts, Plus Jakarta Sans (body) + JetBrains Mono (numbers) via Google Fonts. Design context: `PRODUCT.md` at project root

## Key Files

### Backend

- `src/index.ts` - Server entry (rate limiting, logger, FX job init, `/api/v1` prefix)
- `src/routes/` / `src/services/` / `src/middleware/` - API endpoints; business logic (portfolioService, priceService, snapshotService); auth + error handling
- `src/lib/` - Shared utilities (constants, logger, pagination, tradePnL, sentry, TTLCache)
- `src/lib/constants.ts` - Domain enums (AssetCategory, StorageType, TradeDirection, TradeStatus, SnapshotType, SnapshotSource)
- `src/lib/domain.ts` - Backend-owned copy of core financial/domain helpers (position value math, add/reduce cost-basis math, provider/category compatibility)
- `src/lib/authorization.ts` - Admin and user-asset ownership guards for global asset catalog routes
- `src/lib/startupChecks.ts` - Production boot warnings for missing operational config such as `ADMIN_USER_IDS`
- `src/lib/TTLCache.ts` - Generic TTL cache with LRU eviction (used by priceService)
- `src/__tests__/` - vitest unit + integration tests. `routes/` = supertest + mocked Prisma; `helpers/` = createTestApp, fixtures; `scheduler.test.ts` + `socketService.test.ts` cover cron price-refresh fanout and WebSocket event payloads
- `prisma/schema.prisma` - Database schema

### Frontend

- `src/App.tsx` (routing); `src/pages/` (Dashboard, Portfolio, Trades, Investors, Settings); `src/stores/` (Zustand)
- `src/hooks/` - React Query hooks (usePortfolio, useTrades, etc.) + `useAnimatedNumber` (rAF number ticker); tests in `__tests__/`
- `src/lib/api.ts` - API client methods; `src/lib/types.ts` - frontend types; `src/lib/chartColors.ts` - OKLCH CSS-variable chart colors; `src/lib/chartUtils.ts` - time-period date helpers shared by PortfolioChart/BenchmarkComparisonChart
- `src/components/ui/` - `skeleton.tsx` (shimmer), `HelpTooltip.tsx` (? tooltips), `creatable-select.tsx` ("+ Add new ..." Radix Select), `formatted-number-input.tsx` (thousands-separator amount input; pure helpers in `-utils.ts` for Fast Refresh)
- `src/components/layout/PageActionHeader.tsx` - Sticky title/action header for high-scroll data pages
- `src/components/trades/` - `TradeLensViews.tsx` (lens UI) + `tradeLensModels.ts` (pure aggregation)
- `src/components/portfolio/` - `positionClipboard.ts` (copy JSON), `positionOptions.ts` (storage location options + localStorage customs), `positionFormMath.ts` (pure cost/add-reduce preview math on shared domain helpers), `PositionDeltaEditor.tsx` (add/reduce edit UI; submit logic stays in PositionForm), `PositionCostFields.tsx` + `PositionStorageFields.tsx` (extracted field groups)
- `react-doctor.config.json` - Root-level React Doctor triage policy

### Shared

- `packages/shared/src/types.ts` - Cross-package types, domain enums (`AssetCategory`, `StorageType`, `TradeStatus`, etc.), `categoryGroup()`, core position math helpers, `USD_SGD_FALLBACK_RATE`, `MAX_POSITIONS_PER_CATEGORY`. Frontend is the only runtime consumer — see Gotchas re: backend Docker isolation.

### E2E

- `playwright.config.ts` (Chromium only) + `e2e/smoke.spec.ts` (health, app load, auth redirect)

## First Run Setup

```bash
# 1. Install all dependencies (from root)
npm install

# 2. Backend
cd packages/backend && cp .env.example .env
# Fill in: DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ALLOWED_ORIGINS
npx prisma migrate dev   # Creates tables

# 3. Frontend
cd ../frontend && cp .env.example .env
# Fill in: VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY

# 4. Start both servers (separate terminals)
cd packages/backend && npm run dev
cd packages/frontend && npm run dev
```

## Commands

```bash
# Root (monorepo)
npm install              # Install all dependencies
npm audit                # Should report 0 vulnerabilities
npm test                 # Run backend + frontend unit/integration tests
npm run build            # Build/type-check all workspaces
npm run format           # Format all files with Prettier
npm run format:check     # Check formatting, shell script syntax, and domain constant parity
npm run scripts:check    # Syntax-check root shell scripts (bash -n); skips cleanly on Windows
npm run domain:check     # Verify backend domain constants mirror shared constants

# Local Database
npm run db:local         # Start local Postgres (Docker, port 5433)
npm run db:local:stop    # Stop local Postgres
npm run db:sync          # Pull production data → local DB

# Database Backups (run on DO droplet, not locally)
# ./scripts/backup-db.sh daily|weekly|monthly  — dump, compress, upload to DO Spaces
# ./scripts/restore-db.sh [path]               — list or restore backups

# Backend (packages/backend/)
npm run dev              # Start dev server (port 4001)
npm run build            # Compile TypeScript
npm test                 # Run unit tests (vitest)
npx prisma migrate dev   # Run migrations
npx prisma studio        # Database GUI

# Frontend (packages/frontend/)
npm run dev              # Start Vite dev server (port 4000)
npm run build            # Production build
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none
                         # Optional React quality/a11y scan (pinned, offline, advisory)

# Frontend demo route (dev-only, mocked API): http://localhost:4000/dev/demo
```

## Architecture

```
Static host (Frontend: React + Vite)
    ↓ HTTP + Clerk JWT
Node host (Backend: Express.js)
    ↓ Prisma ORM
PostgreSQL 17 (private network)

Background Jobs (node-cron):
├── Price refresh (every minute)
├── Daily snapshots (midnight UTC)
├── Weekly snapshots (Sundays)
├── Monthly snapshots (1st of month)
└── FX rate updates (hourly)
```

## Key Patterns

### Auto-Create User

First-time Clerk users are auto-created in database via `ensureUser` middleware.

### Snapshot System

Captures portfolio state at points in time. Calculates daily/weekly/monthly/YTD returns and benchmark outperformance vs BTC/ETH. All return fields stored as `percent × 100` (`12` = 12%, not `0.12`). YTD anchor = first snapshot of the _current calendar year_, scoped via `timestamp >= Jan 1 UTC` in `portfolioService.getSummary()` — not `findFirst orderBy:asc` without a date filter, which would pin YTD to a stale pre-year snapshot in future years.

### Snapshot Backfill Script

`packages/backend/scripts/backfill-equity-snapshots.ts` — one-shot for retroactively inserting positions into historical snapshots. Read the script header for usage (`--dry`/`--apply`/`--rollback`), `BACKFILLS` semantics (additive deltas, not states), and Yahoo-fallback interpolation.

### Yahoo Search IP-Filter Workaround

Yahoo's `/v1/finance/search` region-filters results by caller IP even with `region=US` (our Singapore droplet got only cross-listings for US ETFs). `YahooFinanceProvider.search()` falls back to the IP-neutral `/v7/finance/quote` when the query matches `/^[A-Z0-9.-]{1,10}$/` and search returned no exact-symbol match.

For Asian equities, Yahoo uses suffixed symbols and local currencies: Japan `.T` → JPY (e.g. Kioxia `285A.T`), Taiwan `.TW`/`.TWO` → TWD, Korea `.KS`/`.KQ` → KRW. Search queries fan out across US/JP/TW/KR regions, direct ticker lookups try the Asian suffixes for numeric tickers, and ranking intentionally prefers primary Asian exchanges over OTC/Frankfurt/Stuttgart/Munich/Hamburg cross-listings. Keep `YahooFinanceProvider.test.ts` coverage for Kioxia so name searches do not regress to OTC-only results.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` extracts text via `pdf-parse` and walks broker-specific parsers in `src/services/statementParsers/` until one succeeds. PDF text collapses table columns into a flat token stream, so each parser finds a deterministic anchor (ISIN or value-block regex) and reads fixed fields after it. Supported: **UOB Kay Hian** (`uobKayHian.ts`) and **FSMOne / iFAST** (`fsmOne.ts`). Adding a broker: new file alongside, append to `parsers` in `routes/assets.ts`, update the supported-formats error string, add a broker→`storageLocation` branch in `PositionForm.tsx:applyParsedHolding`.

### CoinGecko Rate Limiting

Queue-based requests with 2.1s delays between calls. 30-second in-memory cache. Batch requests up to 50 coins.

### TTLCache

`TTLCache` uses `Map` insertion order for LRU eviction. Eviction must check the iterator result's `done` flag, not whether the key is `undefined` (`Map` permits `undefined` as a real key). Keep `TTLCache.test.ts` coverage for normal LRU eviction and the `undefined` oldest-key case.

### React Query + Zustand Split

- React Query: server state. No global `refetchInterval`; global `refetchOnWindowFocus` stays `false`. Money-sensitive portfolio queries in `usePortfolio.ts` opt into `refetchOnWindowFocus` + `refetchOnReconnect` so stale figures refresh when the browser regains focus.
- Zustand: client state (currency preference)

### Structured Logging

All backend code uses `logger` from `src/lib/logger.ts` — no `console.log` in production code. Respects `LOG_LEVEL` (debug/info/warn/error); invalid values fall back to `info` so a typo cannot suppress warn/error output.

### Rate Limiting

Express-rate-limit applied globally to `/api` routes. Default 200 requests per 15 minutes; override with `RATE_LIMIT_MAX` (local dev uses 10000). Constants in `src/lib/constants.ts`.

### Request Payload Limit

Express JSON payload cap is **1mb** (`MAX_PAYLOAD_SIZE` in `src/lib/constants.ts`), deliberately tight. If a legitimate bulk import ever 413s, bump the constant rather than widening globally.

### Pagination (Backend)

Trades and snapshots routes support optional `?page=1&limit=50`; returns the full array when no `page` param. Uses `parsePagination()` / `paginatedResponse()` from `src/lib/pagination.ts`.

### Lazy-Loaded Routes

All pages are lazy-loaded with `React.lazy()` + `Suspense`. Vite `manualChunks` splits heavy vendors (recharts, socket.io-client, @sentry/react, @clerk/clerk-react) into separate chunks.

### Dev Demo Route

`src/dev/demoMode.tsx` provides a local-only `/dev/demo` route for UI testing without Clerk or a backend:

- **Dev-only**: `App.tsx` lazy-loads it only when `import.meta.env.DEV` is true — the mock payload never ships in production bundles.
- Mocks `/api/*` and `/api/v1/*` in the browser; restores the original `fetch` + token getter on unmount — never leave global monkey-patches installed.
- Child routes render only after the fetch mock is installed (else React Query caches empty real responses and demo appears blank). `DemoPages` installs the mock in `useLayoutEffect`, then flips readiness on a short timer to satisfy the `set-state-in-effect` lint.
- Stateful in-browser portfolio CRUD — use `/dev/demo/portfolio` for add/edit/delete/import UX testing. Resets on full refresh.
- Seed data intentionally spans all buckets (crypto, equities, unit trust, stables, USD/SGD cash, alternatives, storage types, custody). Keep each seeded `Position.assetId` and embedded `asset` in sync via `demoAsset(id)`, not array indexes. The 4th allocation chart needs stable/cash positions.
- Demo performance history must honor `/snapshots/performance` params (`days`, `from`, `to`, `all=true`); `Max` should include pre-1Y points.
- UI/responsive testing only — never point at production write APIs.

### React Doctor Quality Scan

Advisory frontend audit — see the pinned command in Commands. Treat results as triage input, not a refactor plan; be skeptical of React 19 advice while on React 18. `react-doctor.config.json` suppresses reviewed noise (React 19 migration advice, conflicting design-opinion checks, risky architectural nudges). Do not add suppressions for new accessibility, keyboard, ownership, render-correctness, or data-integrity findings without documenting why they are false positives. Known false positive: `apiMockReady` in `demoMode.tsx` ("updated but never read") — it gates rendering until the fetch mock is installed.

### Dependency Audit Notes

Root `package.json` intentionally overrides `exceljs`'s transitive `uuid` to `11.1.1` (ExcelJS 4.4 declares `uuid@^8.3.0`, flagged via `GHSA-w5hq-g745-h8pq`; ExcelJS only uses `v4()`, stable on uuid 11). Do not run `npm audit fix --force` — its suggested fix is a major ExcelJS downgrade to 3.4.0. Keep `npm audit` clean after dependency updates.

### Ownership Checks on Mutations

Protected update/delete routes must filter by both `id` and `req.userId!`, never `id` alone — prevents cross-user mutation if an ID is guessed.

Global Asset catalog rows are shared across users, so they follow split rules instead (guards in `src/lib/authorization.ts`): `PUT`/`DELETE /assets/:id` require an admin user from `ADMIN_USER_IDS`; per-user flows (`POST /assets/:id/refresh-price`, `PATCH /assets/:id/nav`) return 403 unless the authenticated user actually holds the asset. `GET /assets/:id` includes only the current user's positions.

### WebSocket CORS

Socket.io origin validation uses exact origin matching (`origin === allowed`), same as the Express CORS middleware. Never prefix-match trusted origins.

### Optimistic Deletes

Delete mutations in `usePortfolio`, `useTrades`, `useSnapshots` use optimistic updates with rollback on error.

### Responsive Mobile Design

iOS HIG-inspired patterns on all pages:

- **Column toggle**: Portfolio/Trades tables have a mobile-only "All columns"/"Compact" toggle — Compact hides secondary columns (`hidden md:table-cell`); expanded scrolls horizontally (`overflow-x-auto` + `min-w-[700px]`).
- **Touch targets**: shared `Button` sizes give 44px mobile hit areas, compacting at `sm+`/`md+`. Dense row actions need `shrink-0` so buttons aren't squeezed. Sortable headers, allocation legends, and `HelpTooltip` also need 44px mobile hit areas.
- **Responsive headers**: stack vertically on mobile (`flex-col gap-3 sm:flex-row`); secondary actions move to `DropdownMenu` overflow.
- **Dialog safety**: `w-[calc(100%-2rem)]` margins + `max-h-[85vh] overflow-y-auto`.

### Smart Price Formatting

`formatPrice()` in `lib/utils.ts` — use for per-unit prices (entry/exit, current price) instead of `formatCurrency(..., 0)`. Decimals by magnitude:

| Price Range | Decimals | Example  |
| ----------- | -------- | -------- |
| < $0.01     | 5        | $0.00842 |
| < $0.10     | 4        | $0.0812  |
| < $10       | 3        | $0.780   |
| < $1,000    | 2        | $32.15   |
| >= $1,000   | 0        | $67,200  |

Use `formatCurrency` (explicit decimals or compact mode) for totals, sizes, and P&L.

Portfolio rows keep the selected app currency as the primary current price. If `asset.nativeCurrency` differs, show a muted second line using `localPriceLabel()` / `formatNativePrice()` and the `/fx/rates` USD→native map (SGD/JPY/TWD/KRW supported). Do not store native current price on `Asset`; derive the display label from `currentPriceUsd × USD/native FX`.

### Formatted Amount Inputs

Use `FormattedNumberInput` for editable money/quantity/unit/NAV/capital/exposure fields. Renders `10000` as `10,000` while keeping state as the raw string (`"10000"`) so `parseFloat()` and API payloads stay safe. Don't use raw `type="number"` for finance amounts unless the field needs native min/max semantics (e.g. bounded percentages).

### Trades Review Lenses

`Trades.tsx` is one page with three lenses above the shared Trade Tape table:

- **Review** (default `/trades`): collapsed `TradeStatsCard`, collapsed `TickerPnLCard`, then the All/Open/Closed table.
- **Ticker Dossier** (`?ticker=SOL`): ticker-level P&L, win rate, average hold, largest win/loss, tags, recent closed trades, focused table. The ticker chip clears the query param.
- **Monthly Postmortem** (`?view=monthly`): selectable month summaries, repeatable-edge tags, loss review, open-trade watchlist.

Fetches all trades once via `useTrades()`, filtering table status locally so lens summaries survive tab switches. Keep demo `TradeAnalytics.bestTrade/worstTrade` in sync with seeded rows. Trade form defaults entry date to 5 days ago, exit to today. Trade Tape rows are clickable and keyboard-activatable (Enter/Space) to open a detail dialog; row action cells use `stopPropagation()`. Keep lens UI in `TradeLensViews.tsx`, pure aggregation in `tradeLensModels.ts`.

### Portfolio Hero Summary

Borderless hero (matching Dashboard's Net Worth pattern). Total Value at `text-3xl sm:text-4xl font-bold tracking-tight tabular-nums` with inline YTD P&L trend arrow. Secondary stats in `divide-x` grid (YTD Start, Exposure, Positions, YTD P&L) — 4 columns desktop, 2 mobile; all labels have `HelpTooltip`. Exposure = owned non-stable/non-cash value + local perp exposure ÷ total; custody excluded. `pb-6 mb-2 border-b` wrapper.

### Portfolio Section Headers

Two-level grouping: **Crypto/Equities/Cash** (primary, `Portfolio.tsx` via `CollapsibleCard`) → **CEX/Broker account/Bank/Onchain** (secondary, `PositionTable`). `CollapsibleCard` takes `icon` and `accentColor` props (blue Crypto, amber Equities, green Cash, purple Custody). Accent classes use full hairline borders + subtle background tints (e.g. `border-blue-500/40 bg-blue-500/5`), not colored side stripes.

### Custody Positions ("Held for Others")

Positions held for others (e.g. "bought BTC for Mum"). `Position.custodyOf String?` — `null`=owned, non-null=custody. Custody excluded from net worth, P&L, allocations, snapshots, exposure. Backend services filter `custodyOf: null`; Zod schema `z.string().nullable().optional()` (empty string → null). `Portfolio.tsx` splits owned vs custody (purple "Held for Others" `CollapsibleCard`, collapsed by default). `CustodyCheckbox.tsx` renders at the bottom of every form with a name dropdown (positions + localStorage `foliobuddy-custody-names` + "Add new person"); edit sends empty string to clear. Clipboard JSON includes `custodyOf` when set.

### Creatable Storage Location Dropdowns

CEX exchanges, onchain wallets, brokers, and banks use `CreatableSelect` (no generic "Others") with a "+ Add new ..." row and pencil/trash actions for custom options:

- Default options are protected (no edit/delete controls); only user-added localStorage options are manageable. Customs persist under `foliobuddy-storage-location-options`, bucketed by storage type (`CEX`, `WALLET`, `BROKERAGE`, `BANK`), merged with defaults via `positionOptions.ts`.
- Deleting an option only removes it from the dropdown; existing positions keep their value, and edit forms include the current value as a one-off option.
- Keep fixed domain selects fixed (Category, storage type, fiat currency, trade direction, theme) — only free-text location-style dropdowns are creatable.
- Radix Select can emit a trailing empty value after the create row closes — creatable `onValueChange` handlers must ignore empty values.
- Shared `SelectContent` sizes the popper viewport to its content (with max-height) and sits above dialogs (`z-[60]`); never force `h-[var(--radix-select-trigger-height)]` or share the dialog's `z-50`, or menus appear open but clipped.

### Cash Positions (Stablecoins + Fiat)

The former Stables category is labeled **Cash**. In `PositionForm.tsx`, Cash shows a **Type** dropdown: USDT, USDC, USDe, FDUSD, DAI, **Cash (fiat)**. Cash (fiat) reveals a **Currency** dropdown (`USD`, `SGD`, `GBP`, default USD) and creates/reuses a `CASH` asset with that symbol. SGD is priced from the current USD/SGD summary rate at creation; all fiat cash uses `priceProvider='manual'`. Portfolio rows show the symbol on top, subtitle simply `Cash` for all cash-equivalents.

Storage depends on Type: stablecoins → **CEX**/**Onchain**; Cash (fiat) → **Broker account**/**Bank**. Broker locations share the alphabetized `BROKER_LOCATIONS` defaults (`FSMOne`, `IBKR`, `Tiger`, `UOB KH` — never `DBS`); bank defaults: `Citi`, `DBS`, `SCB`, `Trust+`, `UOB`. `PositionForm` guards cash storage-type validity when Type changes, so Cash (fiat) can't keep a crypto-only location.

### Equity Positions (Stock/ETF + Unit Trust)

Two sub-types via UI toggle (enums unchanged):

- **Stock / ETF**: `equityMode='single'`, `asset.category='EQUITY'`, `priceProvider='yahoo'`. ETFs go here (live ticker prices), not Unit Trust.
- **Unit Trust**: `equityMode='fund'`, `asset.category='UNIT_TRUST'`, `priceProvider='manual'|'yahoo'`.

**Form:** Category = Crypto / Cash / Equities. Equities shows the toggle (create only; edit infers from category). Storage is a creatable broker dropdown; `storageType` stays `'BROKERAGE'`. Cost currency follows `asset.nativeCurrency` — SGD tickers (`.SI`) and SGD unit trusts show SGD inputs with a USD conversion note. Backend stores USD; FX from `portfolioSummary` (fallback 1.35). Edit converts stored USD → SGD via the `costInitialized` flag.

**Display:** Equities `PositionTable` defaults to `groupBy='broker'`; unit trusts show a `Unit Trust` badge there. Header segmented control switches to `groupBy='equityType'`; choice persists in localStorage (`foliobuddy-equity-group-by`). **NAV-age badge** under the symbol appears for unit trusts OR manual-priced non-cash positions; color via `priceAgeClass` (muted <7d, amber 7–30d, red ≥30d/null). Live tickers and fiat cash skip it.

**Statement upload:** Dashed card is a `<label>` wrapping the file input — click or drag-drop PDF both work (`utDragOver` highlights). Validates `application/pdf`/`.pdf`.

**Copy/Paste round-trip:** Clipboard includes `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets. Bulk import honors these only when creating a new Asset (defaults: `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`); existing symbols match by symbol first.

### Position Edit Modes

`PositionForm.tsx` edit mode has two tabs:

- `Edit Totals` for manual corrections to quantity/cost basis
- `Add/Reduce Position` for normal position changes without hand-editing aggregate totals

Rules:

- `Add` asks for additional quantity and additional total cost, then recomputes weighted average cost automatically
- `Reduce` asks for quantity only and removes cost basis at the current average cost, so average cost stays unchanged unless the position goes to zero
- Custody changes made from either edit tab must persist
- The confirmation preview uses an Old/New comparison table for quantity, avg cost, and total cost
- Both the preview and the submitted update go through the shared `applyPositionDelta()` helper (via `positionFormMath.ts`) — do not hand-roll cost-basis arithmetic in the form
- Keep add/reduce rendering in `PositionDeltaEditor.tsx`, pure math in `positionFormMath.ts`, and API submit/mutation logic in `PositionForm.tsx`.

### Position Add/Reduce History

Add/reduce edits are persisted as `PositionHistory` rows through `PUT /positions/:id` when the request includes `positionDelta`. Manual `Edit Totals` corrections must not create history rows. The backend validates the submitted next quantity/cost basis against the delta metadata before updating the position and writing history in one transaction. The line-item detail dialog fetches `GET /positions/:id/history` and shows a concise chronological ledger under the storage/notes summary: original entry first, then each add/reduce with amount + implied price on the left and the resulting quantity/average price on the right. `/dev/demo/portfolio` mirrors this with in-browser mock history so UI testing does not hit a real API.

### Dashboard Charts

- **Portfolio $ Value**: AreaChart (Recharts), gradient fill, period selector (7D/1M/3M/1Y/YTD/Max), reference line at starting value, end-of-line label. Loading uses `isFetching` to detect period-change refetches.
- **Max chart range**: `getDateRange('Max')` must send `all=true` to `/snapshots/performance`; an empty query falls back to the backend's 30-day default.
- **Portfolio % vs Benchmarks**: Normalized % vs default BTC/ETH/SPX plus custom benchmarks; each stores `provider` + `providerAssetId` (crypto → CoinGecko, TradFi/index → Yahoo). The SPX default uses Yahoo `SPY` (production Yahoo history is unreliable for `^GSPC`). Use `yahooFinance.chart()` first for Yahoo history (raw fetches fail on datacenter IPs). Baseline = price at first portfolio timestamp (not first provider price); binary search + dynamic threshold for timestamp matching. Portfolio line color = `PORTFOLIO_LINE_COLOR` from `chartColors.ts`, never inline hex.
- **Allocation donuts** (4 charts, `grid sm:grid-cols-2 lg:grid-cols-4` in `AllocationCharts.tsx`): **By Asset** (Crypto/Equities/Cash via `bucketFor()` → `categoryGroup()`); **By Detailed Asset** (default "All" shows crypto by symbol, Equities + Cash stay bundled wedges; inline category dropdown switches to symbol-level breakdown; sub-2% crypto slices group into "Other" once 2+ exist, `OTHER_THRESHOLD_PCT = 2`); **By Storage** (CEX/Broker account/Bank/Onchain/Onchain Ledger); **Cash Breakdown** (by stable/fiat symbol, renders only when cash positions exist).
- Custody filtered out before allocations (`positions.filter((p) => !p.custodyOf)`).
- Layout: legend right of donut at sm/md, below at lg+. Card titles show compact USD totals in parentheses (Cash Breakdown = total cash; the rest = total owned). Center label = top item's % + truncated name. Hover shows `name · $value · %` under the title; no Recharts Tooltip (overlaps legend). Colors from `lib/chartColors.ts`. Legend toggles keep 44px mobile hit areas.

### Dashboard Investor Default

The dashboard investor filter defaults to the primary owner investor (`isOwner = true`) rather than "all investors" when an owner record exists.

### Net Worth Card

Borderless hero with merged stats. Title shows investor label (`Net Worth (Nemo)`). Net worth at `text-4xl sm:text-5xl font-bold`. Desktop `grid-cols-6 divide-x` (YTD P&L, YTD Start, vs 30D, Exposure, Positions, Trades); mobile 2-col. All labels have `HelpTooltip`. Exposure = owned non-stable/non-cash + local perp exposure ÷ total. Key values use `useAnimatedNumber`.

### Performers Card

Borderless — plain `<div className="pb-4">` with `divide-y` list. Title icons `h-4 w-4` with `text-profit`/`text-loss opacity-70`; rank numbers `text-xs text-muted-foreground tabular-nums`. **Ranking** (backend `getTopPerformers`/`getWorstPerformers`): sorted by absolute `unrealizedPnL` in USD, not percent — surfaces the positions actually moving net worth.

### Page Entrance Animations

`animate-fade-in-up` (keyframe in `index.css`) only on page headers — no staggered section animations. 12px slide + fade, 450ms `cubic-bezier(0.16, 1, 0.3, 1)`. Respects `prefers-reduced-motion`.

### Settings & Investors Page Layouts

Settings: flat layout with `<h2>` headings + `<Separator>` between sections — no Card wrappers (utility pages stay visually lighter than data pages). Investors: summary stats in a flat inline row (`flex items-baseline gap-6 flex-wrap py-4 border-b`), matching the History page pattern.

### Consistent Page Headers

All pages MUST use the same header pattern:

- **Wrapper**: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- **Title**: `text-2xl font-bold` (no responsive upsizing); **Subtitle**: `text-sm text-muted-foreground`
- **Buttons**: `size="sm"` with `mr-1` icon spacing
- **Data pages with Add/Log actions**: use `PageActionHeader` so the action row sticks below the app shell (`top-14 sm:top-16`). Keep the sticky region to the title/actions row only.

### Destructive Actions in Headers

"Delete All" buttons MUST live inside the overflow `DropdownMenu` (⋮), never as standalone header buttons (Portfolio, Trades, History). Only non-destructive actions (Copy All, Add/Log) appear as visible header buttons.

### Design System & Visual Identity

- **Colors**: indigo-tinted neutrals — `--primary: 234 89% 55%` (light), `234 89% 62%` (dark, AA-safe). Profit/loss via `text-profit`/`text-loss`, backed by contrast-safe CSS vars (`--profit`/`--loss` + `-foreground`, `:root` and `.dark`); `--warning`/`--info` also available. Chart colors only from `chartColors.ts` constants — never inline hex.
- **Fonts**: Plus Jakarta Sans (body/headings) + JetBrains Mono (tabular numbers)
- **Skeleton loading**: `.skeleton` CSS shimmer, used on all pages and charts
- **HelpTooltip**: `?` tooltips on finance terms. Controlled open state, tap-to-toggle for touch; `stopPropagation` on pointer events so taps don't toggle `CollapsibleCard`.
- **Sidebar**: Linear-style active state — `border border-primary/30 bg-primary/10 text-primary font-semibold`, no side stripe. Desktop collapses to a persisted 72px icon rail (`foliobuddy-sidebar-collapsed`); mobile stays a full-width drawer.
- **Scrollbars**: thin 6px, transparent track, rounded thumb. **Empty states**: icon + heading + description + action CTA.
- **Design context**: `PRODUCT.md` at project root. Legacy `.impeccable.md` was migrated — do not recreate or maintain both files.

## Environment Variables

### Backend (`.env`)

```
DATABASE_URL=              # Local: postgresql://dev:dev@localhost:5433/example_portfolio_db
PRODUCTION_DATABASE_URL=   # Optional private DB mirror source; never commit a real value
PORT=4001                  # Backend port (DO NOT use 3001 — reserved for other projects)
CLERK_SECRET_KEY=          # Clerk backend key
ADMIN_USER_IDS=            # Comma-separated Clerk user IDs allowed to edit/delete global Asset catalog records
ALLOWED_ORIGINS=http://localhost:4000
RATE_LIMIT_MAX=10000       # Local dev override (production defaults to 200)
SENTRY_DSN=                # Optional — error tracking (skipped if empty)
```

Production boot logs warn when `ADMIN_USER_IDS` is empty because global Asset catalog edit/delete routes will otherwise return 403 for every user.

### Frontend (`.env`)

```
VITE_API_URL=http://localhost:4001/api/v1    # Backend API URL (or prod URL for frontend-only dev)
VITE_WS_BACKEND_URL=http://localhost:4001    # WebSocket URL
VITE_CLERK_PUBLISHABLE_KEY=                  # Clerk frontend key
```

### Frontend-Only Development / UI Testing

For layout and interaction work without Docker, a backend, or real auth, use the dev demo route: run `npm run dev --workspace=@foliobuddy/frontend`, open `http://localhost:4000/dev/demo` (`/dev/demo/portfolio` for position form and edit-flow testing). Dev-mode only, mocked `/api` responses. If you must point `VITE_API_URL` at a live backend, use one you control; keep production-origin allowlist notes in private ops docs.

## Deployment

- **Backend**: Node API host — `https://api.foliobuddy.xyz`. **Frontend**: static host — `https://foliobuddy.xyz` (rewrites API calls to backend). **Database**: PostgreSQL on a private network.
- **Auto-deploy**: Backend via GitHub Actions on push to main (backend files); frontend via Vercel.
- **DB Backups**: automated daily/weekly/monthly to private object storage.
- **Uptime monitoring**: `.github/workflows/uptime.yml` hits `https://foliobuddy.xyz/api/v1/health/db` every 10 min; non-200 fails the job and GitHub emails the repo owner.
- **Public deployment docs**: `DEPLOYMENT.md` lists variable names and deployment shape. Keep real host details, dashboard URLs, project IDs, and secrets in private ops notes.
- **Env var writes**: pipe values through `printf` (not `echo`) for `vercel env add` — `echo` appends `\n`, which breaks URL construction while still passing `if (value)` guards.

### Copy/Paste JSON Import Pattern

All data tables (Portfolio, Trades, History) share the same pattern: per-row clipboard icon (single item as JSON), Copy All header button (JSON array), Import tab in the Add/Log dialog (paste JSON), one unified JSON format for both copy and import.

### Trade Form Editing

`TradeForm` accepts an optional `trade` prop — pass it for edit mode, omit for create.

## Local Database Setup

Prereq: Docker Desktop. Add `PRODUCTION_DATABASE_URL` to `packages/backend/.env`; `DATABASE_URL` defaults to `postgresql://dev:dev@localhost:5433/example_portfolio_db`.

```bash
npm run db:local       # Start local Postgres (port 5433)
npm run db:sync        # Pull fresh production data → local
npm run dev            # Start dev servers
```

Local backend connects to local Postgres; production is untouched. Re-run `db:sync` anytime.

### Branding

- **App name**: FolioBuddy. **Logo**: growth-chart SVG (`public/logo.svg`, indigo→purple gradient); sidebar icon uses inline SVG with `bg-primary` for theme adaptivity.
- **Package scope**: `@foliobuddy/*` (root: `foliobuddy`); GitHub repo: `n3moxyz/foliobuddy`.
- Local DB name: `example_portfolio_db`. Production storage/bucket names live in private ops notes.

### Clickable Snapshot Rows

History page snapshot rows (AUTOMATIC source) are clickable anywhere to expand/collapse positions — not just the chevron. Action buttons use `stopPropagation` to avoid triggering the row toggle.

## Design Context

See `PRODUCT.md` at project root — source of truth for users, brand personality, aesthetic direction, and design principles. Dark mode primary; Linear/Raycast polish crossed with Dune data-density. If an old tool asks for `.impeccable.md`, point it at `PRODUCT.md`.

## Gotchas & Notes

- `.env.local` overrides `.env` in Vite — if you see wrong ports or "DB Down", check `.env.local` first
- Always define `onDelete: Cascade` in Prisma relations to avoid FK errors
- FX rates need fallback values for when the API is slow
- Snapshots use unique constraint + check-before-create to prevent duplicates
- Position P&L should display as percentage for clarity
- Bulk import endpoints skip price fetching (`skipPriceFetch: true`) to avoid rate limiting — the scheduler updates prices within 1 minute
- Backend `LOG_LEVEL` controls logging verbosity (default: `info` in prod, `debug` in dev)
- GitHub Actions CI runs type checking, the full test suite, the frontend build, and `npm run format:check` (formatting + shell script syntax + domain constant parity) on push/PR
- Sentry backend captures only unexpected 500-level errors (Zod 400s and AppErrors < 500 are skipped)
- `console.error` crashes when inspecting ZodError objects in Node — integration tests must mock the logger
- vitest `exclude: ['dist/**']` prevents duplicate test runs after `npm run build`
- If a protected route mutates by `id` only, treat it as a security bug — all writes for positions/trades/investors must be ownership-scoped
- Do not gate the dev demo route with extra env flags; `import.meta.env.DEV` is the safe default because it cannot be enabled in production accidentally
- `VITE_WS_BACKEND_URL` must be set in Vercel env vars for production WebSocket (warns + disables if missing)
- When deploying: backend must deploy before frontend when API versioning paths change (frontend uses `/api/v1`)
- Workspace-package imports (`@foliobuddy/shared`, etc.) MUST be declared in the consumer's `package.json` — local install hoisting masks the missing dep but Vercel's `npm ci` rejects it. CI guards via `npm ls --workspaces --depth=0`.
- Backend Dockerfile is package-isolated, so `@foliobuddy/shared` is not resolvable at runtime. `src/lib/constants.ts` and `src/lib/domain.ts` intentionally duplicate shared enums/helpers — `npm run domain:check` enforces parity.
- `VITE_API_URL` in Vercel must be the full resolved path (`/api/v1`), not `/api` — a stale value silently broke prod. Verify with `curl https://foliobuddy.xyz/api/v1/health/db` after any change.
