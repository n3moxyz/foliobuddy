# CLAUDE.md

> **Self-Updating Rule**: This file is a living document. Claude should proactively update it when:
>
> - New patterns, conventions, or architectural decisions are established
> - New key files or directories are added
> - Commands or workflows change
> - Bugs/gotchas are discovered worth remembering
> - Environment variables are added/removed

> **Agent Instruction Sync**: Keep `CLAUDE.md` and `AGENTS.md` synchronized. When updating one, mirror the same project facts, workflows, and lessons into the other in the same change. The only expected differences are the file title and agent name (`Claude` vs `Codex`).

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
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none
                         # Optional React quality/a11y scan (pinned, offline, advisory)

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

Captures portfolio state at points in time for performance tracking. Calculates daily/weekly/monthly/YTD returns and benchmark outperformance vs BTC/ETH. All return fields stored as `percent × 100` (e.g. `12` = 12%, not `0.12`). YTD anchor = first snapshot of the _current calendar year_, scoped via `timestamp >= Jan 1 UTC` in `portfolioService.getSummary()` — not `findFirst orderBy:asc` without a date filter, which would pin YTD to a stale pre-year snapshot in future calendar years.

### Snapshot Backfill Script

`packages/backend/scripts/backfill-equity-snapshots.ts` — one-shot script for retroactively inserting positions into historical snapshots when a long-held position is entered mid-year. Prevents a vertical cliff in the Dashboard chart and restores the correct YTD anchor. Full pattern, gotchas, and Yahoo-fallback interpolation logic live in the script header — read it before running.

```bash
tsx scripts/backfill-equity-snapshots.ts --dry --user-id=<id>
tsx scripts/backfill-equity-snapshots.ts --apply --user-id=<id>
tsx scripts/backfill-equity-snapshots.ts --rollback <audit.json>
DATABASE_URL="$PRODUCTION_DATABASE_URL" tsx scripts/backfill-equity-snapshots.ts --apply --user-id=<id>
```

**`BACKFILLS` is ephemeral — rewrite it per run.** Entries are additive deltas, not absolute states. Re-running with the same entries double-adds. Multiple entries on the same symbol (one fund across multiple brokers) are supported. Audit JSON in `scripts/audit-*.json` is gitignored; keep locally until backfill is confirmed stuck.

### Yahoo Search IP-Filter Workaround

Yahoo's `/v1/finance/search` geolocates by caller IP and region-filters results even with `region=US`. Our Singapore droplet returned only cross-listings (e.g. `EWY.SN`) for US ETFs. `YahooFinanceProvider.search()` falls back to the IP-neutral `/v7/finance/quote` when the query matches `/^[A-Z0-9.-]{1,10}$/` and search returned no exact-symbol match.

### Unit Trust Statement Parsers (PDF Import)

`POST /assets/parse-unit-trust-statement` extracts text via `pdf-parse` and walks broker-specific parsers in `packages/backend/src/services/statementParsers/` until one succeeds. PDF text collapses table columns to a flat token stream, so each parser finds a deterministic anchor (ISIN regex or value-block regex) and reads fixed fields after it.

Supported: **UOB Kay Hian** (`uobKayHian.ts`, ISIN-anchored, enables Yahoo lookup) and **FSMOne / iFAST** (`fsmOne.ts`, value-block-anchored, no ISIN — manual Yahoo wiring).

Adding a broker: new file alongside, append to `parsers` array in `routes/assets.ts`, update supported-formats error string, and add a broker→`storageLocation` branch in `PositionForm.tsx:applyParsedHolding`.

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

### React Doctor Quality Scan

React Doctor can be used as an advisory frontend audit for React accessibility, correctness, state/effect, dead-code, and performance findings. Run the pinned, offline command from the repo root: `npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none`. Treat results as triage input, not an automatic refactor plan: fix high-signal user-facing items first (ARIA relationships, keyboard access, render correctness), and be skeptical of noisy rules like React 19 `forwardRef` warnings while the app is still on React 18.

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

| Price Range | Decimals | Example         |
| ----------- | -------- | --------------- |
| < $0.01     | 5        | $0.00842        |
| < $0.10     | 4        | $0.0812         |
| < $10       | 3        | $0.780, $1.480  |
| < $1,000    | 2        | $32.15, $113.40 |
| >= $1,000   | 0        | $67,200         |

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

Positions held on behalf of others (e.g., "bought BTC for Mum"). Uses `custodyOf String?` on Position — `null` = owned, non-null = custody. Custody positions are excluded from net worth, P&L, allocations, snapshots, and exposure. Backend: `portfolioService` and `snapshotService` filter `custodyOf: null`; `positions.ts` Zod schemas accept it as `z.string().nullable().optional()` (empty string → null).

