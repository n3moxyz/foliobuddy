# CLAUDE.md

> **Maintenance rules**:
>
> - **Self-update**: Update this file when patterns, key files, commands, gotchas, or env vars change.
> - **Sync with AGENTS.md**: Mirror changes to both files (only title + agent name differ).
> - **FORET.md**: After significant changes, update `FORET.md` with new features, bugs/fixes, lessons, and tech changes. Keep the conversational, teaching tone.

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions and net worth across crypto, equities, NFTs, and alternative investments. Multi-user support with investor stake tracking.

## Tech Stack

### Backend (`packages/backend/`)

- **Runtime**: Node.js + TypeScript (ES2022 modules)
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL (private production host, local via Docker)
- **ORM**: Prisma 5.10
- **Auth**: Clerk
- **Scheduling**: node-cron
- **Validation**: Zod

### Frontend (`packages/frontend/`)

- **Framework**: React 18 + TypeScript
- **Build**: Vite 5
- **Routing**: React Router v6
- **Server State**: TanStack React Query
- **Client State**: Zustand
- **UI**: shadcn/ui + Radix UI + Tailwind CSS 3.4
- **Charts**: Recharts
- **Fonts**: Plus Jakarta Sans (body) + JetBrains Mono (numbers) via Google Fonts
- **Design System**: `PRODUCT.md` at project root for impeccable design context

## Key Files

### Backend

- `src/index.ts` - Server entry point (rate limiting, logger, FX job init, API versioning with `/api/v1` prefix)
- `src/routes/` - API endpoints (positions, trades, investors, snapshots, etc.)
- `src/services/` - Business logic (portfolioService, priceService, snapshotService)
- `src/middleware/` - Auth and error handling
- `src/lib/` - Shared utilities (constants, logger, pagination, tradePnL, sentry, TTLCache)
- `src/lib/constants.ts` - Domain enums (AssetCategory, StorageType, TradeDirection, TradeStatus, SnapshotType, SnapshotSource)
- `src/lib/TTLCache.ts` - Generic TTL cache with LRU eviction (used by priceService)
- `src/__tests__/` - Unit + integration tests (vitest)
- `src/__tests__/routes/` - Route integration tests (supertest + mocked Prisma)
- `src/__tests__/helpers/` - Test utilities (createTestApp, fixtures)
- `prisma/schema.prisma` - Database schema

### Frontend

- `src/App.tsx` - Main app with routing
- `src/pages/` - Dashboard, Portfolio, Trades, Investors, Settings
- `src/components/` - Reusable UI components
- `src/hooks/` - React Query hooks (usePortfolio, useTrades, etc.) + `useAnimatedNumber` (rAF-based number ticker)
- `src/hooks/__tests__/` - Hook unit tests (vitest + React Testing Library)
- `src/lib/api.ts` - API client methods (305 lines, methods only)
- `src/lib/types.ts` - Frontend type definitions (347 lines, extracted from api.ts)
- `src/stores/` - Zustand stores
- `src/components/ui/skeleton.tsx` - Shimmer skeleton loading component (CSS-based animation)
- `src/components/ui/HelpTooltip.tsx` - Contextual ? icon tooltip for domain-specific terms
- `src/components/ui/creatable-select.tsx` - Reusable Radix Select wrapper with a "+ Add new ..." row and inline add controls
- `src/components/ui/formatted-number-input.tsx` - Reusable finance amount input that displays thousands separators while storing raw numeric strings
- `src/components/ui/formatted-number-input-utils.ts` - Pure sanitize/format helpers for formatted number inputs; kept separate so Fast Refresh treats the component file cleanly
- `src/components/layout/PageActionHeader.tsx` - Sticky page title/action header used by high-scroll data pages so Add/Log buttons remain reachable
- `src/components/trades/TradeLensViews.tsx` - Ticker and monthly trade review lens UI
- `src/components/trades/tradeLensModels.ts` - Pure aggregation helpers for ticker dossiers and monthly reviews
- `src/components/portfolio/positionClipboard.ts` - Shared portfolio copy-to-clipboard JSON formatter
- `src/components/portfolio/positionOptions.ts` - Shared storage location option lists (CEX, onchain, broker, bank) plus localStorage-backed custom option helpers used by position forms
- `src/lib/chartColors.ts` - Centralized theme-aware chart color constants backed by OKLCH CSS variables in `index.css`
- `src/lib/chartUtils.ts` - Time-period date helpers (`getDateRange`, `formatXAxisDate`, `formatTooltipDate`) shared between PortfolioChart and BenchmarkComparisonChart
- `react-doctor.config.json` - Root-level React Doctor triage policy. Keeps the scan focused on actionable regressions after known React 18/Radix/shadcn and design-opinion rules were reviewed.

### Shared

- `packages/shared/src/types.ts` - Cross-package type definitions, domain enums (`AssetCategory`, `StorageType`, `TradeStatus`, etc.), `categoryGroup()`, `USD_SGD_FALLBACK_RATE`, `MAX_POSITIONS_PER_CATEGORY`. Frontend is the only consumer at runtime — see Gotchas re: backend Docker isolation.

