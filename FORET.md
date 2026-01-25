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
    "startCommand": "npm run start",
    "healthcheckPath": "/health"
  }
}
```

Railway provides:
- PostgreSQL database
- Auto-deploy on push
- Environment variables
- Health checks

### Frontend → Vercel

```json
// vercel.json
{
  "rewrites": [{
    "source": "/api/:path*",
    "destination": "https://api.your-railway-url.com/:path*"
  }]
}
```

Vercel provides:
- Edge deployment
- Preview deployments for PRs
- Automatic HTTPS

---

## What I'd Do Differently

### 1. Start with a Design System

I added shadcn/ui components as needed. Should have set up a complete design system from day one—typography, spacing, color tokens.

### 2. Better Error Tracking

Console.log debugging works locally. In production, you need Sentry or similar. Should have added it earlier.

### 3. API Versioning

If I need to make breaking changes, I have no versioning strategy. Future me will regret this. Should be `/api/v1/positions`.

### 4. Integration Tests

Unit tests are good. But testing the full flow (create position → check snapshot → verify P&L) would catch more bugs.

---

## The Road Ahead

Features I want to add:
- [ ] Real-time WebSocket updates (currently polling via React Query)
- [ ] Tax lot tracking (FIFO, LIFO, specific identification)
- [ ] Tax loss harvesting suggestions
- [ ] Risk metrics (VaR, Sharpe ratio, correlation matrix)
- [ ] Multi-portfolio support
- [ ] Mobile app (React Native, sharing the codebase)

---

## Final Reflections

Building your own tools teaches you things no tutorial can. You understand why frameworks exist. You appreciate good abstractions. You develop intuition for where bugs hide.

This project started as "I want to see my net worth." It became a full portfolio management system. That's the nature of software—scope creeps because understanding deepens.

The most important lesson? **Ship early, iterate often.** Version 1 was ugly and barely functional. But it worked. Each version got better because I was using it daily and feeling the pain points.

Your portfolio dashboard doesn't need to be perfect. It needs to be *yours*.

---

*Built with TypeScript, Tailwind, and too much coffee.*
