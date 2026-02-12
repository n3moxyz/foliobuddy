# FOR[ET].md - PA Portfolio Dashboard

*Building a personal finance command center from scratch*

---

## The Vision: Why Build This?

Picture this: You've got crypto on Binance, stocks on Interactive Brokers, some ETH staked in DeFi, a couple of NFTs you're still holding (and slightly regretting), and maybe a small angel investment in a friend's startup. Where do you go to see your actual net worth?

**Nowhere.** That's the problem.

Existing tools either focus on one asset class (crypto-only, stocks-only) or they're bloated enterprise solutions that cost $500/month. I wanted something that:

1. Shows my **complete** financial picture in one place
2. Tracks performance over time (did I actually beat Bitcoin this year?)
3. Handles multiple currencies (USD for global assets, SGD for local expenses)
4. Lets me track investor stakes (when friends/family invest with you)
5. Is **mine**—not some third-party service with access to my data

So I built it.

---

## The Architecture: A Monorepo Story

This project uses a **monorepo** structure—two separate apps (frontend + backend) living in one repository. Think of it like a duplex: two independent living spaces sharing one lot.

```
PA-portfolio-dash/
├── packages/
│   ├── backend/    ← Express.js API server
│   │   ├── src/
│   │   │   ├── lib/        ← Shared utilities (logger, constants, pagination, tradePnL)
│   │   │   ├── __tests__/  ← Unit tests (vitest)
│   │   │   ├── routes/
│   │   │   └── services/
│   │   └── prisma/ ← Database schema & migrations
│   └── frontend/   ← React + Vite SPA
│       └── src/
├── .github/workflows/ ← CI (type check + format check)
├── .prettierrc        ← Code formatting config
└── package.json       ← Root workspace configuration
```

### Why a Monorepo?

1. **Shared types:** Both apps use TypeScript. When I update an API response shape, both sides need to know.
2. **Single git history:** One `git log` shows the full project evolution.
3. **Easier deployment:** One CI/CD pipeline can deploy both.
4. **Cognitive unity:** It's one project, even if it has two runtimes.

---

## The Tech Stack: Choosing Our Tools

### Backend
| Tool | Why This One? |
|------|---------------|
| **Express.js** | Simple, battle-tested, zero magic. When something breaks, I know exactly where to look. |
| **Prisma** | Type-safe database access. Auto-generated TypeScript types from the schema. Migrations are painless. |
| **PostgreSQL** | Production-ready relational database. Self-hosted on DigitalOcean via Coolify. |
| **Clerk** | Authentication without rolling my own JWT system. Secure by default. |
| **node-cron** | Background jobs for automated snapshots and price updates. |
| **Socket.io** | Real-time WebSocket updates with auto-reconnection and polling fallback. |
| **Zod** | Runtime validation that matches TypeScript types. Trust no input. |