Frontend: `Portfolio.tsx` splits into owned vs custody (purple "Held for Others" `CollapsibleCard`, collapsed by default, reuses `PositionTable`). `CustodyCheckbox.tsx` (shared between create/edit) renders at the _bottom_ of every form variant just above submit, with name dropdown (existing names from positions + localStorage `foliobuddy-custody-names`, plus "Add new person"). Edit sends empty string to clear. `PositionImportTab.tsx` shows a purple banner when importing as custody; clipboard JSON in `PositionTable.tsx` includes `custodyOf` when set.

### Equity Positions (Stock/ETF + Unit Trust)

Equities cover two sub-types via a UI toggle (enums unchanged):

- **Stock / ETF** (`equityMode='single'`, `asset.category='EQUITY'`, `priceProvider='yahoo'`) — tickers priced via Yahoo Finance. ETFs belong here, not Unit Trust — they have live ticker prices.
- **Unit Trust** (`equityMode='fund'`, `asset.category='UNIT_TRUST'`, `priceProvider='manual'|'yahoo'`) — NAV tracked manually or via Yahoo statement parser.

**Form (`PositionForm.tsx`):** Category dropdown is Crypto / Stables / Equities. Equities shows a Stock/ETF vs Unit Trust segmented toggle (create only; edit infers from `asset.category`). For equities, Storage Type is replaced with a broker dropdown (FSMOne, Tiger, UOB Kay Hian, Others) — `storageType` stays `'BROKERAGE'`, dropdown drives `storageLocation`. Cost input currency follows `asset.nativeCurrency`: SGD tickers (`.SI`) and SGD unit trusts show SGD inputs (with USD conversion note). Backend always stores USD; conversion uses live FX rate from `portfolioSummary` (fallback 1.35). Edit mode converts stored USD back to SGD via `costInitialized` flag.

**Display:** `Portfolio.tsx` has one "Equities" section; `PositionTable` with `groupBy='equityType'` splits into Stock/ETF and Unit Trust subsections. `PositionRow.tsx` shows the broker name directly for BROKERAGE positions. **NAV-age badge** appears under the symbol for unit trusts OR manual-priced positions; color follows freshness via `priceAgeClass` (muted <7d, amber 7–30d, red ≥30d, red "Never updated" if null). Crypto/equity tickers skip the badge — they refresh every minute.

**Statement upload (Unit Trust create form):** Dashed upload card is a `<label>` wrapping the file input — click or drag-drop a PDF works. Drag handlers on the label use `utDragOver` state to highlight `bg-primary/15`. Drop validates `application/pdf` / `.pdf` extension; same `handleUploadStatement` runs for both paths.

**Copy/Paste round-trip:** `PositionTable.formatPositionsForClipboard` includes `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` for non-coingecko assets so re-imported equities wire up Yahoo live prices. Bulk import schema accepts these as optional; honored only when creating a new Asset (defaults: `EQUITY→yahoo`, `UNIT_TRUST→manual`, else `coingecko`). Re-importing an existing symbol matches by symbol first.

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
- **Allocation donut charts**: 4 charts laid out responsively (`grid sm:grid-cols-2 lg:grid-cols-4`):
  - **By Asset** — high-level buckets: Crypto / Equities / Stables. `bucketFor()` in `AllocationCharts.tsx` maps via `categoryGroup()`; both `EQUITY` and `UNIT_TRUST` fold into Equities.
  - **By Detailed Asset** — crypto by individual symbol; Equities and Stables each shown as a single bundled wedge (protected from the "Other" rollup). Sub-2% crypto slices group into "Other" once 2+ of them (`OTHER_THRESHOLD_PCT = 2`).
  - **By Storage** — CEX / Onchain / Onchain Ledger.
  - **Stables Breakdown** — by stablecoin symbol; only rendered when stables exist.
- Custody positions filtered out before allocations are computed (`positions.filter((p) => !p.custodyOf)` in `Dashboard.tsx`).
- Inside each card: side legend (donut left, legend right) at sm/md (2-up); legend stacks below donut at lg+ (4-up) so labels stay readable in narrow cards (`flex-col sm:flex-row lg:flex-col`).
- Center label shows top item's % and truncated name (>8 chars get ellipsis). Clickable legends toggle slices — percentages recalculate for visible items.
- Hover on a pie slice shows `name · $value · %` on its own line directly under the card title (`min-h-[16px]` reserves space so the donut doesn't shift on hover/leave). Uses `formatCurrency(..., true)` compact mode. No Recharts Tooltip — removed to avoid overlap with legend.
- Maximally distinct hues per slice, avoiding benchmark line colors. Colors come from `ASSET_COLORS` / `STORAGE_COLORS` / `STABLES_COLORS` in `lib/chartColors.ts`.
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
- **Source of truth for prod env vars**: `DEPLOYMENT.md` at repo root. Update it in the _same commit_ as any Vercel/Coolify dashboard change; drift between file and dashboard is how prod breaks.
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
- **Anti-references**: NO generic SaaS dashboards (identical card grids, admin-panel energy). NO corporate finance tools (Excel-in-a-browser, gray everything, Bloomberg clone). The interface should feel _designed_, not generated.
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
