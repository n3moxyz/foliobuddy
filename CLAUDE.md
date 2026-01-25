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
- **Database**: PostgreSQL (prod) / SQLite (dev)
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
- `src/index.ts` - Server entry point
- `src/routes/` - API endpoints (positions, trades, investors, snapshots, etc.)
- `src/services/` - Business logic (portfolioService, priceService, snapshotService)
- `src/middleware/` - Auth and error handling
- `prisma/schema.prisma` - Database schema

### Frontend
- `src/App.tsx` - Main app with routing
- `src/pages/` - Dashboard, Portfolio, Trades, Investors, Settings
- `src/components/` - Reusable UI components
- `src/hooks/` - React Query hooks (usePortfolio, useTrades, etc.)
- `src/lib/api.ts` - API client and types
- `src/stores/` - Zustand stores

## Commands
```bash
# Root (monorepo)
npm install              # Install all dependencies

# Backend
cd packages/backend
npm run dev              # Start dev server (port 3001)
npm run build            # Compile TypeScript
npx prisma migrate dev   # Run migrations
npx prisma studio        # Database GUI

# Frontend
cd packages/frontend
npm run dev              # Start Vite dev server (port 5173)
npm run build            # Production build
```

## Architecture

```
Frontend (React + Vite)
    ↓ HTTP + Clerk JWT
Backend (Express.js)
    ↓ Prisma ORM
Database (PostgreSQL/SQLite)

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

## Environment Variables

### Backend (`.env`)
```
DATABASE_URL=           # PostgreSQL connection string
CLERK_SECRET_KEY=       # Clerk backend key
```

### Frontend (`.env`)
```
VITE_API_BASE=          # Backend URL (e.g., http://localhost:3001)
VITE_CLERK_PUBLISHABLE_KEY=  # Clerk frontend key
```

## Deployment
- **Backend**: Railway (PostgreSQL included)
- **Frontend**: Vercel (rewrites API calls to Railway)

## Gotchas & Notes
- Always define `onDelete: Cascade` in Prisma relations to avoid FK errors
- FX rates need fallback values for when API is slow
- Snapshots use unique constraint + check-before-create to prevent duplicates
- Position P&L should display as percentage for clarity