### Frontend
| Tool | Why This One? |
|------|---------------|
| **React 18** | The ecosystem, the community, the muscle memory. |
| **Vite** | Blazing fast HMR. Create React App is dead; Vite is the successor. |
| **React Query** | Automatic caching, background refetching, loading/error states. Server state, handled. |
| **Zustand** | State management that doesn't require a PhD. Three lines to create a store. |
| **shadcn/ui** | Beautiful components I can actually customize (they're copied into my codebase, not npm-imported). |
| **Recharts** | Charting that works with React's mental model. |
| **Tailwind CSS** | Utility-first CSS. Never context-switch to a stylesheet again. |

---

## The Database Schema: Modeling Money

The database is the heart of this system. Let me walk you through the key models:

### The Core Entities

```
User
  ↓ owns many
Position (what you hold right now)
  ↓ references
Asset (what the position is in)

User
  ↓ records many
Trade (historical buy/sell activity)

User
  ↓ snapshots
Snapshot (portfolio state at a point in time)
  ↓ contains
SnapshotPosition (position details at snapshot time)

User
  ↓ has many
Investor (external stakeholders with stakes)
  ↓ tracks
InvestorStake (historical stake changes)
```

### Why Separate Position and Trade?

Great question. They serve different purposes:

- **Position** = "What do I own RIGHT NOW?"
  - Real-time market value
  - Current unrealized P&L
  - Storage location (wallet, exchange, DeFi)

- **Trade** = "What did I buy/sell?"
  - Entry/exit prices
  - Direction (long/short)
  - Realized P&L
  - Historical record for analytics

You can have closed trades that no longer affect positions. You can have positions that weren't from trades (airdrops, mining, etc.).

### The Asset Model

```prisma
model Asset {
  id            String   @id @default(uuid())
  symbol        String   @unique
  name          String
  category      Category // LIQUID_CRYPTO, STABLECOIN, NFT, ANGEL, CASH
  coingeckoId   String?  // For price fetching
  currentPrice  Float?
  priceChange24h Float?
  lastPriceUpdate DateTime?
}
```

**Why `coingeckoId`?** CoinGecko uses different identifiers than trading symbols. "BTC" is "bitcoin" in CoinGecko. This mapping field lets us fetch prices automatically.

**Why nullable prices?** Not all assets have live prices. An angel investment in a startup has no market price until exit.

### The Snapshot System

This is where the magic happens for performance tracking:

```prisma
model Snapshot {
  id               String   @id @default(uuid())
  userId           String
  timestamp        DateTime
  type             SnapshotType // DAILY, WEEKLY, MONTHLY

  // Portfolio state
  totalValueUsd    Float
  totalValueSgd    Float

  // Benchmarks (for comparison)
  btcPrice         Float?
  ethPrice         Float?

  // Performance metrics
  dailyReturnPct   Float?
  weeklyReturnPct  Float?
  monthlyReturnPct Float?
  ytdReturnPct     Float?

  // Benchmark comparison
  btcOutperformPct Float?   // Did I beat Bitcoin?
  ethOutperformPct Float?   // Did I beat Ethereum?

  // Position details at snapshot time
  positions        SnapshotPosition[]
}
```

**Why capture BTC and ETH prices in snapshots?**

Because "I made 50% this year" means nothing if Bitcoin made 100%. The only honest question is: "Did my active management beat just holding BTC/ETH?"

---

## The Data Flow: A Journey Through the Stack

Let's trace what happens when you open the dashboard:

### 1. Authentication (Clerk)

```typescript
// Frontend: App.tsx
<ClerkProvider>
  <SignedIn>
    <Dashboard />  // Only renders if authenticated
  </SignedIn>
  <SignedOut>
    <SignInButton />
  </SignedOut>
</ClerkProvider>
```

Clerk handles the OAuth flow, stores the session, and provides a JWT token.

### 2. API Request with Auth

```typescript
// Frontend: api.ts
const api = {
  async getPositions() {
    const token = await clerk.session.getToken();
    return fetch('/api/positions', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
  }
};
```

### 3. Backend Authentication Middleware

```typescript
// Backend: auth.ts
export const requireAuth = ClerkExpressRequireAuth();

// routes/positions.ts
router.get('/', requireAuth, async (req, res) => {
  const userId = req.auth.userId;
  // Now we know who's asking
});
```

### 4. Auto-Create User Pattern

First-time users don't exist in our database yet. We handle this gracefully:

```typescript
// middleware/auth.ts
export const ensureUser = async (req, res, next) => {
  const clerkId = req.auth.userId;

  let user = await prisma.user.findUnique({
    where: { clerkId }
  });

  if (!user) {
    // First time? Create the user record
    user = await prisma.user.create({
      data: { clerkId }
    });
  }

  req.userId = user.id;  // Attach for route handlers
  next();
};
```

### 5. Data Fetching with React Query

```typescript
// hooks/usePortfolio.ts
export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: api.getPositions,
    staleTime: 30 * 1000,  // Fresh for 30 seconds
  });
}
```

React Query handles:
- Loading states (`isLoading`)
- Error handling (`error`)
- Automatic refetching when tab becomes visible
- Caching (no unnecessary requests)

---

## The Price Feed: Respecting Rate Limits

CoinGecko's free tier has strict rate limits. Abuse them, get blocked. Here's how we play nice:

### The Queue System

```typescript
// services/priceService.ts
class PriceService {
  private requestQueue: Promise<any> = Promise.resolve();
  private lastRequestTime = 0;

  async fetchPrice(coingeckoId: string) {
    // Queue this request behind previous ones
    this.requestQueue = this.requestQueue.then(async () => {
      // Ensure 2.1 seconds between requests
      const timeSinceLastRequest = Date.now() - this.lastRequestTime;
      if (timeSinceLastRequest < 2100) {
        await sleep(2100 - timeSinceLastRequest);
      }

      this.lastRequestTime = Date.now();
      return this.callCoinGeckoAPI(coingeckoId);
    });

    return this.requestQueue;
  }
}
```

### Batch Requests

Instead of 50 requests for 50 coins, we make 1 request for 50 coins:

```typescript
const ids = coins.map(c => c.coingeckoId).join(',');
const response = await fetch(
  `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
);
```

### In-Memory Price Cache

```typescript
const priceCache = new Map<string, { price: number; timestamp: number }>();

function getCachedPrice(id: string) {
  const cached = priceCache.get(id);
  if (cached && Date.now() - cached.timestamp < 30000) {
    return cached.price;  // Use cache if < 30 seconds old
  }
  return null;
}
```

---

## The Scheduler: Automation That Works

Background jobs run via `node-cron`. They're the heartbeat of the system.

```typescript
// services/scheduler.ts

// Refresh prices every minute
cron.schedule('* * * * *', async () => {
  await priceService.updateAllPrices();
});

// Daily snapshot at midnight UTC
cron.schedule('0 0 * * *', async () => {
  await snapshotService.createDailySnapshots();
});

// Monthly snapshot on 1st of month
cron.schedule('0 0 1 * *', async () => {
  await snapshotService.createMonthlySnapshots();
});

