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

Captures portfolio state at points in time for performance tracking. Calculates daily/weekly/monthly/YTD returns and benchmark outperformance vs BTC/ETH.

### CoinGecko Rate Limiting

Queue-based requests with 2.1s delays between calls. 30-second in-memory cache. Batch requests up to 50 coins.

### React Query + Zustand Split

- React Query: Server state (positions, trades, snapshots)
- Zustand: Client state (currency preference)

### Structured Logging

All backend code uses `logger` from `src/lib/logger.ts` instead of `console.log`. Respects `LOG_LEVEL` env var (debug/info/warn/error). No `console.log` in production code.

### Rate Limiting

Express-rate-limit applied globally to `/api` routes. Default: 200 requests per 15 minutes. Override with `RATE_LIMIT_MAX` env var (local dev uses 10000). Constants in `src/lib/constants.ts`.

### Pagination (Backend)

Trades and snapshots routes support optional pagination via `?page=1&limit=50`. Backwards-compatible — returns full array when no `page` param. Uses `parsePagination()` and `paginatedResponse()` from `src/lib/pagination.ts`.

### Lazy-Loaded Routes

All pages except Dashboard are lazy-loaded with `React.lazy()` + `Suspense`. Reduces initial bundle size.

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

### Trade Analytics Card

`TradeStatsCard` displays analytics with derived metrics (expectancy, risk:reward ratio) calculated client-side from backend data. Uses `CollapsibleCard` — collapsed by default on the Trades page to save space. Metric labels use `MetricLabel` component with shadcn `Tooltip` for hover definitions — formulas use `×`, `÷`, `−` symbols where math is clearer than words. Trade form defaults entry date to 5 days ago and exit date to today (optimized for logging closed trades).

### P&L by Ticker Card

`TickerPnLCard` (`components/trades/TickerPnLCard.tsx`) shows aggregated P&L per ticker — one row per asset with columns: Ticker, Trades, Win Rate, Total P&L. Only includes closed trades (those with `realizedPnL`). Default sort: P&L descending. Uses `CollapsibleCard` — collapsed by default. Clicking a ticker row filters the main trade table below; a filter chip appears next to the tabs to clear the filter.

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
- `PositionForm.tsx` uses `CustodyCheckbox` component above the mode tabs (applies to Add, Import, and Edit). When checked, shows a `<Select>` dropdown with existing names + "Add new person" option. Edit mode sends empty string (not undefined) when unchecking custody to properly clear the field
- `CustodyCheckbox.tsx` — extracted shared UI component for custody toggle with name selection, used by both create and edit modes. Takes `showDescription` prop (true for create, false for edit)
- Custody names persisted to `localStorage` (`pa-portfolio-custody-names`) and merged with names from existing positions. Memo recomputes via version counter after saving new names
- `PositionImportTab.tsx` shows a purple banner when importing as custody; all imported positions get `custodyOf` stamped
- `PositionTable.tsx` includes `custodyOf` in clipboard JSON format when set

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
- **Allocation donut charts**: 3 charts (By Asset, By Storage, Stables Breakdown) with side legend layout (donut left, legend right). Center label shows top item's % and truncated name (>8 chars get ellipsis). Clickable legends toggle slices — percentages recalculate for visible items. Hover on pie slices shows info inline in the card header row using `compactUsd()` for short dollar values ($1.2K, $3.4M, $1.2B) — no Recharts Tooltip (removed to avoid overlap with legend). Maximally distinct hues per slice, avoiding benchmark line colors.
- **Benchmark chart legend**: Portfolio line color is `#64748B` (slate gray) with matching color swatch dot — not the default `text-primary` indigo.

### Dashboard Investor Default

The dashboard investor filter should default to the primary owner investor (`isOwner = true`) rather than "all investors" when an owner record exists.

### Net Worth Card

Borderless hero section (no Card wrapper) with merged stat metrics. Shows investor label in title: `Net Worth (Nemo)`. Net worth at `text-4xl sm:text-5xl font-bold tracking-tight`. YTD trend arrow inline. Desktop: `grid grid-cols-6 divide-x divide-border` for equal-width metric sections (YTD P&L, YTD Start, vs 30D ago, Exposure, Positions, Trades). Mobile: `grid grid-cols-2 gap-4`. All labels have `HelpTooltip`. Exposure/Positions link to `/portfolio`, Trades links to `/trades`. Alternate currency in small text below. Key numeric values (net worth, P&L, cost basis, alt currency) use `useAnimatedNumber` hook for smooth counting transitions on value changes.

### Performers Card

Borderless layout (no Card wrapper) — plain `<div className="pb-4">` with `divide-y` list. Title uses small icons (`h-4 w-4`) with `text-profit`/`text-loss opacity-70`. Rank numbers in subtle `text-xs text-muted-foreground tabular-nums`.

### Page Entrance Animations

Dashboard, History, and Investors pages use staggered `animate-fade-in-up` entrance animations (CSS keyframe in `index.css`). 12px upward slide + opacity fade, 450ms with `cubic-bezier(0.16, 1, 0.3, 1)`. Each section has 60ms stagger delay. Respects `prefers-reduced-motion`.

### Consistent Page Headers

All pages MUST use the same header pattern for visual consistency when switching tabs:
- **Wrapper**: `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`
- **Title**: `text-2xl font-bold` (no responsive upsizing like `sm:text-3xl`)
- **Subtitle**: `text-sm text-muted-foreground` (no `sm:text-base`)
- **Buttons**: `size="sm"` with `mr-1` icon spacing

### Design System & Visual Identity

- **Color palette**: Indigo-tinted neutrals (not stock shadcn/ui grays) — `--primary: 234 89% 55%` (light), `234 89% 67%` (dark)
- **Fonts**: Plus Jakarta Sans (body/headings) + JetBrains Mono (tabular numbers) — loaded via Google Fonts in `index.html`
- **Profit/loss colors**: Emerald green (`text-profit`) and red (`text-loss`) — defined in `index.css`
- **Skeleton loading**: CSS shimmer animation via `.skeleton` class — used on all pages and chart components
- **HelpTooltip**: `?` icon tooltips on domain-specific finance terms (YTD Start, Exposure, CEX, Onchain, etc.)
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
VITE_API_URL=http://localhost:4001/api    # Backend API URL (or prod URL for frontend-only dev)
VITE_WS_BACKEND_URL=http://localhost:4001 # WebSocket URL
VITE_CLERK_PUBLISHABLE_KEY=              # Clerk frontend key
```

### Frontend-Only Development (No Docker)

For testing frontend changes without running Docker or the local backend, point `VITE_API_URL` at the production Coolify backend:

```
VITE_API_URL=https://api.foliobuddy.xyz/api
```

`http://localhost:4000` is already in Coolify's `ALLOWED_ORIGINS`, so CORS works. Remember to switch back to `http://localhost:4001/api` when doing backend work.

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