### E2E

- `playwright.config.ts` - Playwright configuration (Chromium only)
- `e2e/smoke.spec.ts` - Smoke tests (health, app load, auth redirect)

## First Run Setup

```bash
# 1. Install all dependencies (from root)
npm install

# 2. Setup Backend
cd packages/backend
cp .env.example .env
# Fill in .env: DATABASE_URL, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY, ALLOWED_ORIGINS

# 3. Setup Database
npx prisma migrate dev   # Creates tables

# 4. Setup Frontend
cd ../frontend
cp .env.example .env
# Fill in .env: VITE_API_URL, VITE_CLERK_PUBLISHABLE_KEY

# 5. Start both servers (in separate terminals)
# Terminal 1 (backend):
cd packages/backend && npm run dev

# Terminal 2 (frontend):
cd packages/frontend && npm run dev
```

## Commands

```bash
# Root (monorepo)
npm install              # Install all dependencies
npm run build            # Build/type-check all workspaces (backend, frontend, shared)
npm run format           # Format all files with Prettier
npm run format:check     # Check formatting + shell script syntax without writing
npm run scripts:check    # Syntax-check root shell scripts with bash -n when Bash is available; skips cleanly on Windows without WSL

# Local Database
npm run db:local         # Start local Postgres (Docker, port 5433)
npm run db:local:stop    # Stop local Postgres
npm run db:sync          # Pull production data → local DB

# Database Backups (run on DO droplet, not locally)
# ./scripts/backup-db.sh daily|weekly|monthly  — dump, compress, upload to DO Spaces
# ./scripts/restore-db.sh                      — list available backups
# ./scripts/restore-db.sh <path>               — restore a specific backup

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

# Frontend demo route (dev-only, uses mocked API responses)
# Visit http://localhost:4000/dev/demo while Vite dev server is running
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

Captures portfolio state at points in time for performance tracking. Calculates daily/weekly/monthly/YTD returns and benchmark outperformance vs BTC/ETH. All return fields stored as `percent × 100` (e.g. `12` = 12%, not `0.12`). YTD anchor = first snapshot of the _current calendar year_, scoped via `timestamp >= Jan 1 UTC` in `portfolioService.getSummary()` — not `findFirst orderBy:asc` without a date filter, which would pin YTD to a stale pre-year snapshot in future calendar years.

### Snapshot Backfill Script

`packages/backend/scripts/backfill-equity-snapshots.ts` — one-shot for retroactively inserting positions into historical snapshots when a long-held position is entered mid-year. Read the script header for usage flags (`--dry`/`--apply`/`--rollback`), the ephemeral `BACKFILLS` array semantics (additive deltas, not states), and Yahoo-fallback interpolation.

### Yahoo Search IP-Filter Workaround

Yahoo's `/v1/finance/search` geolocates by caller IP and region-filters results even with `region=US`. Our Singapore droplet returned only cross-listings (e.g. `EWY.SN`) for US ETFs. `YahooFinanceProvider.search()` falls back to the IP-neutral `/v7/finance/quote` when the query matches `/^[A-Z0-9.-]{1,10}$/` and search returned no exact-symbol match.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` extracts text via `pdf-parse` and walks broker-specific parsers in `packages/backend/src/services/statementParsers/` until one succeeds. PDF text collapses table columns to a flat token stream, so each parser finds a deterministic anchor (ISIN regex or value-block regex) and reads fixed fields after it.

Supported: **UOB Kay Hian** (`uobKayHian.ts`, ISIN-anchored, enables Yahoo lookup) and **FSMOne / iFAST** (`fsmOne.ts`, value-block-anchored, no ISIN — manual Yahoo wiring).

Adding a broker: new file alongside, append to `parsers` array in `routes/assets.ts`, update supported-formats error string, and add a broker→`storageLocation` branch in `PositionForm.tsx:applyParsedHolding`.

### CoinGecko Rate Limiting

Queue-based requests with 2.1s delays between calls. 30-second in-memory cache. Batch requests up to 50 coins.

### TTLCache

`TTLCache` uses `Map` insertion order for LRU eviction. Eviction must check the iterator result's `done` flag, not whether the key value is `undefined`, because `Map` permits `undefined` as a real key. Keep `TTLCache.test.ts` coverage for normal LRU eviction and the `undefined` oldest-key case.

### React Query + Zustand Split

- React Query: Server state (positions, trades, snapshots). No global `refetchInterval`; global `refetchOnWindowFocus` stays `false` to avoid surprise refetches. Money-sensitive portfolio queries in `usePortfolio.ts` opt into `refetchOnWindowFocus` + `refetchOnReconnect` so stale dashboard/portfolio figures refresh when Chrome regains focus, in addition to mount, manual invalidation, and WebSocket updates.
- Zustand: Client state (currency preference)

### Structured Logging

All backend code uses `logger` from `src/lib/logger.ts` instead of `console.log`. Respects `LOG_LEVEL` env var (debug/info/warn/error), and invalid values fall back to `info` so a typo does not suppress warn/error output. No `console.log` in production code.