// Catch-up on server restart
await snapshotService.createMissedSnapshots();
```

### The Catch-Up Pattern

What if the server was down on January 1st? We'd miss the monthly snapshot. The catch-up logic handles this:

```typescript
async createMissedSnapshots() {
  const lastSnapshot = await prisma.snapshot.findFirst({
    where: { type: 'DAILY' },
    orderBy: { timestamp: 'desc' }
  });

  const daysSinceLastSnapshot = differenceInDays(
    new Date(),
    lastSnapshot?.timestamp ?? startOfYear(new Date())
  );

  // Create backfill snapshots for each missed day
  for (let i = daysSinceLastSnapshot; i > 0; i--) {
    await this.createSnapshotForDate(subDays(new Date(), i));
  }
}
```

---

## Trade Analytics: Making Sense of History

The `/api/trades/analytics` endpoint calculates trading performance:

```typescript
// What we compute:
{
  totalTrades: 47,
  openTrades: 3,
  closedTrades: 44,
  winningTrades: 28,
  losingTrades: 16,
  winRate: 63.64,           // % of trades that were profitable
  totalProfit: 12500,        // Sum of winning trades
  totalLoss: 4200,           // Sum of losing trades
  profitFactor: 2.98,        // totalProfit / totalLoss
  averageWin: 446.43,
  averageLoss: 262.50,
  bestTrade: { ... },
  worstTrade: { ... },
  longStats: { ... },
  shortStats: { ... },
  monthlyPnL: [
    { month: '2025-01', pnl: 2500 },
    { month: '2025-02', pnl: -800 },
    // ...
  ]
}
```

**The Key Insight: Profit Factor**

Win rate alone is misleading. You could win 90% of trades but lose money if your losses are 10x your wins.

Profit factor = total gains / total losses

- Below 1.0 = losing money
- 1.0-1.5 = break-even zone
- 1.5-2.0 = solid
- 2.0+ = excellent

---

## The Investor System: Tracking External Capital

When friends or family invest with you, you need to track their stake:

```prisma
model Investor {
  id             String   @id @default(uuid())
  name           String
  stakePct       Float    // Current percentage of portfolio
  initialCapital Float    // What they put in
  currentValue   Float    // What it's worth now
  stakes         InvestorStake[]  // Historical changes
}

model InvestorStake {
  id         String   @id @default(uuid())
  investor   Investor @relation(...)
  stakePct   Float
  effectiveDate DateTime
  notes      String?
}
```

### The Dashboard Filter

Users can filter the dashboard by investor. When you select "Mom's stake (25%)", all values multiply by 0.25:

```typescript
// Dashboard.tsx
const stakeMultiplier = selectedInvestor
  ? selectedInvestor.stakePct / 100
  : 1;

const displayedNetWorth = totalNetWorth * stakeMultiplier;
```

This answers: "How much is Mom's portion worth today?"

---

## Frontend State Management: The Right Tool for Each Job

We use **two** state management approaches:

### React Query: Server State

Data that lives on the server (positions, trades, snapshots):

```typescript
// Server state - React Query handles it
const { data: positions } = usePositions();
const { data: trades } = useTrades();
```

React Query handles caching, refetching, and synchronization.

### Zustand: Client State

UI preferences that don't need a server:

```typescript
// Client state - Zustand store
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useCurrencyStore = create(
  persist(
    (set) => ({
      currency: 'USD',
      toggleCurrency: () => set((state) => ({
        currency: state.currency === 'USD' ? 'SGD' : 'USD'
      }))
    }),
    { name: 'currency-preference' }  // Persists to localStorage
  )
);

// Theme store for dark mode
export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'system',  // 'light' | 'dark' | 'system'
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const current = get().theme;
        const next = current === 'light' ? 'dark' : current === 'dark' ? 'system' : 'light';
        set({ theme: next });
      }
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme);  // Apply theme on load
      }
    }
  )
);
```

**Why not just use one?** Because they solve different problems:
- Server state needs syncing, caching, revalidation
- Client state needs persistence, instant updates, no network

---

## The Component Architecture: Building Blocks

### The shadcn/ui Pattern

Instead of installing a component library, shadcn/ui **copies** components into your codebase:

```
components/ui/
├── button.tsx      // Your button, fully customizable
├── card.tsx        // Your card
├── dialog.tsx      // Your dialog
└── ...
```

**Why this approach?**
1. No npm version conflicts
2. Full control over styling
3. Only include components you use
4. Learn from reading the code

### The Dashboard Composition

```typescript
// pages/Dashboard.tsx
<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
  <NetWorthCard
    value={netWorth * stakeMultiplier}
    currency={currency}
  />
  <AllocationCharts positions={positions} />
  <PerformersCard
    top={topPerformers}
    worst={worstPerformers}
  />
  <PortfolioChart snapshots={snapshots} />
  <TradeStatsCard stats={tradeStats} />
</div>
```

Each card is self-contained. Data flows down, events bubble up.

---

## Lessons Learned the Hard Way

### Lesson 1: Prisma Cascading Deletes

**The bug:** Deleted a user, database exploded with foreign key errors.

**The fix:** Define cascade behavior in schema:

```prisma
model Position {
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId String
}
```

Now deleting a user automatically deletes their positions. Prisma handles it.

### Lesson 2: FX Rate Timing

**The bug:** Portfolio showed $0 at market open because FX rates hadn't updated.

**The fix:** Hourly FX updates AND fallback to last known rate:

```typescript
async getRate(from: string, to: string) {
  const fresh = await this.fetchFreshRate(from, to);
  if (fresh) return fresh;

  // Fallback to cached rate
  const cached = await prisma.fxRate.findFirst({
    where: { from, to },
    orderBy: { timestamp: 'desc' }
  });
  return cached?.rate ?? 1.35;  // Ultimate fallback: approximate SGD/USD
}
```

### Lesson 3: Race Condition in Snapshots

**The bug:** Two snapshot jobs running simultaneously created duplicate snapshots.

**The fix:** Use database unique constraints AND check before create:

```typescript
const existing = await prisma.snapshot.findFirst({
  where: {
    userId,
    type: 'DAILY',
    timestamp: {
      gte: startOfDay(date),
      lt: endOfDay(date)
    }
  }
});

