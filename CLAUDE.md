# CLAUDE.md

> **Self-Updating Rule**: This file is a living document. Claude should proactively update it when:
>
> - New patterns, conventions, or architectural decisions are established
> - New key files or directories are added
> - Commands or workflows change
> - Bugs/gotchas are discovered worth remembering
> - Environment variables are added/removed

> **FORET.md Maintenance**: After completing significant changes to this project, Claude MUST update `FORET.md` to reflect:
>
> - New features or architectural changes (add to relevant sections)
> - Bugs encountered and how they were fixed (add to "Lessons Learned the Hard Way" section)
> - New patterns or best practices discovered (add to "Best Practices" section)
> - Technology changes or additions (update tech stack discussion)
> - Lessons learned (add to "What I'd Do Differently" or relevant section)
>
> Keep the engaging, conversational tone. Use analogies where helpful. This is a learning document, not dry documentation.

## Project Overview

**FolioBuddy** — personal portfolio dashboard tracking positions and net worth across crypto, equities, NFTs, and alternative investments. Multi-user support with investor stake tracking.

## Tech Stack

### Backend (`packages/backend/`)

- **Runtime**: Node.js + TypeScript (ES2022 modules)
- **Framework**: Express.js 4.18
- **Database**: PostgreSQL (prod on DigitalOcean, local via Docker)
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
- **Design System**: `.impeccable.md` at project root for design context

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
- `src/lib/chartColors.ts` - Centralized chart color constants (brand, portfolio line, allocation palettes)

### Shared

- `packages/shared/src/types.ts` - Cross-package type definitions (Position, Trade, Snapshot, Asset, Investor)

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
npm run format           # Format all files with Prettier
npm run format:check     # Check formatting without writing

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

# Frontend demo route (dev-only, uses mocked API responses)
# Visit http://localhost:4000/dev/demo while Vite dev server is running
```

## Architecture

```
Vercel (Frontend: React + Vite)
    ↓ HTTP + Clerk JWT
Coolify/DigitalOcean (Backend: Express.js)
    ↓ Prisma ORM
DigitalOcean/Coolify (Database: PostgreSQL 17)

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

Captures portfolio state at points in time for performance tracking. Calculates daily/weekly/monthly/YTD returns and benchmark outperformance vs BTC/ETH. All return fields stored as `percent × 100` (e.g. `12` = 12%, not `0.12`). YTD anchor = first snapshot of the *current calendar year*, scoped via `timestamp >= Jan 1 UTC` in `portfolioService.getSummary()` — not `findFirst orderBy:asc` without a date filter, which would pin YTD to a stale pre-year snapshot in future calendar years.

### Snapshot Backfill Script

`packages/backend/scripts/backfill-equity-snapshots.ts` — one-shot script for retroactively inserting positions into historical Snapshot + SnapshotPosition rows. Used when a long-held position is entered into the app mid-year; the backfill prevents a vertical cliff in the Dashboard chart and restores the correct YTD anchor.

Pattern: audit-baseline-apply. Dumps every affected snapshot's totals + cached metrics + all `SnapshotPosition` rows to `scripts/audit-<iso>.json` *before* any write. Apply computes deltas from the captured baseline (not current DB), delete-then-inserts target rows inside a transaction, recomputes `allocation` on ALL positions in each snapshot, then walks snapshots in time order to rewrite cached `dailyReturn` / `weeklyReturn` / `monthlyReturn` / `ytdReturn` / `athValueUsd` / `btcOutperform` / `ethOutperform`. SGD-native assets convert using each snapshot's own `usdSgdRate`, not a single current rate. Mid-year buys add pre-purchase cash placeholders to `totalValueUsd` (no `SnapshotPosition` row) so totals stay flat across the purchase date.

Usage:

```bash
tsx scripts/backfill-equity-snapshots.ts --dry --user-id=<id>
tsx scripts/backfill-equity-snapshots.ts --apply --user-id=<id>
tsx scripts/backfill-equity-snapshots.ts --rollback <audit.json>

# Against prod (script reads DATABASE_URL from env):
DATABASE_URL="$PRODUCTION_DATABASE_URL" tsx scripts/backfill-equity-snapshots.ts --apply --user-id=<id>
```