### Rate Limiting

Express-rate-limit applied globally to `/api` routes. Default: 200 requests per 15 minutes. Override with `RATE_LIMIT_MAX` env var (local dev uses 10000). Constants in `src/lib/constants.ts`.

### Request Payload Limit

Express JSON payload cap is **1mb** (`MAX_PAYLOAD_SIZE` in `src/lib/constants.ts`). Chosen tight for security — bulk imports of positions/trades/snapshots are well under this. If a legitimate import ever 413s, bump the constant rather than widening globally.

### Pagination (Backend)

Trades and snapshots routes support optional pagination via `?page=1&limit=50`. Backwards-compatible — returns full array when no `page` param. Uses `parsePagination()` and `paginatedResponse()` from `src/lib/pagination.ts`.

### Lazy-Loaded Routes

All pages including Dashboard are lazy-loaded with `React.lazy()` + `Suspense`. Vite `manualChunks` splits heavy vendors (recharts, socket.io-client, @sentry/react, @clerk/clerk-react) into separate chunks for parallel loading.

### Dev Demo Route

`src/dev/demoMode.tsx` provides a local-only `/dev/demo` route for UI testing without Clerk sign-in or backend access. Important constraints:

- It must stay **dev-only**. `App.tsx` lazy-loads it only when `import.meta.env.DEV` is true so the mock payload does not ship in production bundles.
- It mocks `/api/*` and `/api/v1/*` in the browser and restores the original `fetch` + token getter on unmount. Do not leave global network monkey-patches installed after navigating away.
- It renders child routes only after the browser fetch mock is installed. If portfolio/dashboard queries run before the mock is ready, React Query caches empty real-backend responses and demo mode appears blank. `DemoPages` installs the mock in `useLayoutEffect`, then flips readiness on a short timer to satisfy React's `set-state-in-effect` lint while preserving the ordering.
- It now supports stateful in-browser portfolio CRUD for testing. Use `/dev/demo/portfolio` to validate add, edit, delete, and import UX without touching the real backend. The state resets on full refresh.
- Demo seed data intentionally includes crypto, equities, unit trust, stablecoins, USD/SGD cash, NFT/angel-style alternatives, multiple storage types, and custody positions so Dashboard allocation charts and Portfolio grouping exercise all buckets. Keep each seeded `Position.assetId` and embedded `Position.asset` in sync; use the local `demoAsset(id)` helper instead of array indexes. The 4th Dashboard allocation chart appears only when stable/cash positions exist.
- Demo performance history must honor `/snapshots/performance` query params (`days`, `from`, `to`, `all=true`) so range selector testing is meaningful. `Max` should visibly include older pre-1Y points.
- Use it for responsive/UI checks and demo-mode interaction testing only. It must never point at production write APIs.

### React Doctor Quality Scan

React Doctor can be used as an advisory frontend audit for React accessibility, correctness, state/effect, dead-code, and performance findings. Run the pinned, offline command from the repo root: `npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none`. Treat results as triage input, not an automatic refactor plan: fix high-signal user-facing items first (ARIA relationships, keyboard access, render correctness), and be skeptical of noisy rules like React 19 `forwardRef` warnings while the app is still on React 18.

The root `react-doctor.config.json` intentionally suppresses reviewed scanner noise: React 19 migration advice that conflicts with the current React 18 + shadcn/Radix stack, broad design-opinion checks that do not match FolioBuddy's established UI rules, and large architectural refactor nudges that would be risky without a feature reason. Do not add suppressions for new accessibility, keyboard, ownership, render-correctness, or data-integrity findings without documenting why they are false positives.

Known advisory: React Doctor may flag `apiMockReady` in `src/dev/demoMode.tsx` as "updated but never read". It is read to gate rendering until the browser fetch mock is installed, and readiness is intentionally delayed until after mock installation, so this is a false positive unless the demo boot flow changes.

### Ownership Checks on Mutations

For protected backend resources, update/delete routes must filter by both `id` and `req.userId!`, not just `id`. Reads already did this in many places; writes now need to follow the same rule consistently to prevent cross-user mutation if an ID is guessed.

### WebSocket CORS

Socket.io origin validation should use exact origin matching (`origin === allowed`) just like the Express CORS middleware. Never use prefix matching for trusted origins.

### Optimistic Deletes

Delete mutations in `usePortfolio`, `useTrades`, `useSnapshots` use optimistic updates with rollback on error.

### Responsive Mobile Design

All pages follow iOS HIG-inspired responsive patterns:

- **Column toggle**: Portfolio and Trades tables have a mobile-only "All columns" / "Compact" toggle. Compact hides secondary columns (`hidden md:table-cell`), expanded shows all with horizontal scroll (`overflow-x-auto` + `min-w-[700px]`).
- **Touch targets**: Shared `Button` sizes provide 44px hit areas on mobile (`default`, `sm`, and `icon`) and compact back down at `sm+`/`md+` where density matters. Dense row actions must include `shrink-0` so flex/table cells do not squeeze 44px mobile buttons narrower. Sortable table headers, allocation legends, and `HelpTooltip` also need 44px mobile hit areas even when the visible icon/text stays small.
- **Responsive headers**: Page headers stack vertically on mobile (`flex-col gap-3 sm:flex-row`). Secondary actions move to `DropdownMenu` overflow menus.
- **Dialog safety**: Dialogs use `w-[calc(100%-2rem)]` for viewport margins and `max-h-[85vh] overflow-y-auto` for scroll.