if (existing) {
  console.log('Snapshot already exists, skipping');
  return existing;
}
```

### Lesson 4: Unrealized P&L Display

**The bug:** Users thought they lost money when P&L showed red for a winning position.

**The investigation:** We were calculating P&L from total cost basis, but displaying per-unit.

**The fix:** Be consistent. Always show percentage change, which is unambiguous:

```typescript
// Clear and comparable
const unrealizedPnLPct = ((marketValue - costBasis) / costBasis) * 100;
// Returns: +23.5% or -12.3%
```

### Lesson 5: Railway Deployment Gotchas

**The bug:** Backend returning 502 errors after deployment.

**The investigation:** Multiple issues compounded:
1. `prisma migrate deploy` failed because no migration files existed (we used `db push` locally)
2. Missing environment variables (CLERK keys, ALLOWED_ORIGINS)
3. Port mismatch—server defaulted to 8080, but Railway networking expected 3001

**The fix:**
- Use `prisma db push` in start command (syncs schema without migrations)
- Add ALL required env vars via Railway dashboard
- Explicitly set `PORT=3001` to match Railway's networking config

**Key lesson:** Railway doesn't auto-detect your port. If your app listens on a different port than Railway expects, you get silent 502s.

### Lesson 6: Position Uniqueness

**The bug:** Could accidentally create duplicate positions for the same asset in the same storage location.

**The fix:** Add a composite unique constraint in Prisma:

```prisma
model Position {
  // ... fields ...
  @@unique([userId, assetId, storageType, storageLocation])
}
```

This enforces at the database level that you can't have two BTC positions on Binance—they must be merged or in different locations.

### Lesson 7: Environment Variables Pointing to Wrong Backend

**The bug:** Import feature worked locally but failed on production with CORS errors. Console showed requests going to `poker-api-production-2770.up.railway.app` instead of the correct backend.

**The investigation:** The Vercel dashboard had a `VITE_API_URL` environment variable accidentally set to a different project's Railway backend (from a previous deployment experiment).

**The fix:** Deleted the `VITE_API_URL` env var from Vercel. The frontend code defaults to `/api` which uses Vercel rewrites (configured in `vercel.json`) to proxy to the correct Railway backend.

**Key lesson:** When debugging CORS errors or wrong API calls, always check environment variables in your hosting provider's dashboard. Build-time env vars (like `VITE_*`) get baked into the JavaScript bundle, so you need to redeploy after changing them.

### Lesson 8: WebSocket URL Hardcoded to Localhost

**The bug:** WebSocket connection status showed "Offline" on production even though the backend was running with Socket.io.

**The investigation:** The `useWebSocket.ts` hook had a fallback URL that always defaulted to `'http://localhost:3001'`:
```typescript
// Before (broken)
const socketUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
```

In production, `VITE_API_URL` was undefined (intentionally, per Lesson 7), so it connected to localhost, which doesn't exist in the browser.

**The fix:** Use `window.location.origin` in production:
```typescript
// After (works)
const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin;
```

In production, this connects to `https://pa-port.vercel.app`, and Vercel's rewrites route `/socket.io/*` to the Railway backend.

### Lesson 9: Infinite Spinner on Import Errors

**The bug:** When importing positions on production, if an error occurred during the fetch of existing assets, the import button would spin forever.

**The investigation:** The `handleImport` function set `setImporting(true)` but the `setImporting(false)` was only in a finally block INSIDE the try-catch for individual positions—not wrapping the outer `api.getAssets()` call:
```typescript
// Before (broken)
const handleImport = async () => {
  setImporting(true);
  const existingAssets = await api.getAssets(); // <- If this throws, setImporting(false) never runs!
  // ... rest of function
};
```

**The fix:** Wrap the entire import logic in try-catch-finally:
```typescript
// After (works)
const handleImport = async () => {
  setImporting(true);
  try {
    const existingAssets = await api.getAssets();
    // ... rest of function
  } catch (e) {
    setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
  } finally {
    setImporting(false);  // Always resets spinner
  }
};
```

**Key lesson:** Any async function that sets loading state MUST have that state reset in a `finally` block that wraps ALL the async code, not just some of it.

### Lesson 10: CoinGecko Rate Limiting During Bulk Import

**The bug:** Importing multiple positions was extremely slow (2+ seconds per position), making bulk imports take minutes.

**The investigation:** When creating assets from CoinGecko search results, the `createAssetFromCoinGecko` endpoint fetched the current price from the CoinGecko API. With 2.1-second rate limiting per request, importing 10 positions took 20+ seconds.

**The fix:** Added `skipPriceFetch` option to the endpoint:
```typescript
// Backend: routes/assets.ts
const { coingeckoId, symbol, name, category, skipPriceFetch } = req.body;
let currentPriceUsd = null;
if (!skipPriceFetch) {
  currentPriceUsd = await priceService.getPrice(coingeckoId);
}
```