`scripts/audit-*.json` is gitignored (per-run rollback artifact, not code). Keep the file locally until you're sure the backfill stuck.

### Yahoo Search IP-Filter Workaround

Yahoo's `/v1/finance/search` endpoint geolocates the caller IP and region-filters results, *even when `region=US` is passed explicitly*. Our Coolify droplet is in Singapore, so searches for US ETFs (EWY, QQQ, SPY, VOO) returned only cross-listings like `EWY.SN` (Santiago) and `EWYCL.SN` or empty results.

`YahooFinanceProvider.search()` now falls back to `quote()` when the query looks like a ticker (`/^[A-Z0-9.-]{1,10}$/`) and no exact-symbol match appeared in search results. The `/v7/finance/quote` endpoint is NOT IP-filtered, so deterministic tickers resolve regardless of server geography. Covers the common case of users typing tickers they already know.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` receives a PDF body, extracts text via `pdf-parse`, and walks an array of broker-specific parsers in `packages/backend/src/services/statementParsers/` until one succeeds. Each parser exports a function returning the shared `ParsedStatement` shape (`broker`, `periodEnd`, `holdings[]`) and throws if the input isn't its format.

Currently supported:

- **UOB Kay Hian** (`uobKayHian.ts`) — anchors on ISIN regex within the "Portfolio Holdings" section. Each holding stamps a real ISIN, so Yahoo `searchByIsin` resolves a ticker for live pricing.
- **FSMOne / iFAST** (`fsmOne.ts`) — anchors on a per-holding **value-block regex** capturing `priceCcy price PAYMENT wacCcy wac qty invCcy invAmt pnlCcy pnl pnl% mvCcy mv` (5 currency codes + 7 numbers + 1 payment-method token). The fund name is everything between blocks; trailing payment-method tokens (`Cash`/`RSP`/`CPF`/`SRS`/`IA`) are stripped from the tail. FSMOne statements don't print ISINs, so `isin` is left empty and downstream Yahoo lookup is skipped — user can manually wire a Yahoo symbol later.

Adding another broker: drop a new file alongside, append to the `parsers` array in `routes/assets.ts`, update the supported-formats string in the error message, and add an optional broker-specific branch in `PositionForm.tsx:applyParsedHolding` that maps the broker label to a `storageLocation`.

PDF text from `pdf-parse` collapses table columns into a flat token stream — visual layout is gone. Both parsers cope by finding a deterministic anchor (ISIN regex or value-block regex) and reading a fixed number of fields after it, rather than trying to reconstruct rows by position.

### CoinGecko Rate Limiting

Queue-based requests with 2.1s delays between calls. 30-second in-memory cache. Batch requests up to 50 coins.

### React Query + Zustand Split

- React Query: Server state (positions, trades, snapshots). No global `refetchInterval` — data refreshes on mount and manual invalidation only. `refetchOnWindowFocus: false` to avoid surprise refetches
- Zustand: Client state (currency preference)

### Structured Logging

All backend code uses `logger` from `src/lib/logger.ts` instead of `console.log`. Respects `LOG_LEVEL` env var (debug/info/warn/error). No `console.log` in production code.

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
- It mocks `/api/*` in the browser and restores the original `fetch` + token getter on unmount. Do not leave global network monkey-patches installed after navigating away.
- It now supports stateful in-browser portfolio CRUD for testing. Use `/dev/demo/portfolio` to validate add, edit, delete, and import UX without touching the real backend. The state resets on full refresh.
- Use it for responsive/UI checks and demo-mode interaction testing only. It must never point at production write APIs.

### Ownership Checks on Mutations

For protected backend resources, update/delete routes must filter by both `id` and `req.userId!`, not just `id`. Reads already did this in many places; writes now need to follow the same rule consistently to prevent cross-user mutation if an ID is guessed.

### WebSocket CORS

Socket.io origin validation should use exact origin matching (`origin === allowed`) just like the Express CORS middleware. Never use prefix matching for trusted origins.

### Optimistic Deletes

Delete mutations in `usePortfolio`, `useTrades`, `useSnapshots` use optimistic updates with rollback on error.

### Responsive Mobile Design

All pages follow iOS HIG-inspired responsive patterns:

- **Column toggle**: Portfolio and Trades tables have a mobile-only "All columns" / "Compact" toggle. Compact hides secondary columns (`hidden md:table-cell`), expanded shows all with horizontal scroll (`overflow-x-auto` + `min-w-[700px]`).
- **Touch targets**: All interactive elements use `touch-manipulation` CSS and minimum 44px hit areas (`h-8 w-8` buttons).
- **Responsive headers**: Page headers stack vertically on mobile (`flex-col gap-3 sm:flex-row`). Secondary actions move to `DropdownMenu` overflow menus.
- **Dialog safety**: Dialogs use `w-[calc(100%-2rem)]` for viewport margins and `max-h-[85vh] overflow-y-auto` for scroll.

### Smart Price Formatting

`formatPrice()` in `lib/utils.ts` — use instead of `formatCurrency(..., 0)` for per-unit prices (entry/exit, current price). Picks decimal places by magnitude:

| Price Range | Decimals | Example |
|---|---|---|
| < $0.01 | 5 | $0.00842 |
| < $0.10 | 4 | $0.0812 |
| < $10 | 3 | $0.780, $1.480 |
| < $1,000 | 2 | $32.15, $113.40 |
| >= $1,000 | 0 | $67,200 |

Use `formatCurrency` (with explicit decimals or compact mode) for totals, sizes, and P&L — those don't need magnitude-aware decimals.

### Trade Analytics Card

`TradeStatsCard` displays analytics with derived metrics (expectancy, risk:reward ratio) calculated client-side from backend data. Uses `CollapsibleCard` — collapsed by default on the Trades page to save space. When collapsed, `headerRight` shows a compact summary: Total P&L (colored), Win Rate %, and trade count. Metric labels use `MetricLabel` component with shadcn `Tooltip` for hover definitions — formulas use `×`, `÷`, `−` symbols where math is clearer than words. Trade form defaults entry date to 5 days ago and exit date to today (optimized for logging closed trades).

### P&L by Ticker Card

`TickerPnLCard` (`components/trades/TickerPnLCard.tsx`) shows aggregated P&L per ticker — one row per asset with columns: Ticker, Trades, Win Rate, Total P&L. Only includes closed trades (those with `realizedPnL`). Default sort: P&L descending. Uses `CollapsibleCard` — collapsed by default. Clicking a ticker row filters the main trade table below; a filter chip appears next to the tabs to clear the filter.

### Portfolio Hero Summary

Borderless hero section (matching Dashboard's Net Worth pattern). Total Value at `text-3xl sm:text-4xl font-bold tracking-tight tabular-nums` with inline YTD P&L trend arrow. Secondary stats in `divide-x` grid (YTD Start, Exposure, Positions, YTD P&L) — 4 columns on desktop, 2-column grid on mobile. All labels have `HelpTooltip`. Uses `pb-6 mb-2 border-b` wrapper.

### Portfolio Section Headers

Positions are grouped two-level: **Crypto/Stables** (primary, in `Portfolio.tsx` via `CollapsibleCard`) → **CEX/Onchain** (secondary, in `PositionTable`). `CollapsibleCard` accepts `icon` and `accentColor` props for visual differentiation (blue for Crypto, green for Stables, purple for Custody).

### Custody Positions ("Held for Others")

Positions held on behalf of other people (e.g., "bought BTC for Mum"). Uses `custodyOf String?` field on the Position model — `null` = owned by user, non-null = custody.

**Backend behavior:**

- `portfolioService` filters `custodyOf: null` on all queries (summary, allocation, performers) — custody positions excluded from net worth, P&L, and exposure
- `snapshotService` excludes custody positions from snapshots
- `positions.ts` routes accept `custodyOf` in create/update/bulk Zod schemas (`z.string().nullable().optional()`), converting empty strings to null

**Frontend behavior:**

- `Portfolio.tsx` splits positions into `ownedPositions` (sections) and `custodyPositions` (separate purple "Held for Others" `CollapsibleCard`, collapsed by default)
- Custody section reuses `PositionTable` for identical columns/sorting as Crypto and Stables
- `PositionForm.tsx` renders `CustodyCheckbox` at the *bottom* of every form variant, just above the submit button with a `pt-3 border-t border-border/60` separator (applies to Add New, Edit Totals, Add/Reduce delta, and Import tab via `footerSlot`). Placing it near the submit button keeps it visible as a final-step confirmation rather than dominating the top of the popup. When checked, shows a `<Select>` dropdown with existing names + "Add new person" option. Edit mode sends empty string (not undefined) when unchecking custody to properly clear the field
- `CustodyCheckbox.tsx` — extracted shared UI component for custody toggle with name selection, used by both create and edit modes. Takes `showDescription` prop (true for create, false for edit)
- Custody names persisted to `localStorage` (`foliobuddy-custody-names`) and merged with names from existing positions. Memo recomputes via version counter after saving new names
- `PositionImportTab.tsx` shows a purple banner when importing as custody; all imported positions get `custodyOf` stamped
- `PositionTable.tsx` includes `custodyOf` in clipboard JSON format when set

### Equity Positions (Stock/ETF + Unit Trust)

Equities are a single category covering two sub-types, selected via a toggle in the form. Labels are UI-only; enum values (`equityMode === 'single' | 'fund'`, `asset.category === 'EQUITY' | 'UNIT_TRUST'`) are unchanged:

- **Stock / ETF** (enum `single`) — tickers priced via Yahoo Finance (AAPL, D05.SI, EWY, QQQ, SPY, etc.). `asset.category === 'EQUITY'`, `priceProvider === 'yahoo'`. ETFs belong here, not Unit Trust — they trade on exchanges with live ticker prices, same pricing flow as individual stocks.
- **Unit Trust** (enum `fund`) — open-ended funds with NAV tracked manually or via Yahoo statement parser. `asset.category === 'UNIT_TRUST'`, `priceProvider === 'manual'` or `'yahoo'`.

**Form UI:**

- `PositionForm.tsx` Category dropdown has 3 options: Crypto, Stables, Equities. When Equities is selected, a Stock/ETF vs Unit Trust segmented toggle appears (only in create mode; edit mode infers from `position.asset.category`).
- "Storage Type" dropdown for equities is replaced with a broker list (FSMOne, Tiger, UOB Kay Hian, Others). `storageType` stays `'BROKERAGE'` behind the scenes; the dropdown drives `storageLocation`. The separate "Storage Location" field is hidden for equities.
- Cost input currency follows the asset's `nativeCurrency`: SGD tickers (`.SI`) and SGD unit trusts show "Total Cost (SGD)" / "Average Cost (SGD)". Backend always stores USD — conversion happens on submit using the live FX rate from `portfolioSummary` (fallback 1.35).
- Edit mode also respects `nativeCurrency`: a `costInitialized` flag + effect converts the stored USD cost basis to SGD for display once `portfolioSummary` loads. Delta mode (Add/Reduce) follows the same currency convention.
- "Stored internally as USD (x USD per SGD)" note shown whenever cost input is in SGD, in both create and edit.

**Display UI:**

- `Portfolio.tsx` has one "Equities" section combining both sub-types. Inside, `PositionTable` with `groupBy='equityType'` splits into Stock/ETF and Unit Trust collapsible subsections — mirrors how Crypto splits into CEX/Onchain.
- `PositionRow.tsx` Storage column: for `BROKERAGE` positions, shows the broker name directly (Tiger, UOB Kay Hian, FSMOne) instead of "Brokerage" with the broker as italic subtext. View dialog collapses to a single "Broker" field for brokerage positions.
- **NAV-age badge**: `PositionRow` shows a `NAV {age}` line under the asset symbol whenever the position is a unit trust OR uses the `manual` price provider, regardless of provider. Color follows freshness via `priceAgeClass`: muted (< 7d), amber (7–30d), red (≥ 30d), red "Never updated" if `priceUpdatedAt` is null. Hover shows the full timestamp. Crypto/equity-ticker positions don't show the badge — their prices refresh every minute via the scheduler so the info is noise.

**Statement upload UX (Unit Trust create form):**

- The dashed upload card is the drop zone — it's a `<label>` wrapping the file `<input>`, so click anywhere or drag a PDF onto it. Drag handlers (`onDragEnter/Over/Leave/Drop`) live on the label, with `utDragOver` state highlighting the card to `bg-primary/15` while dragging.
- Drop validation: rejects anything that isn't `application/pdf` (or doesn't end in `.pdf`) with an inline error.
- Same `handleUploadStatement` runs for both click and drop paths.

**Copy/Paste round-trip:**

- Copy format (`PositionTable.formatPositionsForClipboard`) includes `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets. Required so re-importing a not-yet-in-DB equity wires up Yahoo live prices.
- Backend bulk import schema (`positions.ts`) accepts these as optional; honored only when creating a new Asset row. Defaults: `EQUITY → yahoo`, `UNIT_TRUST → manual`, else `coingecko`. Re-importing an existing symbol matches by symbol first and ignores these fields (existing wiring wins).
- `BulkImportPosition` type in `packages/shared/src/types.ts` includes EQUITY + UNIT_TRUST in the category union.

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

- **Portfolio $ Value**: AreaChart (Recharts) with gradient fill under the line. Time period selector (7D/1M/3M/1Y/YTD/Max). Faint reference line at starting value. End-of-line value label. Centered loading indicator on period change (uses `isFetching` not `isLoading` to detect refetches).
- **Portfolio % vs Benchmarks**: Normalized percentage chart comparing portfolio vs BTC/ETH. Faint 0% reference line. Benchmark normalization uses price at first portfolio timestamp as baseline (not first CoinGecko price). Binary search + dynamic threshold for timestamp matching.
- **Allocation donut charts**: 3 charts (By Asset, By Storage, Stables Breakdown) with side legend layout (donut left, legend right). Custody positions are filtered out before allocations are computed (matches the backend's `custodyOf: null` treatment for summary/exposure) — done in `Dashboard.tsx` via `positions.filter((p) => !p.custodyOf)` before passing to `AllocationCharts`. Center label shows top item's % and truncated name (>8 chars get ellipsis). Clickable legends toggle slices — percentages recalculate for visible items. Hover on pie slices shows info inline in the card header row using `compactUsd()` for short dollar values ($1.2K, $3.4M, $1.2B) — no Recharts Tooltip (removed to avoid overlap with legend). Maximally distinct hues per slice, avoiding benchmark line colors.
- **By Asset "Other" bucket**: The By Asset donut groups sub-2% slices into a single "Other" wedge once there are 2+ of them (`OTHER_THRESHOLD_PCT = 2` in `AllocationCharts.tsx`). Prevents a long tail of hair-thin 0-1% slivers from fraying the donut when a portfolio has many small equity positions. By Storage and Stables Breakdown are untouched — they typically have ≤ 5 categories.
- **Benchmark chart legend**: Portfolio line color is `#64748B` (slate gray) with matching color swatch dot — not the default `text-primary` indigo.

### Dashboard Investor Default

The dashboard investor filter should default to the primary owner investor (`isOwner = true`) rather than "all investors" when an owner record exists.

### Net Worth Card

Borderless hero section (no Card wrapper) with merged stat metrics. Shows investor label in title: `Net Worth (Nemo)`. Net worth at `text-4xl sm:text-5xl font-bold tracking-tight`. YTD trend arrow inline. Desktop: `grid grid-cols-6 divide-x divide-border` for equal-width metric sections (YTD P&L, YTD Start, vs 30D ago, Exposure, Positions, Trades). Mobile: `grid grid-cols-2 gap-4`. All labels have `HelpTooltip`. Exposure/Positions link to `/portfolio`, Trades links to `/trades`. Alternate currency in small text below. Key numeric values (net worth, P&L, cost basis, alt currency) use `useAnimatedNumber` hook for smooth counting transitions on value changes.

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

### Destructive Actions in Headers

"Delete All" buttons MUST live inside the overflow `DropdownMenu` (⋮), never as standalone header buttons. This applies to Portfolio, Trades, and History. Only non-destructive actions (Copy All, Add/Log primary action) appear as visible header buttons. This prevents accidental destructive clicks and reduces visual noise.

### Design System & Visual Identity

- **Color palette**: Indigo-tinted neutrals (not stock shadcn/ui grays) — `--primary: 234 89% 55%` (light), `234 89% 67%` (dark)
- **Fonts**: Plus Jakarta Sans (body/headings) + JetBrains Mono (tabular numbers) — loaded via Google Fonts in `index.html`
- **Profit/loss colors**: Emerald green (`text-profit`) and red (`text-loss`) — backed by CSS custom properties `--profit`/`--loss` in `index.css` (both `:root` and `.dark`). Also `--warning` and `--info` tokens available
- **Chart colors**: Centralized in `src/lib/chartColors.ts` — `BRAND_COLORS` (BTC/ETH), `PORTFOLIO_LINE_COLOR`, `ASSET_COLORS`, `STORAGE_COLORS`, `STABLES_COLORS`. Always use these constants instead of inline hex in chart components
- **Skeleton loading**: CSS shimmer animation via `.skeleton` class — used on all pages and chart components
- **HelpTooltip**: `?` icon tooltips on domain-specific finance terms (YTD Start, Exposure, CEX, Onchain, etc.). Controlled open state with tap-to-toggle for touch devices. `stopPropagation` on pointer events prevents CollapsibleCard toggle when tapping help icons.
- **Sidebar**: Linear-style active state — `bg-primary/10 text-primary font-semibold border-r-2 border-primary`
- **Scrollbars**: Thin 6px with transparent track, rounded thumb
- **Empty states**: Icon + heading + descriptive text + action CTA (Portfolio, Trades, History)
- **Design context**: `.impeccable.md` at project root — brand personality, aesthetic direction, design principles

## Environment Variables

### Backend (`.env`)

```
DATABASE_URL=              # Local: postgresql://dev:dev@localhost:5433/example_portfolio_db
PRODUCTION_DATABASE_URL=   # Production DB (used by npm run db:sync)
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

For testing frontend changes without running Docker or the local backend, point `VITE_API_URL` at the production Coolify backend:

```
VITE_API_URL=https://api.foliobuddy.xyz/api/v1
```

`http://localhost:4000` is already in Coolify's `ALLOWED_ORIGINS`, so CORS works. Remember to switch back to `http://localhost:4001/api/v1` when doing backend work.

### Local Authenticated UI Testing

For frontend-only layout verification without real auth, use the dev demo route instead of pointing the app at production with a bypass:

- Run `npm run dev --workspace=@foliobuddy/frontend`
- Open `http://localhost:4000/dev/demo`
- Use `http://localhost:4000/dev/demo/portfolio` for position form and edit-flow testing
- This route is available only in Vite dev mode and uses mocked `/api` responses

## Deployment

- **Backend**: Coolify on DigitalOcean — `https://api.foliobuddy.xyz` (HTTPS via Let's Encrypt/Traefik)
- **Frontend**: Vercel — `https://foliobuddy.xyz` (rewrites API calls to backend)
- **Database**: Self-hosted PostgreSQL on DigitalOcean via Coolify (203.0.113.10:5432)
- **Auto-deploy**: Backend deploys via GitHub Actions on push to main (backend files). Frontend auto-deploys via Vercel.
- **DB Backups**: Automated daily/weekly/monthly to DigitalOcean Spaces (`example-backup-bucket`). Retention: 7 daily, 4 weekly, 12 monthly.
- **Uptime monitoring**: `.github/workflows/uptime.yml` runs every 10 min against `https://foliobuddy.xyz/api/v1/health/db`. Fails the job on non-200 and GitHub emails the repo owner — no third-party monitoring service.
- **Source of truth for prod env vars**: `DEPLOYMENT.md` at repo root. Update it in the *same commit* as any Vercel/Coolify dashboard change; drift between file and dashboard is how prod breaks.
- **Env var writes**: Always pipe values through `printf` (not `echo`) when running `vercel env add` — `echo` appends `\n` and the stored newline breaks URL construction while still being truthy enough to pass `if (value)` guards.

### Copy/Paste JSON Import Pattern

All data tables (Portfolio, Trades, History) follow the same copy/import pattern:

- **Copy individual**: Clipboard icon per row, copies single item as JSON
- **Copy All**: Button in header, copies all items as JSON array
- **Import**: Tab in Add/Log dialog with textarea for pasting JSON
- **Format**: Single unified JSON format used for both copy and import (no simplified versions)

### Trade Form Editing

`TradeForm` component supports both create and edit modes:

```typescript
<TradeForm trade={existingTrade} onSuccess={handleClose} />  // Edit mode
<TradeForm onSuccess={handleClose} />                         // Create mode
```

## Local Database Setup

**Prerequisites:** Docker Desktop installed.

**One-time setup:**

1. Add `PRODUCTION_DATABASE_URL` to `packages/backend/.env` (get from Coolify dashboard)
2. Verify `DATABASE_URL` in `.env` points to `postgresql://dev:dev@localhost:5433/example_portfolio_db`

**Daily workflow:**

```bash
npm run db:local       # Start local Postgres (port 5433)
npm run db:sync        # Pull fresh production data → local
npm run dev            # Start dev servers
```

**How it works:** Local backend connects to local Postgres (your sandbox). Production data is pulled on-demand via `db:sync`. Local changes do NOT affect production. Run `db:sync` anytime you want fresh data.

### Branding

- **App name**: FolioBuddy (formerly "PA Portfolio")
- **Logo**: Growth-chart SVG icon (trending line with arrow). Favicon at `public/logo.svg` (indigo→purple gradient). Sidebar icon uses inline SVG with `bg-primary`/`text-primary-foreground` for theme adaptivity.
- **Package scope**: `@foliobuddy/*` (root: `foliobuddy`)
- **GitHub repo**: `n3moxyz/foliobuddy` (renamed from `PA-portfolio-dash`)
- **Infrastructure names unchanged**: database `example_portfolio_db`, DO Spaces bucket `example-backup-bucket` — renaming these would require migration

### Clickable Snapshot Rows

History page snapshot rows (AUTOMATIC source) are clickable anywhere to expand/collapse positions — not just the chevron arrow. Action buttons (copy/edit/delete) use `stopPropagation` to avoid triggering the row toggle.

## Design Context

### Users
Small circle — the creator plus a few friends/family tracking personal portfolios. Used across contexts: quick net-worth glances on mobile, deeper analysis sessions on desktop. Users are financially literate but not professional traders. They want to feel in control of their money without the tool getting in the way.

### Brand Personality
**Calm, confident, precise.** Like a Bloomberg terminal that went to a meditation retreat — trustworthy, no-nonsense, reassuring even when markets are red. The interface should project quiet competence.

Three words: **Composed. Sharp. Trustworthy.**

### Aesthetic Direction
- **Visual tone**: Dark-mode-native, clean, keyboard-friendly. Inspired by Linear/Raycast (polish, speed, restraint) crossed with Dune Analytics/Zapper (data-density, crypto-native charts, dark themes).
- **References**: Linear's spatial clarity + Dune's information density + Raycast's micro-interactions
- **Anti-references**: NO generic SaaS dashboards (identical card grids, admin-panel energy). NO corporate finance tools (Excel-in-a-browser, gray everything, Bloomberg clone). The interface should feel *designed*, not generated.
- **Theme**: Dark mode primary. Light mode available but dark is the default and the optimized experience.

### Design Principles
1. **Data speaks first** — Numbers, charts, and trends are the hero. Chrome and decoration get out of the way.
2. **Quiet confidence** — Use restraint over flash. Subtle polish (spacing, type hierarchy, transitions) creates trust. No neon, no glow, no gratuitous gradients.
3. **Density without clutter** — Show a lot of information clearly. Use hierarchy, grouping, and progressive disclosure instead of hiding data behind clicks.
4. **Motion with purpose** — Animations confirm actions and orient the user. Never decorative, never slow.
5. **Designed, not templated** — Every screen should feel intentionally crafted. Avoid patterns that scream "default shadcn/ui" or "AI-generated dashboard."

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
- `VITE_API_URL` in Vercel must be the full resolved path (`/api/v1`), not just `/api`. A stale `/api` value silently broke prod when the backend removed legacy `/api/*` routes — the frontend still got 200s from the rewrite but hit the wrong paths. Always verify with `curl https://foliobuddy.xyz/api/v1/health/db` after any change.