### Smart Price Formatting

`formatPrice()` in `lib/utils.ts` — use instead of `formatCurrency(..., 0)` for per-unit prices (entry/exit, current price). Picks decimal places by magnitude:

| Price Range | Decimals | Example         |
| ----------- | -------- | --------------- |
| < $0.01     | 5        | $0.00842        |
| < $0.10     | 4        | $0.0812         |
| < $10       | 3        | $0.780, $1.480  |
| < $1,000    | 2        | $32.15, $113.40 |
| >= $1,000   | 0        | $67,200         |

Use `formatCurrency` (with explicit decimals or compact mode) for totals, sizes, and P&L — those don't need magnitude-aware decimals.

### Formatted Amount Inputs

Use `FormattedNumberInput` for editable money, quantity, unit, NAV, capital, and exposure amount fields. It renders `10000` as `10,000` while keeping component state as the raw string (`"10000"`) so existing `parseFloat()` calculations and API payloads stay safe. Do not use raw `type="number"` for finance amount entry unless the field needs native min/max semantics like bounded percentages.

### Trades Review Lenses

`Trades.tsx` is organized as one page with three lenses above the shared Trade Tape table:

- **Review** (default `/trades`) preserves the original Trades page: collapsed `TradeStatsCard`, collapsed `TickerPnLCard`, then the All/Open/Closed table.
- **Ticker Dossier** (`?ticker=SOL`) opens when a ticker is selected from the Ticker tab or P&L by Ticker card. It shows ticker-level P&L, win rate, average hold, largest win/loss, tags, recent closed trades, and a focused All/Open/Closed table. The ticker chip clears the query param.
- **Monthly Postmortem** (`?view=monthly`) shows selectable month summaries, repeatable-edge tags, loss review, and open-trade watchlist.

The page fetches all trades once via `useTrades()` and filters table status locally so the lens summaries do not disappear when the user switches All/Open/Closed tabs. Keep demo `TradeAnalytics.bestTrade/worstTrade` in sync with the seeded trade rows because `TradeStatsCard` still renders those backend/mock callouts. Trade form defaults entry date to 5 days ago and exit date to today (optimized for logging closed trades).

Trade Tape rows are clickable and keyboard-activatable (Enter/Space) to open a compact trade detail dialog, matching the Portfolio row detail pattern. Keep row action cells isolated with `stopPropagation()` so Copy/Edit/Delete do not also open the detail card.

Keep lens UI in `components/trades/TradeLensViews.tsx` and pure aggregation in `components/trades/tradeLensModels.ts`. This preserves Fast Refresh/lint cleanliness and keeps `Trades.tsx` focused on routing, query params, dialogs, and the shared Trade Tape table.

### Portfolio Hero Summary