```typescript
// Frontend: ImportPositionsDialog.tsx
asset = await api.createAssetFromCoinGecko({
  coingeckoId: pos.asset.coingeckoId,
  symbol: pos.asset.symbol,
  name: pos.asset.name,
  category: pos.asset.category,
  skipPriceFetch: true,  // Skip price fetch - scheduler updates prices within 1 minute
});
```

**Key lesson:** Background jobs exist for a reason. If a scheduler is already fetching prices every minute, don't duplicate that work during user-facing operations. The tradeoff (60-second delay for new asset prices) is far better than blocking the UI.

### Lesson 11: Vercel Doesn't Proxy WebSockets to External Backends

**The bug:** WebSocket showed "Offline" on production even though the backend was running with Socket.io.

**The investigation:** We had configured Vercel rewrites to proxy `/socket.io/*` to Railway:
```json
{ "source": "/socket.io/:path*", "destination": "https://railway-backend.app/socket.io/:path*" }
```

But when testing, the rewrite returned `index.html` instead of proxying. Vercel rewrites work for HTTP requests, but **WebSocket protocol upgrades to external destinations are not supported**.

**The fix:** Connect directly to the Railway backend for WebSocket connections:
```typescript
// useWebSocket.ts
const RAILWAY_BACKEND = 'https://empowering-curiosity-production-9eff.up.railway.app';
const apiBase = import.meta.env.DEV ? 'http://localhost:3001' : RAILWAY_BACKEND;
```

Also had to ensure `ALLOWED_ORIGINS` on Railway included the Vercel frontend URL for CORS to work.

**Key lesson:** Vercel's rewrites are HTTP-only. For WebSocket connections to external backends, connect directly and configure CORS on the backend. This is a common pattern—HTTP APIs go through the proxy, WebSockets connect directly.

### Lesson 12: Prisma `db push` Doesn't Drop Database Constraints

**The bug:** Import feature failed with "A record with this value already exists" even after removing the `@@unique` constraint from schema.prisma.

**The context:** The Position model originally had a unique constraint to prevent duplicate positions:
```prisma
@@unique([userId, assetId, storageType, storageLocation])
```

When the user wanted to track multiple positions of the same asset (e.g., two BTC purchases at different prices), we removed this constraint. But deployments kept failing.

**The investigation:**
1. Removed `@@unique` from schema.prisma ✓
2. Ran `prisma db push --accept-data-loss` ✓
3. Import still failed with unique constraint error ✗

Turns out, `prisma db push` only **adds** constraints and **modifies** columns—it doesn't **drop** existing database constraints. The constraint was still in PostgreSQL even though it was gone from the schema.

**The fix:** Drop the constraint explicitly using raw SQL on server startup:
```typescript
// index.ts - server startup
await prisma.$executeRawUnsafe(`
  ALTER TABLE "Position" DROP CONSTRAINT IF EXISTS "Position_userId_assetId_storageType_storageLocation_key"
`);
```

Also added a diagnostic endpoint `/admin/drop-position-constraint` for debugging constraint issues.

**Bonus bug:** The TypeScript build failed because `importExcel.ts` and `seed.ts` still used `prisma.position.upsert()` with the compound unique key. When you remove a `@@unique` constraint, you must also update any code that relies on it for upserts.

**Key lesson:** Database schema changes in Prisma are not always bidirectional. Adding constraints via `db push` works, but removing them requires manual SQL. Always verify constraint changes directly in the database, not just in your schema file.

### Lesson 13: Vercel Root Directory for Monorepos

**The bug:** Vercel deployments started failing with "No Output Directory named 'dist' found after the Build completed" even though the build logs showed the dist folder was created successfully.

**The context:** This is a monorepo with `packages/frontend` and `packages/backend`. Vercel was configured to build the frontend, but the Root Directory setting was empty (pointing to the repository root).

**The investigation:**
1. Build logs showed `vite build` completed successfully: `✓ built in 7.20s`
2. Build logs showed dist files created: `dist/index.html`, `dist/assets/index-*.js`
3. But Vercel reported: "No Output Directory named 'dist' found"

The issue: When Root Directory is empty, Vercel runs commands at the repo root. The monorepo's `npm run build` triggers the workspace build, which creates `packages/frontend/dist`. But Vercel was looking for `dist` at the repo root—not inside the frontend package.

**The fix:** Set the Root Directory to `packages/frontend` in Vercel's Build and Deployment settings:
- Go to Project Settings → Build and Deployment
- Set Root Directory to `packages/frontend`
- Redeploy

Now Vercel runs `npm run build` from inside `packages/frontend`, the dist folder appears exactly where Vercel expects it, and deployments succeed.

**Key lesson:** In a monorepo, always configure the Root Directory in Vercel to point to the specific package you're deploying. The vercel.json in that package directory will be used, and paths (like `outputDirectory: "dist"`) will be relative to that root. This is a common gotcha—the build succeeds but Vercel can't find the output because it's looking in the wrong place.

### Lesson 14: Database Migration — Always Check the Actual Production DATABASE_URL

**The task:** Migrate the database from a managed service to self-hosted Postgres on DigitalOcean/Coolify.

