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
│   │   └── prisma/ ← Database schema & migrations
│   └── frontend/   ← React + Vite SPA
│       └── src/
└── package.json    ← Root workspace configuration
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
| **PostgreSQL** | Production-ready relational database. SQLite for development (portable, no setup). |
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
- PostgreSQL database (auto-provisioned, DATABASE_URL injected)
- Manual deploy via `railway up --service empowering-curiosity`
- Environment variables management
- Health checks and restart policies

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
- Frontend: `https://portfolioxyx.vercel.app`

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

Unit tests are good. But testing the full flow (create position → check snapshot → verify P&L) would catch more bugs.

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

### Copy/Paste Positions

Need to transfer positions between accounts or share with investors? The copy/paste system makes it easy.

**Copy features:**
| Location | Action |
|----------|--------|
| Position row | Click clipboard icon in Actions column |
| Position detail modal | Click "Copy" button |
| Portfolio header | "Copy All" button copies all positions |

**The clipboard format (JSON):**
```json
[
  {
    "asset": {
      "coingeckoId": "bitcoin",
      "symbol": "BTC",
      "name": "Bitcoin",
      "category": "LIQUID_CRYPTO"
    },
    "quantity": 6.2315,
    "avgCostUsd": 88888,
    "storageType": "CEX",
    "storageLocation": "Binance",
    "notes": "Spot"
  }
]
```

The format includes full asset info (coingeckoId, symbol, name, category) so positions can be recreated even if the asset doesn't exist in the target account.

**Import features:**
- **Import button** in Portfolio header opens the import dialog
- **Paste from Clipboard** - One-click paste button
- **Manual input** - Paste or type JSON in textarea
- **Validation** - Checks JSON format, required fields, positive quantities
- **Preview** - Shows all positions to be imported before confirming
- **Auto-create assets** - If an asset doesn't exist, creates it from CoinGecko
- **Results view** - Shows success/failure for each imported position

**Visual feedback:**
- Copy buttons show a green checkmark for 2 seconds after successful copy
- Button text changes to "Copied!" temporarily
- Import dialog shows count of positions ready to import

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