Borderless hero section (matching Dashboard's Net Worth pattern). Total Value at `text-3xl sm:text-4xl font-bold tracking-tight tabular-nums` with inline YTD P&L trend arrow. Secondary stats in `divide-x` grid (YTD Start, Exposure, Positions, YTD P&L) — 4 columns on desktop, 2-column grid on mobile. All labels have `HelpTooltip`. Exposure means owned market-risk value divided by total portfolio value: all non-stable/non-cash assets (crypto, equities, unit trusts, alternatives) plus local perp exposure; custody remains excluded. Uses `pb-6 mb-2 border-b` wrapper.

### Portfolio Section Headers

Positions are grouped two-level: **Crypto/Equities/Cash** (primary, in `Portfolio.tsx` via `CollapsibleCard`) → **CEX/Broker account/Bank/Onchain** (secondary, in `PositionTable`). `CollapsibleCard` accepts `icon` and `accentColor` props for visual differentiation (blue for Crypto, amber for Equities, green for Cash, purple for Custody). Accent classes must use full hairline borders plus subtle background tints (for example `border-blue-500/40 bg-blue-500/5`), not colored side stripes.

### Custody Positions ("Held for Others")

Positions held for others (e.g. "bought BTC for Mum"). `Position.custodyOf String?` — `null`=owned, non-null=custody. Custody excluded from net worth, P&L, allocations, snapshots, exposure. Backend services filter `custodyOf: null`; Zod schema is `z.string().nullable().optional()` (empty string → null).

Frontend: `Portfolio.tsx` splits owned vs custody (purple "Held for Others" `CollapsibleCard`, collapsed by default). `CustodyCheckbox.tsx` renders at the bottom of every form, with name dropdown (positions + localStorage `foliobuddy-custody-names` + "Add new person"). Edit sends empty string to clear. Clipboard JSON includes `custodyOf` when set.

### Creatable Storage Location Dropdowns

Storage location dropdowns no longer use a generic "Others" option. CEX exchanges, onchain wallets, brokers, and banks use `CreatableSelect` with a "+ Add new ..." row plus row-level pencil/trash actions for renaming or deleting custom saved options. Default options are protected and must not show edit/delete controls; only user-added localStorage options are manageable. Added options persist in localStorage under `foliobuddy-storage-location-options`, bucketed by storage type (`CEX`, `WALLET`, `BROKERAGE`, `BANK`), and are merged with defaults via `positionOptions.ts`. Deleting an option only removes it from the dropdown; existing positions using that storage location stay unchanged and edit forms include the current value as a one-off option. Keep fixed domain selects fixed (Category, storage type, fiat currency, trade direction, theme); only free-text location-style dropdowns should be creatable. Radix Select can emit a trailing empty value after the create row closes, so creatable dropdown `onValueChange` handlers must ignore empty values.

Shared `SelectContent` should let the popper viewport size to its option content (with max-height handling) and sit above dialog content (`z-[60]`), not force `h-[var(--radix-select-trigger-height)]` or share the dialog's `z-50`; otherwise dropdown menus can appear open but visually clipped behind following form fields.

### Cash Positions (Stablecoins + Fiat)

The former Stables add-position category is labeled **Cash**. In `PositionForm.tsx`, Cash shows a **Type** dropdown with USDT, USDC, USDe, FDUSD, DAI, and **Cash (fiat)**. Cash (fiat) reveals a **Currency** dropdown (`USD`, `SGD`, `GBP`) that defaults to USD and creates/reuses a `CASH` asset with that currency symbol. SGD is priced from the current USD/SGD summary rate at creation; USD and GBP use simple manual prices for now. All fiat cash assets use `priceProvider='manual'`. Portfolio rows show the asset symbol on top and the subtitle simply as `Cash` for all cash-equivalent assets (not `Cash USD` / `Cash SGD` or long stablecoin names).

Cash storage depends on Type: stablecoins use **CEX** / **Onchain**; Cash (fiat) uses **Broker account** / **Bank**. Broker account locations use the same alphabetized `BROKER_LOCATIONS` defaults as the Equities broker dropdown in `positionOptions.ts` (`FSMOne`, `IBKR`, `Tiger`, `UOB KH`) and never include `DBS`; bank defaults are `Citi`, `DBS`, `SCB`, `Trust+`, `UOB`. Users can persist new broker/bank/exchange/wallet options from the dropdown itself, but default options stay protected. `PositionForm` also guards cash storage type validity when the Type changes, so switching to Cash (fiat) cannot leave the location dropdown on crypto-only wallet/exchange options.

### Equity Positions (Stock/ETF + Unit Trust)

Two sub-types via UI toggle (enums unchanged):

- **Stock / ETF**: `equityMode='single'`, `asset.category='EQUITY'`, `priceProvider='yahoo'`. ETFs go here, not Unit Trust — they have live ticker prices.
- **Unit Trust**: `equityMode='fund'`, `asset.category='UNIT_TRUST'`, `priceProvider='manual'|'yahoo'`.

**Form:** Category = Crypto / Cash / Equities. Equities shows Stock/ETF vs Unit Trust toggle (create only; edit infers from category). Storage replaced with creatable broker dropdown (`BROKER_LOCATIONS` defaults + localStorage custom options); `storageType` stays `'BROKERAGE'`. Cost currency follows `asset.nativeCurrency` — SGD tickers (`.SI`) and SGD unit trusts show SGD inputs with USD conversion note. Backend stores USD; FX from `portfolioSummary` (fallback 1.35). Edit converts stored USD → SGD via `costInitialized` flag.

**Display:** The Equities `PositionTable` defaults to `groupBy='broker'`, so Stock/ETF and Unit Trust holdings appear under their storage broker/fund platform (Interactive Brokers, Tiger, FSMOne, UOB KH, etc.). Unit trusts show a small `Unit Trust` badge in broker view; the header segmented control can switch to `groupBy='equityType'` for the older Stock/ETF vs Unit Trust split, and the chosen view persists in localStorage under `foliobuddy-equity-group-by`. **NAV-age badge** under symbol still appears for unit trusts OR manual-priced non-cash positions; color via `priceAgeClass` (muted <7d, amber 7–30d, red ≥30d/null). Live tickers and fiat cash skip the NAV-age badge.

**Statement upload:** Dashed card is a `<label>` wrapping the file input — click or drag-drop PDF works (`utDragOver` highlights). Validates `application/pdf`/`.pdf`.

**Copy/Paste round-trip:** Clipboard includes `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets. Bulk import honors these only when creating a new Asset (defaults: `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`); existing symbols match by symbol first.

### Position Edit Modes

`PositionForm.tsx` edit mode now has two distinct tabs:

- `Edit Totals` for manual corrections to quantity/cost basis
- `Add/Reduce Position` for normal position changes without hand-editing aggregate totals

Rules:

- `Add` asks for additional quantity and additional total cost, then recomputes weighted average cost automatically
- `Reduce` asks for quantity only and removes cost basis using the current average cost, so average cost stays unchanged unless the position goes to zero
- Custody changes made from either edit tab must persist
- The confirmation preview uses an Old/New comparison table for quantity, avg cost, and total cost

### Dashboard Charts

- **Portfolio $ Value**: AreaChart (Recharts), gradient fill, time period selector (7D/1M/3M/1Y/YTD/Max), reference line at starting value, end-of-line label. Loading state uses `isFetching` to detect period-change refetches.
- **Max chart range**: `getDateRange('Max')` must send `all=true` to `/snapshots/performance`; an empty query falls back to the backend's default 30-day window.
- **Portfolio % vs Benchmarks**: Normalized % vs default BTC/ETH/SPX benchmarks plus provider-aware custom benchmarks. Benchmarks store `provider` + `providerAssetId` so crypto can use CoinGecko and TradFi/index benchmarks can use Yahoo. The displayed SPX default uses Yahoo `SPY` as its provider series because production Yahoo history intermittently returns empty/error responses for index symbol `^GSPC`; normalized % makes SPY the durable S&P 500 proxy. SPY/QQQ remain ETF examples. Yahoo historical benchmark data should use `yahooFinance.chart()` first because raw Yahoo chart fetches can fail on production datacenter IPs. Benchmark baseline = price at first portfolio timestamp (not first provider price). Binary search + dynamic threshold for timestamp matching. Portfolio line color comes from `PORTFOLIO_LINE_COLOR` in `chartColors.ts`, not an inline hex or primary/indigo token.
- **Allocation donuts** (4 charts, `grid sm:grid-cols-2 lg:grid-cols-4` in `AllocationCharts.tsx`):
  - **By Asset**: Crypto / Equities / Cash buckets via `bucketFor()` → `categoryGroup()`.
  - **By Detailed Asset**: default "All" view shows crypto by symbol while Equities and Cash each remain bundled wedges (protected from rollup). The card has an inline category dropdown matching Add Position's category labels (`All`, `Crypto`, `Cash`, `Equities`); selecting a category switches to that category's symbol-level breakdown and total. Crypto/all views group sub-2% crypto slices into "Other" once 2+ exist (`OTHER_THRESHOLD_PCT = 2`).
  - **By Storage**: CEX / Broker account / Bank / Onchain / Onchain Ledger.
  - **Cash Breakdown**: by stable/fiat symbol; only renders when cash positions exist.
- Custody filtered out before allocations (`positions.filter((p) => !p.custodyOf)`).
- Layout: legend right of donut at sm/md; below at lg+ (`flex-col sm:flex-row lg:flex-col`). Card titles show compact USD totals in parentheses; By Asset / By Detailed Asset / By Storage use total owned portfolio value, Cash Breakdown uses total cash value. Center label = top item's % + truncated name (>8 chars). Hover shows `name · $value · %` under card title; no Recharts Tooltip (overlaps legend). Colors from `lib/chartColors.ts`. Legend toggle buttons are real controls, so keep their mobile hit area at 44px even though the visual row stays compact.

### Dashboard Investor Default

The dashboard investor filter should default to the primary owner investor (`isOwner = true`) rather than "all investors" when an owner record exists.

### Net Worth Card

Borderless hero with merged stats. Title shows investor label (`Net Worth (Nemo)`). Net worth at `text-4xl sm:text-5xl font-bold`. Desktop: `grid-cols-6 divide-x` (YTD P&L, YTD Start, vs 30D, Exposure, Positions, Trades); mobile: 2-col. All labels have `HelpTooltip`. Exposure = owned non-stable/non-cash + local perp exposure ÷ total. Key numeric values use `useAnimatedNumber` for smooth transitions.

### Performers Card

Borderless layout (no Card wrapper) — plain `<div className="pb-4">` with `divide-y` list. Title uses small icons (`h-4 w-4`) with `text-profit`/`text-loss opacity-70`. Rank numbers in subtle `text-xs text-muted-foreground tabular-nums`.

**Ranking** (backend `portfolioService.getTopPerformers` / `getWorstPerformers`): sorted by absolute `unrealizedPnL` in USD, not `unrealizedPnLPct`. Top = desc (largest $ gain first), Worst = asc (largest $ loss first). This surfaces the positions actually moving net worth — a small new position up 200% shouldn't outrank a core holding up $60K but only 16%.

### Page Entrance Animations

`animate-fade-in-up` (CSS keyframe in `index.css`) used sparingly — only on page headers. Dashboard and utility pages (Settings, Investors) have no staggered section animations. 12px upward slide + opacity fade, 450ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Respects `prefers-reduced-motion`.

### Settings Page Layout

Flat layout with `<h2>` headings + `<Separator>` between sections — no Card wrappers. This keeps utility pages visually lighter than data pages.

### Investors Page Layout

Summary stats use a flat inline row (`flex items-baseline gap-6 flex-wrap py-4 border-b`) instead of individual Cards. Matches the History page's stat pattern.

### Consistent Page Headers

All pages MUST use the same header pattern for visual consistency when switching tabs:

- **Wrapper**: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- **Title**: `text-2xl font-bold` (no responsive upsizing like `sm:text-3xl`)
- **Subtitle**: `text-sm text-muted-foreground` (no `sm:text-base`)
- **Buttons**: `size="sm"` with `mr-1` icon spacing
- **Data pages with Add/Log actions**: use `PageActionHeader` so the action row sticks below the app shell (`top-14 sm:top-16`) while scrolling. Keep the sticky region to the title/actions row, not the full stats/summary block.

### Destructive Actions in Headers

"Delete All" buttons MUST live inside the overflow `DropdownMenu` (⋮), never as standalone header buttons. This applies to Portfolio, Trades, and History. Only non-destructive actions (Copy All, Add/Log primary action) appear as visible header buttons. This prevents accidental destructive clicks and reduces visual noise.

### Design System & Visual Identity

- **Color palette**: Indigo-tinted neutrals (not stock shadcn/ui grays) — `--primary: 234 89% 55%` (light), `234 89% 62%` (dark, AA-safe with `--primary-foreground`)
- **Fonts**: Plus Jakarta Sans (body/headings) + JetBrains Mono (tabular numbers) — loaded via Google Fonts in `index.html`
- **Profit/loss colors**: Emerald green (`text-profit`) and red (`text-loss`) — backed by contrast-safe CSS custom properties `--profit`/`--profit-foreground` and `--loss`/`--loss-foreground` in `index.css` (both `:root` and `.dark`). Also `--warning` and `--info` tokens available
- **Chart colors**: Centralized in `src/lib/chartColors.ts` — `BRAND_COLORS` (BTC/ETH), `BRAND_FOREGROUND_COLORS`, `PORTFOLIO_LINE_COLOR`, `PORTFOLIO_FOREGROUND_COLOR`, `ASSET_COLORS`, `STORAGE_COLORS`, `STABLES_COLORS`, and benchmark palettes. These are OKLCH CSS-variable colors (`oklch(var(--chart-...))`), so use constants instead of inline hex in chart components.
- **Skeleton loading**: CSS shimmer animation via `.skeleton` class — used on all pages and chart components
- **HelpTooltip**: `?` icon tooltips on domain-specific finance terms (YTD Start, Exposure, CEX, Onchain, etc.). Controlled open state with tap-to-toggle for touch devices. `stopPropagation` on pointer events prevents CollapsibleCard toggle when tapping help icons.
- **Sidebar**: Linear-style active state — `border border-primary/30 bg-primary/10 text-primary font-semibold` with no side-stripe accent. Desktop sidebar can collapse to a persisted 72px icon rail (`foliobuddy-sidebar-collapsed` in localStorage); mobile remains a full-width drawer with labels.
- **Scrollbars**: Thin 6px with transparent track, rounded thumb
- **Empty states**: Icon + heading + descriptive text + action CTA (Portfolio, Trades, History)
- **Design context**: `PRODUCT.md` at project root — brand personality, aesthetic direction, design principles. Current `impeccable` uses `PRODUCT.md` for strategic context and optional `DESIGN.md` for visual-system details; legacy `.impeccable.md` was auto-migrated, so do not recreate or maintain both files.

## Environment Variables

### Backend (`.env`)

```
DATABASE_URL=              # Local: postgresql://dev:dev@localhost:5433/example_portfolio_db
PRODUCTION_DATABASE_URL=   # Optional private DB mirror source; never commit a real value
PORT=4001                  # Backend port (DO NOT use 3001 — that's reserved for other projects)
CLERK_SECRET_KEY=          # Clerk backend key
ALLOWED_ORIGINS=http://localhost:4000
RATE_LIMIT_MAX=10000       # Local dev override (production defaults to 200)
SENTRY_DSN=                # Optional — error tracking (skipped if empty)
```

### Frontend (`.env`)

```
VITE_API_URL=http://localhost:4001/api/v1    # Backend API URL (or prod URL for frontend-only dev)
VITE_WS_BACKEND_URL=http://localhost:4001 # WebSocket URL
VITE_CLERK_PUBLISHABLE_KEY=              # Clerk frontend key
```

### Frontend-Only Development (No Docker)

For layout and interaction work without running Docker or a backend, use the dev demo route below. If you need to point `VITE_API_URL` at a live backend, use one you control and keep any production-origin allowlist notes in private ops docs.

### Local Authenticated UI Testing

For frontend-only layout verification without real auth, use the dev demo route instead of pointing the app at production with a bypass:

- Run `npm run dev --workspace=@foliobuddy/frontend`
- Open `http://localhost:4000/dev/demo`
- Use `http://localhost:4000/dev/demo/portfolio` for position form and edit-flow testing
- This route is available only in Vite dev mode and uses mocked `/api` responses

## Deployment

- **Backend**: Node API host — `https://api.foliobuddy.xyz`
- **Frontend**: Static app host — `https://foliobuddy.xyz` (rewrites API calls to backend)
- **Database**: PostgreSQL on a private network
- **Auto-deploy**: Backend deploys via GitHub Actions on push to main (backend files). Frontend auto-deploys via Vercel.
- **DB Backups**: Automated daily/weekly/monthly to private object storage.
- **Uptime monitoring**: `.github/workflows/uptime.yml` runs every 10 min against `https://foliobuddy.xyz/api/v1/health/db`. Fails the job on non-200 and GitHub emails the repo owner — no third-party monitoring service.
- **Public deployment docs**: `DEPLOYMENT.md` lists required variable names and deployment shape. Keep real host details, dashboard URLs, project IDs, and secret values in private ops notes.
- **Env var writes**: Always pipe values through `printf` (not `echo`) when running `vercel env add` — `echo` appends `\n` and the stored newline breaks URL construction while still being truthy enough to pass `if (value)` guards.

### Copy/Paste JSON Import Pattern

All data tables (Portfolio, Trades, History) follow the same copy/import pattern:

- **Copy individual**: Clipboard icon per row, copies single item as JSON
- **Copy All**: Button in header, copies all items as JSON array
- **Import**: Tab in Add/Log dialog with textarea for pasting JSON
- **Format**: Single unified JSON format used for both copy and import (no simplified versions)

### Trade Form Editing

`TradeForm` accepts an optional `trade` prop — pass it for edit mode, omit for create.

## Local Database Setup

Prereq: Docker Desktop. Add `PRODUCTION_DATABASE_URL` to `packages/backend/.env`; `DATABASE_URL` defaults to `postgresql://dev:dev@localhost:5433/example_portfolio_db`.

```bash
npm run db:local       # Start local Postgres (port 5433)
npm run db:sync        # Pull fresh production data → local
npm run dev            # Start dev servers
```

Local backend connects to local Postgres. Production is untouched. Re-run `db:sync` anytime for fresh data.

### Branding

- **App name**: FolioBuddy
- **Logo**: Growth-chart SVG (`public/logo.svg`, indigo→purple gradient). Sidebar icon uses inline SVG with `bg-primary` for theme adaptivity.
- **Package scope**: `@foliobuddy/*` (root: `foliobuddy`); GitHub repo: `n3moxyz/foliobuddy`.
- Local DB name: `example_portfolio_db`. Production storage/bucket names live in private ops notes.

### Clickable Snapshot Rows

History page snapshot rows (AUTOMATIC source) are clickable anywhere to expand/collapse positions — not just the chevron arrow. Action buttons (copy/edit/delete) use `stopPropagation` to avoid triggering the row toggle.

## Design Context

See `PRODUCT.md` at project root — source of truth for users, brand personality, aesthetic direction, and design principles. Dark mode primary; Linear/Raycast polish crossed with Dune data-density. Legacy `.impeccable.md` has been migrated to `PRODUCT.md`; if an old tool asks for `.impeccable.md`, point it at `PRODUCT.md` instead of creating a second source of truth.

## Gotchas & Notes

- `.env.local` overrides `.env` in Vite — if you see wrong ports or "DB Down", check `.env.local` first
- Always define `onDelete: Cascade` in Prisma relations to avoid FK errors
- FX rates need fallback values for when API is slow
- Snapshots use unique constraint + check-before-create to prevent duplicates
- Position P&L should display as percentage for clarity
- Bulk import endpoints skip price fetching (`skipPriceFetch: true`) to avoid rate limiting - scheduler updates prices within 1 minute
- Backend `LOG_LEVEL` env var controls logging verbosity (default: `info` in prod, `debug` in dev)
- GitHub Actions CI runs type checking and format checking on push/PR
- Sentry backend captures only unexpected 500-level errors (Zod 400s and AppErrors < 500 are skipped)
- `console.error` crashes when inspecting ZodError objects in Node — integration tests must mock the logger
- vitest `exclude: ['dist/**']` prevents duplicate test runs after `npm run build`
- If a protected route mutates by `id` only, treat it as a security bug. All writes for positions/trades/investors should be ownership-scoped.
- Do not gate the dev demo route with extra env flags unless the frontend actually reads them at build time. `import.meta.env.DEV` is the safe default because it cannot be enabled in production accidentally.
- `VITE_WS_BACKEND_URL` must be set in Vercel env vars for production WebSocket to work (warns + disables if missing)
- When deploying: backend must deploy before frontend when API versioning paths change (frontend uses `/api/v1`)
- Frontend imports from a workspace package (`@foliobuddy/shared`, etc.) MUST be declared in the consumer's `package.json`. Local npm install hoists into root `node_modules` and masks the missing dep — Vercel's `npm ci` rejects it. CI guards this via `npm ls --workspaces --depth=0` in `ci.yml`.
- Backend Dockerfile is package-isolated: it `COPY package*.json ./` and `npm install` from `packages/backend/` only, so `@foliobuddy/shared` is not resolvable at runtime. `packages/backend/src/lib/constants.ts` intentionally duplicates enums/constants in shared — keep both copies in sync manually when adding new domain enums.
- `VITE_API_URL` in Vercel must be the full resolved path (`/api/v1`), not just `/api`. A stale `/api` value silently broke prod when the backend removed legacy `/api/*` routes — the frontend still got 200s from the rewrite but hit the wrong paths. Always verify with `curl https://foliobuddy.xyz/api/v1/health/db` after any change.