**The assumption:** Production was using Neon serverless Postgres (matching the local `.env`).

**The reality:** Production `DATABASE_URL` on Railway pointed to Railway's own internal Postgres (`postgres.railway.internal:5432/railway`), not Neon at all. The local `.env` had the Neon URL, but production had a completely different database.

**What almost went wrong:** We dumped data from Neon (1.3MB) and imported it into Coolify. If we hadn't checked the Railway variables, we would have deployed with stale dev data instead of the real production data (8.7MB).

**The fix:** Always check the actual `DATABASE_URL` in your hosting provider's dashboard before migrating. Don't assume it matches your local `.env`.

**Key lesson:** Local environment and production environment can drift silently. When doing database migrations, verify the **actual** production connection string, not what you think it is.

### Lesson 15: CORS Origin Validation Vulnerability

**The bug (security):** CORS was configured with `origin.startsWith(allowed)`, which allowed malicious subdomains to pass CORS checks.

**The risk:** An attacker could create `evil-myapp.vercel.app` which would match `myapp.vercel.app` because of the prefix check. This would allow cross-origin requests from malicious domains.

**The fix:** Use exact string matching:
```typescript
// Before (vulnerable)
if (allowedOrigins.some(allowed => origin.startsWith(allowed) || allowed === '*'))

// After (secure)
if (allowedOrigins.some(allowed => origin === allowed || allowed === '*'))
```

**Key lesson:** Never use prefix matching for security boundaries. CORS origin validation must be exact. If you need wildcard subdomains, use explicit patterns like `*.myapp.com` with proper regex matching.

### Lesson 16: Exposed Admin Endpoint

**The bug (security):** The `/admin/drop-position-constraint` endpoint had no authentication, meaning anyone could execute database modifications.

**The investigation:** This endpoint was added as a debugging tool during development (Lesson 12) but was left in production code without auth protection.

**The fix:** Removed the endpoint entirely. The same constraint-dropping code already runs on server startup, making the admin endpoint redundant. For future admin tools, always use authentication middleware.

**Key lesson:** Development debugging tools must be removed or secured before production. If you need admin endpoints, protect them with authentication AND authorization (not just "is logged in" but "is admin").

---

## Best Practices That Paid Off

### 1. TypeScript Everywhere

Full TypeScript from database to UI. Prisma generates types from the schema. API types are shared. Refactoring is fearless.

```typescript
// One source of truth for Position
type Position = Prisma.PositionGetPayload<{
  include: { asset: true }
}>;
```

### 2. Validation at Boundaries

Never trust incoming data. Validate with Zod:

```typescript
const createPositionSchema = z.object({
  assetId: z.string().uuid(),
  quantity: z.number().positive(),
  averageCost: z.number().nonnegative(),
  storage: z.enum(['WALLET', 'CEX', 'DEFI', 'BANK'])
});

router.post('/', async (req, res) => {
  const parsed = createPositionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.issues });
  }
  // Safe to use parsed.data
});
```

### 3. Optimistic Updates

Don't wait for the server to confirm a change:

```typescript
const createPosition = useMutation({
  mutationFn: api.createPosition,
  onMutate: async (newPosition) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries(['positions']);

    // Snapshot current state
    const previous = queryClient.getQueryData(['positions']);

    // Optimistically update
    queryClient.setQueryData(['positions'], (old) => [
      ...old,
      { ...newPosition, id: 'temp-id' }
    ]);

    return { previous };
  },
  onError: (err, _, context) => {
    // Rollback on error
    queryClient.setQueryData(['positions'], context.previous);
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries(['positions']);
  }
});
```

The UI updates instantly. If the server fails, we rollback.

### 4. Meaningful Error Messages

```typescript
class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: object
  ) {
    super(message);
  }
}

// Usage
throw new AppError(
  'Position not found',
  404,
  { positionId, userId, suggestion: 'Check the position ID is correct' }
);
```

---

## Deployment: Railway + Vercel

### Backend → Railway

```json
// railway.json
{
  "build": { "builder": "NIXPACKS" },
  "deploy": {
    "startCommand": "npx prisma db push && npm run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Why `prisma db push` instead of `prisma migrate deploy`?**
We use `db push` because it syncs the schema directly without requiring migration files. This is simpler for a personal project where we're the only developer. The tradeoff: no migration history, but also no migration conflicts.

Railway provides:
- Manual deploy via `railway up --service empowering-curiosity`
- Environment variables management
- Health checks and restart policies

### Database → DigitalOcean/Coolify (Self-Hosted Postgres)

The database runs as a Docker container on a DigitalOcean droplet managed by Coolify:
- **Droplet:** 178.128.88.81 (Ubuntu 24.04)
- **Coolify:** One-click Postgres 17 deployment with persistent volume
- **Container:** `ykgckwckk8gc8kowwkgg4cc0` (postgres:17-alpine)
- **Port:** 5432 exposed externally, secured by DO firewall
- **Firewall:** `pa-portfolio` — allows SSH (22), HTTP (80), HTTPS (443), Postgres (5432)

**Why self-hosted instead of managed Postgres?**
We originally used Railway's built-in Postgres, but wanted more control and cost savings. Coolify makes self-hosting almost as easy as managed—it handles Docker, persistent volumes, and can host multiple databases on one $6/month droplet. Future projects (like poker-coach) can add their own Postgres service on the same droplet.

**Current production URLs:**
- Backend: `https://empowering-curiosity-production-9eff.up.railway.app`
- Health check: `/api/health` returns `{"status":"ok"}`

