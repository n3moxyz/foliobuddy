# CLAUDE.md

> **Self-Updating Rule**: This file is a living document. Claude should proactively update it when:
> - New patterns, conventions, or architectural decisions are established
> - New key files or directories are added
> - Commands or workflows change
> - Bugs/gotchas are discovered worth remembering
> - Environment variables are added/removed

> **FORET.md Maintenance**: After completing significant changes to this project, Claude MUST update `FORET.md` to reflect:
> - New features or architectural changes (add to relevant sections)
> - Bugs encountered and how they were fixed (add to "Lessons Learned the Hard Way" section)
> - New patterns or best practices discovered (add to "Best Practices" section)
> - Technology changes or additions (update tech stack discussion)
> - Lessons learned (add to "What I'd Do Differently" or relevant section)
>
> Keep the engaging, conversational tone. Use analogies where helpful. This is a learning document, not dry documentation.

## Project Overview
Personal portfolio dashboard tracking positions and net worth across crypto, equities, NFTs, and alternative investments. Multi-user support with investor stake tracking.

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

## Key Files

### Backend
- `src/index.ts` - Server entry point (rate limiting, logger, FX job init)
- `src/routes/` - API endpoints (positions, trades, investors, snapshots, etc.)
- `src/services/` - Business logic (portfolioService, priceService, snapshotService)
- `src/middleware/` - Auth and error handling
- `src/lib/` - Shared utilities (constants, logger, pagination, tradePnL)
- `src/__tests__/` - Unit tests (vitest)
- `prisma/schema.prisma` - Database schema

### Frontend
- `src/App.tsx` - Main app with routing
- `src/pages/` - Dashboard, Portfolio, Trades, Investors, Settings
- `src/components/` - Reusable UI components
- `src/hooks/` - React Query hooks (usePortfolio, useTrades, etc.)
- `src/lib/api.ts` - API client and types
- `src/stores/` - Zustand stores

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

# Backend (packages/backend/)
npm run dev              # Start dev server (port 4001)
npm run build            # Compile TypeScript
npm test                 # Run unit tests (vitest)
npx prisma migrate dev   # Run migrations
npx prisma studio        # Database GUI

# Frontend (packages/frontend/)
npm run dev              # Start Vite dev server (port 4000)
npm run build            # Production build
```

## Architecture

```
Vercel (Frontend: React + Vite)
    ↓ HTTP + Clerk JWT
Railway (Backend: Express.js)
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
Express-rate-limit applied globally to `/api` routes: 200 requests per 15 minutes. Constants in `src/lib/constants.ts`.

### Pagination (Backend)
Trades and snapshots routes support optional pagination via `?page=1&limit=50`. Backwards-compatible — returns full array when no `page` param. Uses `parsePagination()` and `paginatedResponse()` from `src/lib/pagination.ts`.

### Lazy-Loaded Routes
All pages except Dashboard are lazy-loaded with `React.lazy()` + `Suspense`. Reduces initial bundle size.

### Optimistic Deletes
Delete mutations in `usePortfolio`, `useTrades`, `useSnapshots` use optimistic updates with rollback on error.

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=              # Local: postgresql://dev:dev@localhost:5433/pa_portfolio
PRODUCTION_DATABASE_URL=   # Production DB (used by npm run db:sync)
PORT=4001                  # Backend port (DO NOT use 3001 — that's reserved for other projects)
CLERK_SECRET_KEY=          # Clerk backend key
ALLOWED_ORIGINS=http://localhost:4000
```

### Frontend (`.env`)
```
VITE_API_URL=http://localhost:4001/api    # Backend API URL
VITE_WS_BACKEND_URL=http://localhost:4001 # WebSocket URL
VITE_CLERK_PUBLISHABLE_KEY=              # Clerk frontend key
```

## Deployment
- **Backend**: Railway (Express.js API server)
- **Frontend**: Vercel (rewrites API calls to Railway)
- **Database**: Self-hosted PostgreSQL on DigitalOcean via Coolify (178.128.88.81:5432)

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

> **TODO (after device move):** Complete these steps, then remove this section marker.

**Prerequisites:** Docker Desktop installed.

**One-time setup:**
1. Add `PRODUCTION_DATABASE_URL` to `packages/backend/.env` (get from Railway env vars or Coolify dashboard)
2. Verify `DATABASE_URL` in `.env` points to `postgresql://dev:dev@localhost:5433/pa_portfolio`

**Daily workflow:**
```bash
npm run db:local       # Start local Postgres (port 5433)
npm run db:sync        # Pull fresh production data → local
npm run dev            # Start dev servers
```

**How it works:** Local backend connects to local Postgres (your sandbox). Production data is pulled on-demand via `db:sync`. Local changes do NOT affect production. Run `db:sync` anytime you want fresh data.

## Gotchas & Notes
- Always define `onDelete: Cascade` in Prisma relations to avoid FK errors
- FX rates need fallback values for when API is slow
- Snapshots use unique constraint + check-before-create to prevent duplicates
- Position P&L should display as percentage for clarity
- Bulk import endpoints skip price fetching (`skipPriceFetch: true`) to avoid rate limiting - scheduler updates prices within 1 minute
- Backend `LOG_LEVEL` env var controls logging verbosity (default: `info` in prod, `debug` in dev)
- GitHub Actions CI runs type checking and format checking on push/PR