### Frontend → Vercel

```json
// vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://empowering-curiosity-production-9eff.up.railway.app/api/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**The API proxy pattern:** Frontend makes requests to `/api/*`, Vercel rewrites them to the Railway backend. This avoids CORS issues and keeps the backend URL hidden from the client.

**Current production URL:**
- Frontend: `https://pa-port.vercel.app`

Vercel provides:
- Edge deployment
- Preview deployments for PRs
- Automatic HTTPS
- SPA routing (all paths → index.html)

---

## What I'd Do Differently

### 1. Start with a Design System

I added shadcn/ui components as needed. Should have set up a complete design system from day one—typography, spacing, color tokens.

### 2. API Versioning

If I need to make breaking changes, I have no versioning strategy. Future me will regret this. Should be `/api/v1/positions`.

### 3. Integration Tests

We now have unit tests for backend utilities (constants, logger, pagination, tradePnL — 50 tests). But testing the full flow (create position → check snapshot → verify P&L) would catch more bugs.

---

## Quality of Life Features

### Dark Mode

Implemented using Zustand with a theme store that supports three modes: `light`, `dark`, and `system` (follows OS preference).

**Key implementation details:**
- Theme is applied by adding/removing the `dark` class on `document.documentElement`
- A script in `index.html` runs before React loads to prevent flash of wrong theme
- `useThemeEffect` hook listens for system preference changes via `matchMedia`
- Theme persists to localStorage via Zustand's `persist` middleware

```typescript
// Flash prevention script in index.html
(function() {
  var stored = localStorage.getItem('theme-storage');
  var theme = stored ? JSON.parse(stored).state.theme : 'system';
  var isDark = theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (isDark) document.documentElement.classList.add('dark');
})();
```

### Keyboard Shortcuts

Using `react-hotkeys-hook` for global keyboard shortcuts:

| Key | Action |
|-----|--------|
| `D` | Navigate to Dashboard |
| `P` | Navigate to Portfolio |
| `T` | Navigate to Trades |
| `I` | Navigate to Investors |
| `S` | Navigate to Settings |
| `/` | Cycle theme (light → dark → system) |
| `Cmd/Ctrl + K` | Show shortcuts help modal |

Shortcuts are disabled when typing in input fields via `enableOnFormTags: false`.

### Error Tracking with Sentry

Integrated Sentry for production error monitoring:
- Initializes only when `VITE_SENTRY_DSN` is set (silent skip in development)
- Includes browser tracing and session replay integrations
- Custom `ErrorFallback` component shows user-friendly error UI with error ID
- Wrap the entire app in `Sentry.ErrorBoundary`

### CSV Export

Added convenient export buttons on Portfolio and Trades pages:
- **Portfolio page:** "Export CSV" button downloads all positions
- **Trades page:** Dropdown menu with options for "All Trades", "Open Trades", "Closed Trades"

These use the existing backend `/api/export/csv/positions` and `/api/export/csv/trades` endpoints.

### Copy/Paste System (Positions, Trades, History)

Need to transfer data between accounts or back up your records? The copy/paste system is consistent across all major tables.

**The pattern is the same everywhere:**
| Page | Copy Individual | Copy All | Import Location |
|------|-----------------|----------|-----------------|
| Portfolio | Clipboard icon per row | "Copy All" button | Add Position → Import tab |
| Trades | Clipboard icon per row | "Copy All" button | Log Trade → Import tab |
| History | Clipboard icon per row | "Copy All" button | Add Snapshot → Import tab |

**Position format (JSON):**
```json
[{
  "asset": { "coingeckoId": "bitcoin", "symbol": "BTC", "name": "Bitcoin", "category": "LIQUID_CRYPTO" },
  "quantity": 6.2315,
  "avgCostUsd": 88888,
  "storageType": "CEX",
  "storageLocation": "Binance",
  "notes": "Spot"
}]
```

**Trade format (JSON):**
```json
[{
  "asset": { "coingeckoId": "bitcoin", "symbol": "BTC", "name": "Bitcoin", "category": "LIQUID_CRYPTO" },
  "direction": "LONG",
  "entryPrice": 50000,
  "exitPrice": 55000,
  "quantity": 0.1,
  "entryDate": "2024-01-15T10:00:00.000Z",
  "exitDate": "2024-01-20T10:00:00.000Z",
  "status": "CLOSED",
  "notes": "Test trade",
  "tags": ["swing"]
}]
```

**Snapshot format (JSON):**
```json
[{
  "timestamp": "2024-01-15T00:00:00.000Z",
  "snapshotType": "MANUAL",
  "source": "MANUAL",
  "totalValueUsd": 50000,
  "totalCostBasis": 40000,
  "notes": "Monthly checkpoint"
}]
```

**Why one format?** We originally had two formats (simplified for import, full for backup). But maintaining two formats was confusing—users copied in one format and couldn't paste it back. Now there's one unified format per entity type: what you copy is exactly what you can import.

**Import features:**
- **Paste from Clipboard** - One-click paste button
- **Manual input** - Paste or type JSON in textarea
- **Validation** - Checks JSON format, required fields, data types
- **Preview** - Shows count of items to be imported
- **Auto-create assets** - If an asset doesn't exist, creates it from CoinGecko
- **Bulk import API** - Backend endpoint handles arrays efficiently

**Visual feedback:**
- Copy buttons show a green checkmark for 2 seconds after successful copy
- Button text changes to "Copied!" temporarily
- Import dialog shows count of items ready to import

### Inline Edit/Delete Actions

Every data table has consistent action buttons per row:

| Icon | Action | Confirmation |
|------|--------|--------------|
| 📋 Copy | Copies item to clipboard | Green checkmark feedback |
| ✏️ Edit | Opens edit dialog with form pre-filled | None (dialog has Cancel) |
| 🗑️ Delete | Opens confirmation dialog | "Are you sure?" with Cancel/Delete |

**The edit pattern:**
```typescript
// Same form component handles both create and edit
<TradeForm trade={existingTrade} onSuccess={handleClose} />  // Edit mode
<TradeForm onSuccess={handleClose} />                         // Create mode

// Form detects mode from prop
const isEditing = !!trade;
const mutation = isEditing ? useUpdateTrade() : useCreateTrade();
```

This pattern keeps forms DRY—one component, two modes.

### Real-Time WebSocket Updates

No more waiting 60 seconds for price updates. The dashboard now receives instant updates via WebSocket when prices refresh.

**Architecture:**
```
Frontend (React)
    ↕ Socket.io (WebSocket/polling fallback)
Backend (Express + Socket.io)
    ↓ Broadcasts after price refresh
All connected clients
```

**Key implementation details:**

1. **Backend Socket Service** (`socketService.ts`):
   - Socket.io server initialized with CORS config matching the Express app
   - Clerk JWT verification on WebSocket handshake (same auth as REST API)
   - Users join a `user:{userId}` room for targeted messages
   - Two broadcast methods: `prices:updated` (all clients) and `portfolio:updated` (user-specific)

2. **Scheduler Integration**:
   - After `priceService.refreshAllPrices()`: broadcast price update to all clients
   - After `priceService.updatePositionValues()`: send portfolio update to each user with positions

3. **Frontend Hook** (`useWebSocket.ts`):
   - Connects with Clerk token on mount
   - Auto-reconnection with exponential backoff (Socket.io handles this)
   - On `prices:updated`: invalidates React Query cache for portfolio/positions/prices
   - On `portfolio:updated`: invalidates user-specific queries
   - Returns connection status and last update timestamp

4. **Connection Status Indicator**:
   - Green pulsing dot + "Live" when connected
   - Yellow dot + "Connecting..." during reconnection
   - Gray dot + "Offline" when disconnected (React Query polling continues as fallback)
   - Tooltip shows last update time

**The fallback pattern:**
```typescript
// React Query config in main.tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchInterval: 60000,  // Still polls every 60s as fallback
    },
  },
});

// When WebSocket is connected, we invalidate queries immediately
// When disconnected, React Query's polling kicks in automatically
```

**Why Socket.io instead of native WebSockets?**
- Auto-reconnection with exponential backoff
- Fallback to HTTP long-polling if WebSockets blocked
- Room system for user-specific messages
- Built-in heartbeat to detect stale connections

---

## Pre-Launch Checklist

Before making the app public:
- [ ] **Set up Sentry error tracking** - Add `VITE_SENTRY_DSN` to Vercel env vars (code is already in place, just needs DSN)

---

## The Road Ahead

Features I want to add:
- [ ] Mobile app (React Native, sharing the codebase)

Recently completed:
- [x] Major refactor: extract backend utilities (logger, constants, pagination, tradePnL) with unit tests
- [x] Major refactor: split large frontend components into focused modules (9 new components)
- [x] Add structured logging replacing all console.log, rate limiting, Prisma indexes
- [x] Add optimistic deletes, pagination hooks, lazy-loaded routes
- [x] Add Prettier + ESLint config, GitHub Actions CI
- [x] Database migration from Railway Postgres to self-hosted Coolify/DigitalOcean
- [x] Copy/paste for trades with bulk import API endpoint
- [x] Edit/delete action buttons per trade row
- [x] Unified copy format across Portfolio, Trades, and History tabs
- [x] Copy/paste positions between accounts with JSON format
- [x] Real-time WebSocket updates with Socket.io
- [x] Dark mode with system preference detection
- [x] Keyboard shortcuts for power users
- [x] Sentry error tracking for production monitoring
- [x] CSV export buttons on Portfolio and Trades pages

---

## Final Reflections

Building your own tools teaches you things no tutorial can. You understand why frameworks exist. You appreciate good abstractions. You develop intuition for where bugs hide.

This project started as "I want to see my net worth." It became a full portfolio management system. That's the nature of software—scope creeps because understanding deepens.

The most important lesson? **Ship early, iterate often.** Version 1 was ugly and barely functional. But it worked. Each version got better because I was using it daily and feeling the pain points.

Your portfolio dashboard doesn't need to be perfect. It needs to be *yours*.

---

*Built with TypeScript, Tailwind, and too much coffee.*
