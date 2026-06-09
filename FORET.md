# FOR[ET].md - FolioBuddy

_Building a personal finance command center from scratch_

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
foliobuddy/
├── packages/
│   ├── backend/    ← Express.js API server
│   │   ├── src/
│   │   │   ├── lib/        ← Shared utilities (logger, constants, pagination, tradePnL)
│   │   │   ├── __tests__/  ← Unit + integration tests (vitest + supertest)
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

| Tool           | Why This One?                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| **Express.js** | Simple, battle-tested, zero magic. When something breaks, I know exactly where to look.              |
| **Prisma**     | Type-safe database access. Auto-generated TypeScript types from the schema. Migrations are painless. |
| **PostgreSQL** | Production-ready relational database. Self-hosted on DigitalOcean via Coolify.                       |
| **Clerk**      | Authentication without rolling my own JWT system. Secure by default.                                 |
| **node-cron**  | Background jobs for automated snapshots and price updates.                                           |
| **Socket.io**  | Real-time WebSocket updates with auto-reconnection and polling fallback.                             |
| **Zod**        | Runtime validation that matches TypeScript types. Trust no input.                                    |

### Frontend

| Tool             | Why This One?                                                                                      |
| ---------------- | -------------------------------------------------------------------------------------------------- |
| **React 18**     | The ecosystem, the community, the muscle memory.                                                   |
| **Vite**         | Blazing fast HMR. Create React App is dead; Vite is the successor.                                 |
| **React Query**  | Automatic caching, background refetching, loading/error states. Server state, handled.             |
| **Zustand**      | State management that doesn't require a PhD. Three lines to create a store.                        |
| **shadcn/ui**    | Beautiful components I can actually customize (they're copied into my codebase, not npm-imported). |
| **Recharts**     | Charting that works with React's mental model.                                                     |
| **Tailwind CSS** | Utility-first CSS. Never context-switch to a stylesheet again.                                     |

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
        Authorization: `Bearer ${token}`,
      },
    });
  },
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
    where: { clerkId },
  });

  if (!user) {
    // First time? Create the user record
    user = await prisma.user.create({
      data: { clerkId },
    });
  }

  req.userId = user.id; // Attach for route handlers
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
    staleTime: 30 * 1000, // Fresh for 30 seconds
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
const ids = coins.map((c) => c.coingeckoId).join(',');
const response = await fetch(
  `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
);
```

### In-Memory Price Cache (TTLCache)

The ad-hoc `Map` cache was replaced with a generic `TTLCache` utility supporting configurable TTL and LRU eviction:

```typescript
// lib/TTLCache.ts — reusable across services
const cache = new TTLCache<string, number>({ ttlMs: 30_000, maxEntries: 500 });
cache.set('bitcoin', 95000);
const price = cache.get('bitcoin'); // null if expired
```

This reduced `priceService.ts` from 528 to 355 lines. The `updatePositionValues` method now filters by changed asset IDs, avoiding unnecessary DB writes for positions whose prices didn't change.

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

**Derived Metrics (Client-Side)**

The backend provides raw analytics (win rate, avg win/loss, profit factor). The frontend derives additional insights without needing backend changes:

- **Expectancy** = (win rate × avg win) − (loss rate × avg loss). This is the expected profit per trade — the single most important number for knowing if your system works.
- **Risk:Reward Ratio** = avg win ÷ avg loss. Shows if your winners are bigger than your losers. A 1:2 ratio means avg win is 2x avg loss.
- **Best & Worst Trade** — already computed by the backend but now displayed in the stats card with asset name, date, and P&L percentage.

**Visual Design Choices:**

- Win rate uses a green/red proportional bar (not just a number)
- Avg Win vs Avg Loss shown as comparison bars for instant visual imbalance detection
- Metric labels have dotted underlines and show formula/definition tooltips on hover
- Contextual ratings on Profit Factor and R:R ("Excellent", "Strong", "Marginal")

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
const stakeMultiplier = selectedInvestor ? selectedInvestor.stakePct / 100 : 1;

const displayedNetWorth = totalNetWorth * stakeMultiplier;
```

This answers: "How much is Mom's portion worth today?"

The default now prefers the primary owner investor when one exists. That's a subtle but important choice: most of the time the dashboard should open on the owner's view, not on an ambiguous blended state.

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
      toggleCurrency: () =>
        set((state) => ({
          currency: state.currency === 'USD' ? 'SGD' : 'USD',
        })),
    }),
    { name: 'currency-preference' } // Persists to localStorage
  )
);

// Theme store for dark mode
export const useThemeStore = create(
  persist(
    (set, get) => ({
      theme: 'dark', // 'light' | 'dark'
      setTheme: (theme) => set({ theme }),
      cycleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        set({ theme: next });
      },
    }),
    {
      name: 'theme-storage',
      onRehydrateStorage: () => (state) => {
        if (state) applyTheme(state.theme); // Apply theme on load
      },
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

Recent refinement: the stat strip was merged into NetWorthCard as an equal-width 6-column grid (`grid-cols-6 divide-x`) with HelpTooltips on every label. `Exposure` and `Positions` link to Portfolio, `Trades` links to Trades. Exposure now means the whole market-risk side of the portfolio — crypto, equities, unit trusts, alternatives, plus local perp exposure — while deliberately excluding stablecoins, cash, and custody. The card shows investor context in its title (`Net Worth (Nemo)`). PerformersCard went borderless (no Card wrapper) — plain list with divide-y, subtle rank numbers. Allocation chart tooltips were replaced with hover info inline in the card header row (Recharts Tooltip caused overlap). Benchmark chart Portfolio legend color was fixed to match the actual line (#64748B slate, not indigo). All pages now use staggered fade-in-up entrance animations (60ms intervals, prefers-reduced-motion respected) and consistent header sizing (`text-2xl font-bold`, `size="sm"` buttons). The overall aesthetic follows Linear/Raycast (calm, precise) rather than generic SaaS dashboard patterns.

Recent Trades refinement: the original Trades page is now the default Review lens — collapsed analytics card, collapsed P&L by ticker card, then the familiar All/Open/Closed table. Two extra lenses sit beside it instead of replacing it: Ticker Dossier opens via `?ticker=SOL` and shows a symbol-specific review plus focused tape; Monthly Postmortem lives at `?view=monthly`, with month chips, repeatable-edge tags, loss review, and an open-trade watchlist. The trick was not to bulldoze a working journal, but to add side rooms where deeper questions can live.

Follow-up quality sweep: the trade lens code got split along a cleaner fault line. `Trades.tsx` now owns routing, query params, dialogs, and the shared tape. `TradeLensViews.tsx` owns the ticker/monthly UI. `tradeLensModels.ts` owns the pure aggregation math. That split made lint and React Doctor happy again, but more importantly it stops the journal page from turning into a filing cabinet with a router bolted on the front.

Small UX polish that matters: Trade Tape rows now behave like Portfolio rows. Click a trade, or focus it and press Enter/Space, and a compact detail dialog opens with side, status, size, prices, dates, realized P&L, notes, and the same Copy/Edit/Delete actions. The action cell stops event propagation so a copy or edit click stays a copy or edit click, not an accidental dialog open.

Shell refinement: the left sidebar now has a Codex-style collapsible desktop rail. Expanded mode stays at 256px with labels and shortcuts; collapsed mode persists as a 72px icon rail with right-side tooltips. Mobile deliberately ignores the rail preference and keeps the full drawer, because a tiny icon rail on a phone is clever in exactly the wrong way.

---

## Lessons Learned the Hard Way

### Exposure Is Not Just Crypto

**The bug:** The Exposure stat kept its old "volatile crypto only" calculation after FolioBuddy grew into equities and unit trusts. That made the number look oddly underfed once non-crypto market assets became a real part of the portfolio.

**The fix:** Centralize the frontend meaning in `isMarketExposureCategory()`: include every owned non-stable/non-cash category, add local perp exposure, and keep custody out. Dashboard and Portfolio now read from the same idea instead of each hand-rolling the math.

### Tiny Quality Gates Catch Weird Future Pain

**The bug:** A ClawPatch pass found three small cracks: root formatting ignored config/e2e files, `LOG_LEVEL=verbose` could accidentally silence even error logs, and `TTLCache` treated an `undefined` key like an empty iterator instead of a real cache key.

**The fix:** The root quality gate now checks root config, e2e files, package files, and shell script syntax. Logger env parsing validates `debug/info/warn/error` and falls back to `info`. `TTLCache` eviction now looks at the iterator's `done` flag, which is the boring-but-correct way to ask "is there an oldest entry?" instead of assuming no one would ever use `undefined` as a key.

**The lesson:** Quality tooling is most useful when it catches the little splinters before they become production mysteries. A typo in logging config and a cache edge case are not dramatic bugs, but they are exactly the sort of thing that makes a future outage feel haunted.

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
      lt: endOfDay(date),
    },
  },
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

### Lesson 5: Demo mode has to be genuinely testable, not just pretty

**The bug:** The original `/dev/demo` route was fine for screenshots, but weak for real workflow testing. A form could say "success" while nothing changed on screen, which is basically a showroom car with no engine.

**The fix:** Make demo mode stateful in the browser. `/dev/demo/portfolio` now supports add, edit, delete, and import flows without Clerk or the backend. It behaves like a safe sandbox and resets on refresh.

**The gotchas we had to fix immediately:**

- New demo assets need seeded prices or portfolio totals fall apart
- Demo ids cannot rely on plain `Date.now()` during bulk inserts
- If a demo flow mimics real editing, it has to preserve related fields like custody too
- Seeded `Position` objects are easy to corrupt if `assetId` and embedded `asset` point at different things. That exact bug made a supposed USDC position render as WLD, so the Dashboard never showed the Stables Breakdown chart. The fix was to use a `demoAsset(id)` helper instead of array indexes and seed crypto, equities, stables, SGD cash, and custody on purpose.

**Cash taxonomy follow-up:** Once fiat cash joined the old "Stables" lane, the label had to grow up. The UI now calls the section **Cash**, then asks for a **Type**: stablecoin tickers or Cash (fiat). Fiat then gets its own tiny **Currency** dropdown (USD default, then SGD/GBP), because "cash" without currency is a denomination-shaped trap. Storage follows the Type: stablecoins live on CEX/Onchain; fiat cash lives in Broker account/Bank. The important engineering move was not the rename; it was pulling broker and bank options into `positionOptions.ts`. Equities and cash broker accounts now share the same `BROKER_LOCATIONS` list, so "add Tiger here too" is one edit, not a tiny future scavenger hunt.

**Tiny display trap:** Fiat cash is manual-priced, but it is not NAV-tracked. `PositionRow` must suppress the NAV-age badge for cash-equivalent categories, otherwise a cash row says things like "NAV Today" and looks like a fund. Cash-equivalent row subtitles should also be plain "Cash"; the ticker already says USDC/USD/SGD/GBP, so "Cash USD" or a long stablecoin name is just the UI saying the quiet part twice.

### Lesson 6: Railway Deployment Gotchas

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

### Lesson 7: Position Uniqueness

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

In production, this connects to `https://foliobuddy.xyz`, and Vercel's rewrites route `/socket.io/*` to the Coolify backend.

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
    setImporting(false); // Always resets spinner
  }
};
```

**Key lesson:** Any async function that sets loading state MUST have that state reset in a `finally` block that wraps ALL the async code, not just some of it.

### Lesson 10: A Demo Route Can Secretly Leak Into Production

**The bug:** I added a handy `/dev/demo` route so I could inspect the authenticated UI without signing in. It worked locally, but there was a subtle trap: the demo module was imported normally from `App.tsx`, so Vite still bundled all the fake positions, trades, and snapshots into the production JavaScript.

**Why that matters:** The fake data wasn't writing into the real database, but it _was_ polluting the production bundle. That's the frontend equivalent of keeping a movie set behind a real storefront wall. Customers can't walk onto the set, but you're still paying to ship the props.

**The fix:** Make the route truly dev-only:

- Lazy-load the demo module only when `import.meta.env.DEV` is true
- Keep the mocked API responses inside that module
- Install the `fetch` mock only while the demo route is mounted, then restore the original `fetch` on cleanup

**Key lesson:** "Dev-only behavior" is not a comment, it's a bundling decision. If you `import` a file in the normal app entry, assume production may ship it.

**Follow-up gotcha:** The demo fetch mock originally matched only `/api/*`. Once the frontend was configured to call `/api/v1/*`, demo mode looked mounted but empty: seeded positions disappeared, health fell through to the real backend, and the Dashboard showed "DB Down". The mock now normalizes `/api/v1` back to `/api` before matching routes and waits to render child routes until the mock is installed, so React Query cannot cache empty real-backend responses first. A demo harness should mirror the same API base paths the real client can produce, or it becomes a beautiful little stage with nobody on it.

### Lesson 11: Record IDs Are Not Authorization

**The bug:** Some write routes checked ownership on reads but trusted raw `id` on update/delete. That means if a logged-in user ever got hold of another record's ID, the mutation path could target the wrong person's data.

**The fix:** Scope every protected mutation by both `id` and `userId`. For example:

```typescript
await prisma.position.deleteMany({
  where: {
    id: req.params.id,
    userId: req.userId!,
  },
});
```

It feels slightly more verbose, but it's the right kind of boring.

**Key lesson:** An ID tells you _what_ row to touch. It does not tell you _who is allowed_ to touch it.

### Lesson 12: WebSocket CORS Should Be as Strict as REST CORS

**The bug:** The WebSocket server used `origin.startsWith(allowedOrigin)`. That sounds innocent until you remember that `https://goodsite.com.evil.com` also starts with `https://goodsite.com`.

**The fix:** Exact origin matching, same as the Express CORS middleware.

```typescript
if (allowedOrigins.some((allowed) => origin === allowed || allowed === '*')) {
  return callback(null, true);
}
```

**Key lesson:** Real-time code is still network perimeter code. Treat it with the same suspicion as your REST API.

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
  skipPriceFetch: true, // Skip price fetch - scheduler updates prices within 1 minute
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
const RAILWAY_BACKEND = 'https://old-backend.example.com';
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

### Lesson 17: Duplicate Section Headers from Nested Grouping

**The bug:** Portfolio table showed "Crypto" and "Stables" headers twice — once from the parent page (`Portfolio.tsx` via `CollapsibleCard`) and again from `PositionTable` which also split by the same category.

**The investigation:** `Portfolio.tsx` already filters positions into Crypto/Stables sections using `SECTION_CONFIG` and passes each group to `PositionTable`. When `PositionTable` was updated to also group by Crypto/Stables (with CEX/Onchain sub-groups inside), it created a duplicate hierarchy.

**The fix:** Keep each component responsible for one level of grouping only:

- `Portfolio.tsx` → groups by asset type (Crypto/Stables) with `CollapsibleCard`
- `PositionTable` → groups by storage type (CEX/Onchain) as sub-sections

Enhanced `CollapsibleCard` with `icon` and `accentColor` props so the parent page controls the visual differentiation.

**Key lesson:** Before adding grouping logic to a child component, check what the parent is already doing. Component boundaries should align with grouping boundaries — one level of hierarchy per component.

### Lesson 18: Benchmark Chart Lines Disappearing on Time Period Change

**The bug:** BTC/ETH benchmark lines on the "Portfolio % vs Benchmarks" chart would disappear when switching between time periods (e.g., 1M → 1Y).

**The investigation:** CoinGecko returns historical price data starting from a different date than the portfolio snapshots. The `mergeAdditionalBenchmark` function normalized benchmark prices using the first CoinGecko price (`benchmarkData.data[0].price`) as the baseline. But this price was from before the portfolio data started, so the normalized percentage was offset from the portfolio's 0% starting point — pushing the benchmark line outside the visible Y-axis range.

Additionally, timestamp matching used a hardcoded 24-hour threshold, but CoinGecko switches from hourly to daily granularity at 90+ days, causing gaps.

**The fix:**

1. Normalize benchmark prices from the price **at the first portfolio timestamp**, not the first CoinGecko price
2. Use binary search (`findClosestPrice`) instead of O(n\*m) brute force
3. Dynamic threshold (3x average data spacing, minimum 48 hours) instead of hardcoded 24 hours
4. Added `connectNulls` to Recharts `Line` components to draw through undefined gaps

**Key lesson:** When merging two time series with different start dates and granularities, always normalize relative to their common starting point. And use adaptive thresholds — hardcoded time windows break when data granularity changes.

### Lesson 16: Exposed Admin Endpoint

**The bug (security):** The `/admin/drop-position-constraint` endpoint had no authentication, meaning anyone could execute database modifications.

**The investigation:** This endpoint was added as a debugging tool during development (Lesson 12) but was left in production code without auth protection.

**The fix:** Removed the endpoint entirely. The same constraint-dropping code already runs on server startup, making the admin endpoint redundant. For future admin tools, always use authentication middleware.

**Key lesson:** Development debugging tools must be removed or secured before production. If you need admin endpoints, protect them with authentication AND authorization (not just "is logged in" but "is admin").

### Lesson 19: Frontend .env Silently Hitting Production Backend

**The bug:** New `custodyOf` field was being sent in API requests but positions appeared without custody tracking — they showed up in the normal Crypto section instead of the separate custody section.

**The investigation:** The backend migration added the `custodyOf` column to the local database. But the frontend's `.env` had `VITE_API_URL` pointing at the **production** Railway backend (for "frontend-only dev" convenience). Production didn't have the migration yet, so Prisma silently ignored the unknown field — positions were created without `custodyOf`.

**The fix:** Changed `VITE_API_URL` back to `http://localhost:4001/api` and restarted Vite. Positions immediately started saving `custodyOf` correctly.

**Key lesson:** When developing features that require database schema changes, always verify your frontend is actually hitting the local backend (which has the migration), not production. The "frontend-only dev" mode (pointing at prod) is great for UI work but will silently swallow new fields that don't exist in the production schema yet.

### Lesson 20: Coolify Deploy ≠ Restart, and Never Manually ALTER Before Migrate

**The bug:** After migrating from Railway to Coolify, new backend features weren't appearing on the live site. The `custodyOf` field was sent by the frontend but the backend ignored it — positions always landed in the normal Crypto/Stables sections.

**The investigation (multi-layered):**

1. **Railway was dead** — the free trial had expired, returning 502. But the backend was alive on Coolify via sslip.io. FORET.md still said Railway.
2. **The container was 9 days old** — built from commit `1393d3c`, before the custody feature existed. Coolify "Redeploy" was doing a **restart** (same old image), not a **deploy** (rebuild from source).
3. **Manual ALTER TABLE backfired** — to speed things up, we ran `ALTER TABLE "Position" ADD COLUMN "custodyOf" TEXT` directly on the database. The column was added, but when Coolify finally did a real deploy, `prisma migrate deploy` found the column already existed and marked the migration as **failed**. This blocked the container from starting entirely (P3009 error).
4. **The container crash loop** — every restart attempt ran `prisma migrate deploy`, hit the failed migration, and exited. The site showed "Bad Gateway".

**The fix:**

1. Marked the failed migration as applied: `UPDATE _prisma_migrations SET finished_at = now(), logs = NULL WHERE migration_name = '...' AND finished_at IS NULL`
2. Triggered a fresh deploy in Coolify (not restart)
3. Container started cleanly, Prisma client included `custodyOf`, feature worked

**Key lessons:**

- **Coolify Restart ≠ Deploy.** Restart reuses the old Docker image. Deploy rebuilds from source. Always use Deploy for code changes.
- **Never manually ALTER a column that has a pending Prisma migration.** If you must, also mark the migration as applied in `_prisma_migrations`, or use `IF NOT EXISTS` in the migration SQL.
- **Keep deployment docs accurate.** When you switch hosting providers, update FORET.md immediately. Stale docs waste hours.
- **DigitalOcean cloud firewall is separate from ufw.** Both must allow a port for external access. Use `doctl compute firewall add-rules` for the cloud firewall.

### Lesson 21: Duplicated UI Blocks Hide Bugs and Drift

**The problem:** The custody checkbox UI in `PositionForm.tsx` was copy-pasted for create mode and edit mode (~80 lines each). They differed only in `id` attribute and a description paragraph. Any future change would need to be applied in two places — a classic maintenance trap.

**The fix:** Extracted a `CustodyCheckbox` component with a `showDescription` prop. Both modes now use the same component. During the extraction, we also found:

1. **Memo staleness** — `custodyNameOptions` read from localStorage inside `useMemo` but only depended on `existingCustodyNames` from props. A freshly saved name wouldn't appear in the dropdown until React Query refetched positions. Fixed with a `custodyNamesVersion` state counter.
2. **Edit-mode custody clearing bug** — unchecking custody in edit mode sent `custodyOf: undefined`, which Prisma silently skipped (leaving custody intact). Fixed by sending `''` (empty string) which the backend converts to `null`.
3. **Schema inconsistency** — `createPositionSchema` used `z.string().optional()` while `bulkImportPositionSchema` used `z.string().nullable().optional()`. Aligned to nullable for both.

**Key lesson:** When you find duplicated UI, extract it immediately. The extraction process itself often reveals subtle bugs hiding in the copy-paste divergence.

### Lesson 22: .env.local Silently Overrides .env in Vite

**The bug:** Frontend showed "DB Down" banner even though the backend was running fine on port 4001.

**The investigation:** Backend health check at `http://localhost:4001/health` returned OK. But the browser console showed requests going to `http://localhost:3001/api` — a port that nothing was listening on. The `.env` file had the correct `VITE_API_URL=http://localhost:4001/api`, so where was 3001 coming from?

**The root cause:** `.env.local` existed with `VITE_API_URL=http://localhost:3001/api` from a previous setup. Vite loads `.env.local` with higher priority than `.env`, silently overriding the value.

**The fix:** Updated `.env.local` to use port 4001. Restarted the Vite dev server (env changes require restart).

**Key lesson:** When debugging "wrong URL" or "DB Down" errors in Vite, always check `.env.local` first — it overrides `.env` with no warning. The priority order is: `.env.local` > `.env.[mode]` > `.env`.

### Lesson 23: Hardcoded Colors and `as const` in Chart Color Arrays

**The bug:** After centralizing chart colors into `chartColors.ts`, TypeScript refused to compile — `readonly` tuple not assignable to `string[]`.

**The root cause:** Using `as const` on color arrays makes them `readonly` tuples, but Recharts and utility functions expect mutable `string[]`. The fix: type the exports as `string[]` instead of using `as const` for arrays (keep `as const` only for objects like `BRAND_COLORS`).

**The pattern:** When centralizing constants that will be passed to third-party libraries, use explicit type annotations instead of `as const` inference. SVG/Recharts attributes also require JSX curly braces for variable references (`stopColor={COLOR}` not `stopColor=COLOR`) — easy to miss during search-and-replace.

### Lesson 24: Mock Analytics Drift From Visible Rows

**The bug:** The demo trade rows had a huge SOL loss, but the mocked `TradeAnalytics.worstTrade` still pointed at a much smaller older loss. The page looked like it was lying even though the table data was right.

**The fix:** Keep demo analytics fixtures synchronized with the rows they summarize, especially when `TradeStatsCard` renders backend/mock `bestTrade` and `worstTrade` directly. If a callout can be derived cheaply from visible rows, prefer deriving it; otherwise treat mock analytics like a contract that needs updating whenever seed trades change.

---

### React Fragment Keys — `<>` can't hold them

In `SnapshotTable`, a map returned `<>...</>` with `key` on the inner `<TableRow>`. React can't use a key on a fragment shorthand, so the "outer" element for list reconciliation became the first child. When a second sibling (expanded positions row) was added conditionally, React had to re-mount things more than needed.

**The fix:** Import `Fragment` from React and use `<Fragment key={id}>` explicitly. Remove redundant keys from children — the outer Fragment is the keyed element now. Classic lint rule, easy to miss when you're writing inline expanders.

---

### Default Payload Limits are Generous — Tighten Them

Express-default JSON limit is 100kb, but we'd bumped it to 10mb during early import development and never walked it back. 10mb is a DoS vector — a single request can chew through memory. Tightened to 1mb: bulk imports of positions/trades/snapshots are well under that, and if a legitimate import ever 413s, the fix is to raise the constant deliberately rather than leave the ceiling open.

**The pattern:** Audit "temporary development knobs" periodically — generous limits meant for your local workflow become production security issues if forgotten.

---

### Env Var Drift Is Silent Until the Backing Code Moves

**The outage:** Prod dashboard suddenly showed "No data for YTD period". Backend `/health` was green, API docs were green, but `https://foliobuddy.xyz/api/v1/health/db` returned 404.

**The root cause:** `VITE_API_URL` in Vercel had been set to `/api` months ago. This worked fine because the backend mounted routes at both `/api/*` and `/api/v1/*`. When commit `8e3d09c` removed the legacy `/api/*` mount, the frontend started calling `/api/positions` — which the rewrite forwarded to `api.foliobuddy.xyz/api/positions` — 404. The frontend had no way to surface the mismatch; it just saw empty arrays and rendered empty states.

**The fix:** `vercel env rm VITE_API_URL && printf "/api/v1" | vercel env add`. Then `vercel deploy --prod`.

**The pattern:** Any env var the code doesn't re-validate on boot becomes a silent landmine when the code it points to changes. Three takeaways:

1. Don't leave partial paths in env vars (`/api`) — use the full resolved path the frontend will actually call (`/api/v1`). Ambiguity lets you silently point at a stale shape.
2. `DEPLOYMENT.md` now documents every prod env var as a source of truth, so dashboard-vs-code drift is visible in git history. Update it in the same commit as the dashboard change.
3. The post-deploy smoke check `curl https://foliobuddy.xyz/api/v1/health/db` exercises the full chain (Vercel edge → rewrite → backend → DB). Hitting `api.foliobuddy.xyz` direct would have hidden this — it was the rewrite pointing at the wrong path, not the backend.

---

### `echo` vs `printf` When Piping to `vercel env add`

Three different env vars in Vercel had trailing `\n` characters because they were set with `echo "value" | vercel env add`. `echo` appends a newline. Vercel stores the whole string including the newline. The stored value is still truthy, which is what made this insidious — `if (VITE_WS_BACKEND_URL)` passes, URL construction returns `https://api.foliobuddy.xyz\n`, and fetch throws a network error that looks identical to "backend is down".

**The fix:** Always use `printf` (no trailing newline):

```bash
printf "/api/v1" | vercel env add VITE_API_URL production
```

**The pattern:** When piping into any CLI that stores raw input, assume the newline matters. Works the same class for Coolify's UI if you paste values copied from a terminal that includes the trailing `\n`.

---

### Workspace Deps: Local Hoisting Masks Missing Declarations

**The bug:** After renaming `@pa-portfolio/shared` to `@foliobuddy/shared`, Vercel builds failed with `Cannot find module '@foliobuddy/shared'` — but local `npm run build` in `packages/frontend` worked fine.

**The root cause:** npm workspaces hoists workspace packages into the root `node_modules` by default, so TypeScript's module resolution finds `@foliobuddy/shared` via upward traversal even if the frontend's `package.json` doesn't declare it. Vercel's `npm ci` is stricter about workspace dependency graphs — if a consumer package imports a workspace dep that isn't declared, the build rejects it.

**The fix:** Add the explicit dep in `packages/frontend/package.json`:

```json
"dependencies": {
  "@foliobuddy/shared": "*"
}
```

**The safety net:** A new CI step catches this class of bug before Vercel does:

```yaml
- name: Verify workspace deps are declared
  run: npm ls --workspaces --depth=0
```

**The pattern:** "Works locally, fails on Vercel" is almost always about resolution assumptions. Local `npm install` and local `tsc` are _both_ forgiving in ways production environments aren't. Anything that relies on root `node_modules` hoisting, dev-only type overrides, or un-cleaned build caches is a candidate. Lock them down with a CI check instead of discovering them at deploy time.

### "Monorepo" Doesn't Mean "Shared Everywhere" — The Backend Docker Trap

**The bug:** During a /simplify pass I moved domain enums and constants (`AssetCategory`, `StorageType`, `USD_SGD_FALLBACK_RATE`, the `categoryGroup()` helper, etc.) from `packages/backend/src/lib/constants.ts` into `@foliobuddy/shared`, so the frontend wouldn't have to duplicate them. Backend `tsc --noEmit` passed, frontend typechecked clean, all 84 backend tests still green. Looked perfect. Was about to commit.

**The catch:** `packages/backend/Dockerfile` is the trap. It doesn't COPY the monorepo root — it `COPY package*.json ./` from the backend directory, then `npm install`. Inside the container there's no root `package.json`, no `packages/shared/` folder, nothing for npm workspaces to resolve. The compiled `dist/index.js` would still contain `from '@foliobuddy/shared'`, and Node at runtime would have no way to resolve it. Production would have crashed on the first import.

**The fix:** Revert the backend changes. Keep `@foliobuddy/shared` exporting the canonical enums for the frontend. Leave `packages/backend/src/lib/constants.ts` with its own copy and a header comment marking the intentional duplication. Sync manually when adding new domain enums.

**The lesson:** TypeScript typechecks resolve modules differently from Node at runtime. `tsc --noEmit` will happily follow the `types` field in a workspace package's `package.json` — even if that points to a `.ts` file Node could never execute. Local dev hides this because `tsx` (the watch runner) handles `.ts` mains fine. The crash window is the production Docker container.

The deeper lesson: "shared package" is not a property of the repo, it's a property of every consumer's build/deploy pipeline. Vercel pulls the whole repo, so frontend can share via shared. The backend's Dockerfile is package-isolated, so it cannot. The right question isn't "can these packages share types?" — it's "does every consumer's build context include the shared code?". If the answer is no, you have three choices: widen the Docker context, bundle shared in via a build step (esbuild/tsup), or duplicate. We chose duplication because the values rarely change and the alternatives all add operational complexity for a small DRY win.

**Catch-it-earlier idea:** A CI step that does `cd packages/backend && docker build .` would have caught this. We don't run it today because Docker-in-CI is slow and Coolify rebuilds anyway. The README and `CLAUDE.md` Gotchas now flag the trap in writing — second-best defense.

---

### Uptime as a Git-Committed Workflow

Rather than sign up for UptimeRobot (free tier requires an email address and a third-party with a questionable breach history), a GitHub Actions cron is sufficient for a personal tool. `.github/workflows/uptime.yml` runs every 10 minutes, hits `https://foliobuddy.xyz/api/v1/health/db` (full chain — Vercel edge → rewrite → backend → DB), and fails the job on non-200. GitHub's default workflow-failure emails go to the repo owner.

**The tradeoff:** GitHub may delay scheduled runs up to 15 min during heavy load, so real detection latency is closer to 10–25 min. Fine for a portfolio dashboard; not fine for sub-minute SLA monitoring. If a tighter interval ever matters, that's the point to graduate to a paid monitoring service — not before.

**Bonus:** The workflow lives in git, so the monitor itself is version-controlled, code-reviewable, and survives the monitoring provider going out of business.

---

### Edit Mode Currency Must Follow the Asset, Not the Storage Format

**The bug:** After adding SGD support for single-equity create, editing an SG stock (e.g. D05.SI) still displayed "Total Cost (USD)" with the raw USD number. Users entering a correction in what they thought was SGD would overwrite the stored cost with the wrong value.

**The root cause:** `costCurrency` had an `if (isEditing) return 'USD'` early return — a conservative shortcut to avoid the round-trip conversion problem. But correctness beats caution here: the display currency should always follow `asset.nativeCurrency`, regardless of edit/create mode.

**The fix:** Remove the early return and add a one-shot `useEffect` that converts the stored USD cost to SGD for display, gated on `portfolioSummary` being loaded (so the FX rate is real, not the 1.35 fallback). Submit path converts back to USD. Delta mode (Add/Reduce) follows the same currency convention.

**The pattern:** When a value is stored in a canonical unit (USD) but entered in a user-facing unit (SGD), the conversion layer must be symmetric — display and submit must use the _same rate at the same moment_. Using a fallback rate on mount and the real rate on save is how silent cost-basis drift gets introduced.

---

### Copy/Paste Round-Trip Needs to Carry Provider Wiring, Not Just Identity

**The bug:** A user could copy an equity position to JSON, paste it into the bulk import form, and see the row appear in the portfolio. But the new position would never show a market value — prices stayed `null` forever.

**The root cause:** The copy format only included `asset.{coingeckoId, symbol, name, category}`. For a coin, that's enough (CoinGecko price jobs key off `coingeckoId`). For an equity, the price scheduler needs `priceProvider: 'yahoo'` and `providerAssetId` (the Yahoo ticker). The bulk import endpoint was creating bare Asset rows without those fields, so Yahoo's scheduler had nothing to query.

**The fix:** Include `priceProvider`, `providerAssetId`, `nativeCurrency`, `exchange` in the copy format for non-coingecko assets. Backend bulk schema accepts these as optional; defaults to `yahoo` for EQUITY and `manual` for UNIT_TRUST when missing. Re-import of an existing symbol still wins (matched by symbol in the assetMap).

**The pattern:** A copy/paste feature that only preserves "what the thing is" (symbol + category) but not "how to price it" (provider + provider ID) is quietly lossy — it looks like it worked until a price refresh later when the user notices the row is frozen. When designing portable data formats, include every field needed for the receiving system to fully reconstitute behavior, not just identity.

---

### Yahoo's Search API Geolocates by Source IP — Even With `region=US`

**The bug:** Searching "EWY" (iShares MSCI South Korea ETF, NYSE Arca) from the live app returned only Santiago Stock Exchange cross-listings (`EWY.SN`, `EWYCL.SN`). Searching "QQQ" returned nothing. Both are canonical US ETFs.

**The investigation path:** First I assumed it was a `quoteType` filter — our code allowed only `'EQUITY'` and ETFs come back as `quoteType: 'ETF'`. Added ETF to the allowlist and ranked primary listings above cross-listings (exact match > no-suffix > prefix > other). Verified locally that Yahoo's raw `/v1/finance/search` endpoint returned `EWY` at the top for my query. Deployed. Still broken. Next hypothesis: passed `region=US&lang=en-US` explicitly to normalize — the `region` parameter controls localization but not IP-based result weighting. Still broken.

**The root cause:** The production host's egress IP was geolocated to Singapore. Yahoo's `/v1/finance/search` endpoint _geolocates the caller IP_ and region-filters results. US ETFs weren't in that region's result set, period — no parameter would change that.

**The fix:** Fall back to a direct `quote()` lookup when the search query looks like a ticker (`/^[A-Z0-9.-]{1,10}$/`) and no exact-symbol match appeared in results. Yahoo's `/v7/finance/quote` endpoint is _not_ IP-filtered — a deterministic symbol like QQQ resolves regardless of caller geography. The script now calls `yahoo.quote(upperQuery)` and, if it returns a valid EQUITY/ETF in a supported currency, prepends a synthetic search result. Covers ~every common case of a user typing a ticker they already know.

**The pattern:** When a third-party search API returns regionally weighted results and you need consistent behavior from any server location, don't try to bully the search endpoint. Use a deterministic lookup endpoint as a fallback for the narrow case that matters (exact symbol match). The two endpoints have different rate-limit pools, different IP filters, and different shapes — pick the right one for the job instead of fighting the wrong one.

---

### Backfilling Historical Snapshots Needs an Audit + Restore-Baseline Pattern, Not In-Place Deltas

**The problem:** I had six equity positions I'd been holding for weeks/months, but just entered them today. Every existing snapshot understated the portfolio by the equity value at the time — so the Dashboard chart showed a vertical cliff on today's date, and the YTD Start (Jan 1 snapshot) was missing ~$213K of holdings, making YTD P&L wildly overstated.

**The naive plan (wrong):** Iterate snapshots, look up each equity's historical price per snapshot date, add `quantity × price` to `totalValueUsd`, upsert `SnapshotPosition` rows. Simple delta math.

**Why that breaks:**

1. **No idempotency.** `SnapshotPosition` has no unique key on `(snapshotId, assetSymbol)`, so Prisma `.upsert()` isn't available. Even with manual delete-then-insert of target rows, pre-purchase _cash placeholders_ (for mid-year buys — e.g. "add $78.5K USD to totalValueUsd before EWY was bought") have no row to detect or subtract. Re-running the script double-adds.
2. **Wrong FX.** `YahooProvider.getHistoricalPrices().priceUsd` converts native prices using the _current_ stored USD/SGD rate, not the per-snapshot rate. For SG-native assets (D05.SI, LIONGLOB) this smears today's FX across months of history and gives the wrong USD attribution.
3. **Stale cached metrics.** Snapshot rows store `dailyReturn`, `weeklyReturn`, `monthlyReturn`, `ytdReturn`, `athValueUsd`, `btcOutperform`, `ethOutperform` — all computed off `totalValueUsd`. Updating totals without recomputing these leaves the History tab showing old percentages.
4. **Allocation drift.** `SnapshotPosition.allocation` is `valueUsd / totalValueUsd × 100`. Inserting new rows without rescaling existing rows breaks the invariant that allocations sum to 100%.

**The correct shape:**

- **Audit first, then apply.** Before any write, dump every affected snapshot's baseline totals + cached metrics + all `SnapshotPosition` rows to `scripts/audit-<iso>.json`. The apply phase computes deltas against the _captured baseline_, not current DB state. Re-running is deterministic regardless of how many times it was run. The audit file doubles as a deterministic rollback artifact (`--rollback <audit.json>` restores every column verbatim).
- **Restore-baseline-then-apply, not add-to-current.** For each snapshot: start from the audit baseline, subtract stale target-row contributions from baseline, compute new contributions, delete-then-insert target rows inside a transaction. Survives re-runs even without unique constraints.
- **Per-snapshot FX.** Use `snapshot.usdSgdRate` for the conversion, falling back to the latest `fxRate` row only when null. Keep SGD-native assets in native form until the conversion point.
- **Recompute cached metrics in a second pass.** After all totals are written, walk snapshots in timestamp order and rewrite `dailyReturn`, `weeklyReturn`, `monthlyReturn`, `ytdReturn`, `athValueUsd`, `btcOutperform`, `ethOutperform` using the same formulas `snapshotService` uses (returns as _percent × 100_; YTD anchor = first snapshot of that calendar year; outperformance = portfolio YTD% − BTC/ETH YTD% from the same anchor). `athValueUsd` is a running max across _all_ snapshots, not just affected ones.
- **Rescale all allocations.** After updating `totalValueUsd`, recompute `allocation` on _every_ `SnapshotPosition` in the affected snapshot — not just the target symbols. Percentages shift because the denominator changed.

**The cutoff.** Use `max(Position.createdAt)` across target positions as the cutoff. Snapshots strictly before cutoff need backfill; snapshots at/after are left alone because the normal snapshot system captured them correctly.

**Cash placeholders for mid-year buys.** For EWY (bought 2026-03-05 with $78.5K USD) and LIONGLOB (bought 2026-02-09 with SGD 100K), pre-purchase snapshots add the cash consideration to `totalValueUsd` _without_ creating a `SnapshotPosition` row — the user held cash at the time, not the security. Keeps totals flat across the purchase date instead of spiking, which is the whole point of the backfill.

**The pattern:** Any script that retroactively modifies time-series data with cached derived fields is really three scripts glued together: (1) capture an authoritative baseline _before_ any mutation, (2) apply changes against that baseline with per-item transactions, (3) recompute all derived/cached fields in a separate pass. Skipping any of the three means you're either destroying your rollback path, double-counting on re-runs, or leaving the UI showing stale numbers that look plausible but aren't.

---

### YTD Anchor Queries Must Be Year-Scoped or They Rot Silently

**The bug (latent):** `portfolioService.getSummary()` used the earliest-ever snapshot as the YTD baseline via `findFirst orderBy: timestamp asc` without a year filter. Works today because the dataset starts in 2026. Will silently pin YTD to a stale 2026 snapshot once 2027 rolls over, and every user will see a nonsensical "+300%" YTD P&L in January.

**The fix:** Scope the query to `timestamp >= Jan 1 UTC of the current year`, computed fresh on every request.

**The pattern:** Time-anchored queries (`earliest`, `latest`, `first of period`) need explicit period bounds. "First snapshot" without a year filter is a time bomb with a calendar-year fuse. Found during the backfill script design by asking "what happens in 8 months?" — worth asking any time you write `orderBy timestamp asc` without a `where` filter on the date range.

---

### The Equity Sub-Type Labels Were Telling Users the Wrong Story

**The UX bug:** The Equities form had sub-type toggles "Single" and "Fund-level." A user tried to add EWY (iShares MSCI South Korea ETF) and intuitively picked "Fund-level" because it's a fund. Wrong — Fund-level meant _unit trust_ (open-ended, NAV-based, PDF-ingested). ETFs trade on exchanges with tickers and live market prices, so they belong under "Single," which is what you'd never guess from the label.

**The fix:** Renamed "Single" → "Stock / ETF" and "Fund-level" → "Unit Trust." Enum values (`equityMode === 'single' | 'fund'`, `asset.category === 'EQUITY' | 'UNIT_TRUST'`) unchanged — labels only.

**The pattern:** "Single" was shorthand that made sense to the developer (single ticker = one instrument) but projected the wrong taxonomy to the user (single vs. fund = individual stock vs. ETF/fund of funds). When you find yourself writing help-tooltip copy that redefines a label, the label is wrong — rename, don't caption. Generic abstract terms ("single," "basic," "standard") almost always lose to concrete terms the user already uses ("stock," "ETF," "unit trust").

### Rank Performers by Dollars, Not Percent

**The UX bug:** Top Performers on the Dashboard had D05.SI in rank 1 at +200.71% / +$10,027, while HYPE sat in rank 4 despite being up +$62,542. Worst Performers had the symmetric issue — tiny positions down 90% outranked a real loss of −$20K on BTC. The list was sorted by `unrealizedPnLPct`, which rewards small-sample swings over actual P&L.

**The fix:** One-line Prisma change in `portfolioService.getTopPerformers` / `getWorstPerformers` — `orderBy: { unrealizedPnLPct }` → `orderBy: { unrealizedPnL }`. Top = desc, Worst = asc.

**The pattern:** "Top" on a portfolio dashboard should answer _"what moved my net worth?"_, not _"what had the biggest % move?"_. Percent is about volatility of the position; dollars are about impact on the portfolio. The `%` and `$` columns both still show in the card — the sort key is the editorial decision, and for a net-worth dashboard the answer is dollars. Whenever a ranked list surfaces %-based records for entries that have tiny dollar magnitude, the ranking is asking the wrong question.

### Dev Server Port Gotchas: Orphaned tsx-watch Children and Fallback-Port CORS

**The ops bug, part 1:** Restarted the backend between sessions by killing the npm wrapper. A later session ran `npm run dev` → `EADDRINUSE` on 4001, frontend fell back from 4000 to 4002. `TaskStop` on the wrapper doesn't reach the tsx-watch child (which is the actual Node process bound to 4001); it just stops the npm parent. To free the port you have to `netstat -ano | grep :4001 | awk '{print $5}'` to find the child PID and kill it directly.

**The ops bug, part 2:** Once the frontend is on a non-default port like 4002, every API call fails CORS because `ALLOWED_ORIGINS` is hardcoded to `http://localhost:4000`. The browser sees `net::ERR_FAILED` on every `/api/v1/*` endpoint, the DB-down banner lights up, and the dashboard looks broken even though the backend is healthy. The failure mode looks like "app is down" when it's really "CORS is shaped for one port."

**The pattern:** For any long-running dev script spawned through a parent (npm, pnpm, yarn, tsx watch, nodemon, vite), the process that holds the port is the grandchild, not the thing you started. TaskStop / Ctrl-C on the parent leaves the grandchild as an orphan listener. Standard fix: kill by PID from `netstat` output, don't rely on wrapper teardown. And CORS allowlists should include the fallback ports Vite will auto-pick (4000 → 4001 → 4002 …) — or at minimum 4000 and 4002, since 4001 collides with the backend and is always skipped anyway.

### Stale-Device Duplicate Work: Pull Before You Edit, Reset If You Diverge

**The bug:** Pulled `main` after working on a feature locally for one session, then continuing on a different device for four days. `git pull` errored — divergent branches, 4 local commits ahead and 46 remote commits ahead. Local commits added EQUITY / UNIT_TRUST / Yahoo / asset routes / unit-trust frontend support. Remote had landed the same four features with different field names (`priceProvider` vs `priceSource`, plus `providerAssetId`, `nativeCurrency`, `exchange`, `factsheetUrl`, `isin`) and 30+ follow-up commits building on its design (PDF import, NAV display, ETF search bug fixes, custody refinements, dashboard ranking).

**The diagnosis:** Compared local commit subjects against remote ones — every local commit had a remote counterpart with a richer implementation. Schema diff confirmed: same conceptual feature, two different shapes. Rebase would have meant resolving conflicts on every file in both directions, then merging two designs into a Frankenstein where neither side's invariants held.

**The fix:** Hard reset to remote, abandon the 4 local commits. Safety net: `git format-patch origin/main..main -o /tmp/<repo>-local-commits-backup/` saves each commit as an applyable `.patch` before the reset, and `git stash show -u -p > /tmp/<repo>-pre-reset-stash.patch` saves the stash. Then `git reset --hard origin/main && git stash drop`. Actual unique work in the abandoned set was tiny (one helper function not present in remote) — re-implemented as a fresh commit on top.

**The pattern:** Multi-device sync drift creates duplicate work when both devices independently implement the same feature with different shapes. Three rules out of this:

1. **Always pull before editing on a stale device.** The workspace CLAUDE.md already says this — running `cws` (or any sync script) before any config or feature work prevents the duplicate-implementation scenario entirely.
2. **When you discover divergence, inspect before reconciling.** A blind rebase or merge of two implementations of the same feature is almost always wrong. Diff the commit subjects against each other; if the topics overlap, the remote (more-recently-shipped) design usually wins because it has follow-up work attached.
3. **Save patch backups before destructive reset.** `git format-patch` for the commits, `git stash show -u -p` for working-tree state. Costs 5 seconds, lets you re-apply unique work as fresh commits if any of it survives the diff.

### Codex CLI: When `model = "<latest>"` in Config Outpaces the CLI Build

**The bug:** `/codex:review` failed with `The 'gpt-5.5' model requires a newer version of Codex. Please upgrade to the latest app or CLI and try again.` Ran `brew upgrade codex` (0.121.0 → 0.125.0). Same error.

**The root cause:** `~/.codex/config.toml` had `model = "gpt-5.5"`. Homebrew and npm both ship Codex CLI `0.125.0` (the latest stable), which doesn't recognize `gpt-5.5`. Support landed in the `0.126.0-alpha.X` pre-release series on GitHub Releases (~hours old when this hit) — `brew` doesn't track alphas. Repo evidence: a recent commit titled _"Update bundled OpenAI Docs skill for GPT-5.5"_ in that version range. So the CLI's error message was correct: it really did need a newer build than any package manager was shipping.

**The fix:** One-line config edit, `model = "gpt-5.4"` in `~/.codex/config.toml`. Bump back to `gpt-5.5` once `0.126.0` stable lands in Homebrew. Alternative was downloading the alpha tarball from GitHub and replacing `/opt/homebrew/bin/codex` directly — rejected because (a) brittle pre-release, (b) the next `brew upgrade codex` silently overwrites it back to stable.

**The pattern:** Three independent moving parts here, each with a different release cadence:

1. **The model** itself (released by OpenAI on their schedule).
2. **The CLI binary** that knows about the model (released on Codex's schedule).
3. **The package manager's pin** of that binary (released on Homebrew/npm's schedule, lagging both).

When the model is fresh and the package manager hasn't caught up, a `model = "gpt-X.Y"` setting in config becomes a time bomb. Symptom looks like a CLI bug ("upgrade your CLI"), but the actionable fix is either downgrade the model or install pre-release manually. Useful diagnostic when an LLM/CLI rejects a model name: check `gh release list --repo <vendor>/<cli>` for tags newer than what `brew info <cli>` reports — if there's a gap, the brew formula is the lag, not the CLI.

**Bonus pattern (LLM-specific):** When an LLM's "this doesn't exist" claim conflicts with the user's link to a vendor announcement, defer to the user. Training-data cutoffs and local model caches are stale by definition for new model releases — confidence based on those sources is unreliable for any "what's the latest X" question.

### Parsing PDF Tables: Anchor on the Predictable Block, Not the Visual Layout

**The bug:** Adding an FSMOne unit-trust statement parser. The statement looks like a clean table on screen — Product Name, Price, Payment Method, WAC, Quantity, Investment Amount, P/L, P/L %, Current Market Value — nine columns, neat rows. After `pdf-parse` extracts text the visual layout is gone:

```
Amova
Singapore
Equity SGD
(formerly
Nikko AM)
SGD
5.3036
Cash SGD
5.2663
18,988.66 SGD
100,000.00
SGD
708.26
0.71 SGD
100,708.26
```

The fund name spans five lines. Currency codes appear both inside the name (`Equity SGD`) and as column markers. `Cash` is sometimes a payment method, sometimes part of a fund name (`Cash Plus Fund`). Trying to reconstruct columns by counting tokens-per-row falls apart immediately because PDF text extraction doesn't preserve column boundaries — it interleaves vertically-aligned cells in reading order, which depends on the PDF's layout heuristics, not a stable grid.

**The fix:** Don't reconstruct rows. Find the part of the format that's _deterministic regardless of layout_, anchor a regex on it, and let everything else fall out positionally.

For each FSMOne holding, the value block always has the same shape: `priceCcy price PAYMENT wacCcy wac qty invCcy invAmt pnlCcy pnl pnl% mvCcy mv` — five 3-letter currency codes, seven decimal numbers, one payment-method token, in that exact order. That's a 13-token regex with no ambiguity:

```
([A-Z]{3})\s+([\d,]+\.\d+)\s+(\S+)\s+([A-Z]{3})\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+...
```

Run it as `/g`, collect all matches, and the fund name is _whatever text falls between the previous match's end and this match's start_. A multi-line name with embedded `SGD`s collapses to a single string because the regex won't match on a `SGD` followed by `(formerly` — only on a `SGD` followed by a number. The hardest part of the parsing problem disappears once the anchor is right.

The `Cash Plus Fund` / `Cash` payment-method ambiguity? Solved by trimming a known set of payment-method tokens (`Cash|RSP|CPF|SRS|IA`) from the _tail_ of the captured name string. Wrong by construction in pathological cases (a fund actually named "Cash") but correct for every iFAST product I'd find in practice.

**The pattern:** When parsing semi-structured text that's been mangled by an extractor, look for the most rigid sub-pattern — usually a fixed sequence of typed tokens (currencies + numbers, dates, codes). Anchor a regex there, treat everything outside it as soft text, and let positional rules handle ambiguity at the edges. Versus the alternative of trying to reverse-engineer the original table grid, which is fragile to every layout variation the source might use.

Applies beyond PDFs: scraping JSON-shaped logs out of unstructured stdout, pulling a known-format token sequence out of a chat transcript, parsing email subjects with embedded codes — same idea. Find the part you can match exactly, anchor there, treat the rest as the soft remainder.

**FSMOne-specific bonus:** the format omits ISINs (UOB Kay Hian includes them). The route's downstream Yahoo `searchByIsin` lookup is gated on `if (h.isin)`, so an empty ISIN naturally skips the lookup and the user wires up the Yahoo symbol manually after import. No code change needed — the gate was already defensive. Worth noting because "feature works because the next consumer was defensive" is the kind of accidental-correctness that's only obvious in hindsight, and might bite the next person who tightens the validation.

### Backfill Scripts as Ephemeral State, Not a Registry

**The bug:** Adding two new `AMOVASIN` positions (Amova Singapore Equity Fund, one in FSMOne and one in UOB Kay Hian — same fund, two brokers) to the prod snapshot history. Opened `backfill-equity-snapshots.ts` to add the entries. The `BACKFILLS` array already had six entries from prior runs (`D05.SI`, `S68.SI`, `OV8.SI`, `GLXY`, `EWY`, `LIONGLOB`). Initial instinct: "append the new ones, the script's docstring says re-running is idempotent."

**Why it isn't:** the script's idempotency claim is _within a single invocation_ — the audit captures a baseline snapshot total, then apply computes deltas relative to that captured baseline. Re-running mid-flight gives the same answer. But across separate `--apply` runs, the baseline captured the _second_ time already includes the _first_ run's modifications. Cash placeholders (`priorCashUsd`, `priorCashSgd`) are additive — they get added to `snapshot.totalValueUsd` whenever a snapshot's date is before the entry's `heldSince`. Re-applying with the same entry adds the same 100k SGD again. After two apply runs the Jan 1 snapshot would be 400k SGD heavier than it should be; YTD return tanks.

Caught it by inspecting `LionGlobal`'s prod quantity (`68_482.15`) vs the script's `BACKFILLS` value (`68_153.43`). The 328.72-unit gap is exactly the dividend reinvestment that landed _after_ the original backfill. So the script's six entries weren't a copy of prod state — they were the _input_ of the _previous_ backfill run, frozen in time. Treating them as a registry would have re-applied that delta on top of an already-modified DB.

**The fix:** rewrite `BACKFILLS` to _only_ the new entries (two `AMOVASIN` rows). Removing the old entries broke a hardcoded `BACKFILLS.find((b) => b.symbol === 'LIONGLOB')!` that prepared a Yahoo-fallback interpolation specifically for that one symbol. Generalised it: any symbol with `priorCashSgd + heldSince` and zero Yahoo points falls back to a `Map<symbol, InterpolationCfg>` keyed linear interpolation. Multiple entries on the same symbol (the FSMOne + UOB case) collapse to a weighted-average purchase NAV per symbol, since the historical NAV trajectory is shared across the brokers — only `quantity` and `heldSince` differ per entry.

**The pattern:** _additive_ migrations (anything that mutates state by `+= delta` rather than `:= absolute`) need stricter discipline than declarative ones. They're not idempotent, so the source has to either:

1. Be ephemeral input — rewritten per run, never a registry of past work (this script's choice)
2. Track a "last applied" cursor so re-runs skip already-applied entries
3. Convert to absolute states — record "what the snapshot total should be" rather than "delta to add"

(1) is fine for one-shot scripts because the audit JSON is the registry. The mental model: `BACKFILLS` is the _next migration to write_, not the migration _log_. The log is the audit files. Mixing the two — keeping old entries in `BACKFILLS` for "documentation" — is the failure mode.

**Multi-position-same-symbol bonus:** the script identifies positions by `symbol → asset → first-matching-position`, which would silently collapse two `Position` rows sharing one `assetId` into one. But the actual mutation path doesn't go through the position object — `computeContribution` reads `cfg.quantity` from the `BACKFILLS` entry directly, and `applyPlans` deletes by `(snapshotId, assetSymbol)` then `createMany`'s fresh rows from `newTargetPositions`. So two entries with the same symbol produce two `SnapshotPosition` rows per snapshot — exactly what we want. The first-position-wins lookup in the sanity-check loop is purely cosmetic (a quantity mismatch warning). Worth knowing because the obvious-looking "bug" — "you can't backfill two positions with the same symbol" — turns out not to be a bug at all, but only because the mutation path skips the lookup. Another instance of "feature works because the path that matters bypasses the path that doesn't."

---

## Best Practices That Paid Off

### 1. TypeScript Everywhere

Full TypeScript from database to UI. Prisma generates types from the schema. API types are shared. Refactoring is fearless.

```typescript
// One source of truth for Position
type Position = Prisma.PositionGetPayload<{
  include: { asset: true };
}>;
```

### 2. Validation at Boundaries

Never trust incoming data. Validate with Zod:

```typescript
const createPositionSchema = z.object({
  assetId: z.string().uuid(),
  quantity: z.number().positive(),
  averageCost: z.number().nonnegative(),
  storage: z.enum(['WALLET', 'CEX', 'DEFI', 'BANK']),
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
    queryClient.setQueryData(['positions'], (old) => [...old, { ...newPosition, id: 'temp-id' }]);

    return { previous };
  },
  onError: (err, _, context) => {
    // Rollback on error
    queryClient.setQueryData(['positions'], context.previous);
  },
  onSettled: () => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries(['positions']);
  },
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
throw new AppError('Position not found', 404, {
  positionId,
  userId,
  suggestion: 'Check the position ID is correct',
});
```

### 5. Advisory React Audits

React Doctor is useful as a second pair of eyes for the frontend, but it works best like a smoke detector, not an autopilot. The first scan surfaced exactly the kind of things humans tend to miss in a polished dashboard: comboboxes without complete ARIA wiring, click-only wrappers in table actions, and date work hiding inside render paths.

The useful pattern is:

```bash
npx -y react-doctor@0.1.4 packages/frontend --offline --full --fail-on none
```

Run it pinned and offline, then triage. Fix the user-facing stuff first: keyboard access, labels, ARIA relationships, and render correctness. Leave noisy mechanical guidance for a separate sweep. Otherwise you end up polishing the wrench while the sink is still dripping.

After the high-signal fixes, the remaining warnings were mostly policy friction: React 19 `forwardRef` migration nudges in a React 18 app, shadcn/Radix export patterns that look dead to a scanner, and design opinions that disagreed with FolioBuddy's existing visual system. The repo now keeps that decision in `react-doctor.config.json`. This makes the score useful again: if the configured scan drops below 100, assume it found something new enough to deserve attention, not just an old debate with a different hat.

### 6. Keep Component Files Component-Only

React Fast Refresh is happiest when `.tsx` files export components and type-only things, not a grab bag of runtime helpers. When a component also needs reusable math or clipboard formatting, move that into a plain `.ts` module and import it back.

Recent examples:

- `TradeLensViews.tsx` exports the UI, while `tradeLensModels.ts` exports ticker/monthly aggregation helpers.
- `PositionTable.tsx` renders the table, while `positionClipboard.ts` owns the portfolio JSON copy format.
- `button.tsx` keeps `buttonVariants` private because nothing outside the module needs that runtime export.

The payoff is small but real: Fast Refresh warnings stay meaningful, lint output stays quiet, and files tell you what kind of thing they are before you even open them.

### 7. Desktop Preferences Should Not Leak Into Mobile

The collapsible sidebar is a useful desktop preference, so it persists in localStorage. But mobile navigation has a different job: quick orientation and large touch targets. The shell keeps those modes separate with responsive classes — the persisted desktop rail only applies at `lg`, while the mobile drawer stays 256px wide with labels.

The pattern: persist preference, not layout dogma. A good setting remembers the user's intent, then adapts it to the device instead of blindly replaying pixels.

---

## Deployment: Public Shape

### Backend → Node API Host

The backend runs as a Dockerized Node service behind `https://api.foliobuddy.xyz`:

- **Dockerfile:** `packages/backend/Dockerfile` (multi-stage build, node:20-alpine)
- **Startup command:** `npx prisma migrate deploy && node dist/index.js`
- **Private ops note:** host IPs, dashboard URLs, app IDs, container IDs, and firewall details live outside the public repository.

**Deploying backend changes:** GitHub Actions workflow (`deploy-backend.yml`) auto-deploys on push to main when backend files change, then runs a health check to verify the new version is live.

**Important:** Provider "restart" and "deploy" actions may differ. Restart can reuse an old image; deploy should rebuild from source, run migrations, and start the new image.

### Database → PostgreSQL

The database is PostgreSQL on a private network. Exact hostnames, credentials, exposed ports, firewall rules, and backup locations belong in private ops notes, not the public repo.

**Why self-hosted instead of managed Postgres?**
We originally used a managed Postgres service, but wanted more control and cost savings. The important engineering lesson is to keep migrations reproducible and to verify which database URL production actually uses before moving data.

**Current production URLs:**

- Backend: `https://api.foliobuddy.xyz`
- Health check: `/health` returns `{"status":"ok"}`

### Database Backups

Automated backups run on a private schedule and write to private object storage. Public docs should describe the backup expectation, not bucket names, server paths, or restore commands.

### Frontend → Vercel

```json
// vercel.json (root)
{
  "rewrites": [{ "source": "/api/:path*", "destination": "https://api.foliobuddy.xyz/api/:path*" }]
}
```

**The API proxy pattern:** Frontend makes requests to `/api/*`, and the static host rewrites them to the backend API. This avoids CORS issues and keeps client configuration stable.

**Current production URL:**

- Frontend: `https://foliobuddy.xyz`

Vercel provides:

- Auto-deploy on push to main (frontend only)
- Preview deployments for PRs
- Automatic HTTPS
- SPA routing (all paths → index.html)

---

## What I'd Do Differently

### 1. ~~Start with a Design System~~ (Done!)

Ran a full design critique using the impeccable toolkit (scored 25/40), then executed a 9-skill design overhaul. The project now has: custom indigo-tinted color palette, Plus Jakarta Sans + JetBrains Mono fonts, `.impeccable.md` design context file, skeleton loading states, HelpTooltip components, and a coherent visual identity inspired by Linear/Raycast and Dune Analytics. Second critique pass (scored 29/40) focused on visual hierarchy: replaced Portfolio's 5-card summary grid with a hero Total Value layout matching Dashboard, moved destructive actions into overflow menus, surfaced key trade stats in collapsed headers, and added touch support for HelpTooltips.

Then a technical audit (scored 11/20) drove a comprehensive hardening pass across 43 files: ARIA combobox patterns on search dropdowns, keyboard-navigable tables and collapsible sections, CSS custom properties for profit/loss/warning/info tokens, centralized chart colors in `chartColors.ts`, Vite vendor chunk splitting (recharts/clerk/sentry/socket.io as separate chunks), lazy-loaded Dashboard, removed global refetchInterval polling, React.memo on PositionRow, flattened Settings/Investors page layouts, and safe dialog sizing for mobile. The lesson still stands: starting with a design system would have saved the retrofit.

### 2. ~~API Versioning~~ (Done!)

Added `/api/v1` prefix with backward-compatible legacy routes at `/api`. Frontend now uses `/api/v1` paths. Backend must deploy before frontend when versioning paths change.

### 3. ~~Integration Tests~~ (Done!)

We now have 68 backend tests: unit tests for utilities AND integration tests for route handlers (positions, trades, snapshots) using supertest with mocked Prisma. These verify computed fields, validation errors, ownership checks, and pagination. The remaining gap: end-to-end tests covering the full frontend→backend flow.

---

## Quality of Life Features

### Dark Mode

Implemented using Zustand with a simple light/dark toggle (no "system" option — keeps it simple).

**Key implementation details:**

- Theme is applied by adding/removing the `dark` class on `document.documentElement`
- A script in `index.html` runs before React loads to prevent flash of wrong theme
- Theme persists to localStorage via Zustand's `persist` middleware
- Default is `dark`

### Keyboard Shortcuts

Using `react-hotkeys-hook` for global keyboard shortcuts:

| Key            | Action                      |
| -------------- | --------------------------- |
| `D`            | Navigate to Dashboard       |
| `P`            | Navigate to Portfolio       |
| `T`            | Navigate to Trades          |
| `I`            | Navigate to Investors       |
| `S`            | Navigate to Settings        |
| `/`            | Toggle theme (light ↔ dark) |
| `Cmd/Ctrl + K` | Show shortcuts help modal   |

Shortcuts are disabled when typing in input fields via `enableOnFormTags: false`.

### Error Tracking with Sentry

Integrated Sentry for production error monitoring on both frontend and backend.

**Frontend:**

- Initializes only when `VITE_SENTRY_DSN` is set (silent skip in development)
- Includes browser tracing and session replay integrations
- Custom `ErrorFallback` component shows user-friendly error UI with error ID
- Wrap the entire app in `Sentry.ErrorBoundary`

**Backend:**

- `initSentry()` called before Express initialization so Sentry can auto-instrument
- `Sentry.captureException(err)` in errorHandler for unexpected 500-level errors only
- Skips Zod validation errors (400) and AppErrors with status < 500
- Gracefully skips when `SENTRY_DSN` env var is not set (safe for dev)

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
    "notes": "Spot",
    "custodyOf": "Mum"
  }
]
```

> `custodyOf` is optional — only included for positions held on behalf of others. Omit it (or set to null) for your own positions.

**Trade format (JSON):**

```json
[
  {
    "asset": {
      "coingeckoId": "bitcoin",
      "symbol": "BTC",
      "name": "Bitcoin",
      "category": "LIQUID_CRYPTO"
    },
    "direction": "LONG",
    "entryPrice": 50000,
    "exitPrice": 55000,
    "quantity": 0.1,
    "entryDate": "2024-01-15T10:00:00.000Z",
    "exitDate": "2024-01-20T10:00:00.000Z",
    "status": "CLOSED",
    "notes": "Test trade",
    "tags": ["swing"]
  }
]
```

**Snapshot format (JSON):**

```json
[
  {
    "timestamp": "2024-01-15T00:00:00.000Z",
    "snapshotType": "MANUAL",
    "source": "MANUAL",
    "totalValueUsd": 50000,
    "totalCostBasis": 40000,
    "notes": "Monthly checkpoint"
  }
]
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

| Icon      | Action                                 | Confirmation                       |
| --------- | -------------------------------------- | ---------------------------------- |
| 📋 Copy   | Copies item to clipboard               | Green checkmark feedback           |
| ✏️ Edit   | Opens edit dialog with form pre-filled | None (dialog has Cancel)           |
| 🗑️ Delete | Opens confirmation dialog              | "Are you sure?" with Cancel/Delete |

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

### Position Editing: correction vs accumulation

This workflow got better once we stopped pretending every edit is the same kind of edit.

- `Edit Totals` is for corrections
- `Add/Reduce Position` is for the normal "I bought more" or "I trimmed some" flow

`Add` asks for quantity plus either total cost or average cost, mirroring the create-position flow and deriving the other field live. Then it recalculates weighted average cost automatically. `Reduce` only asks for quantity and removes cost basis using the current average cost. The preview also moved from a loose inline display to a proper Old/New comparison table, because financial UI should make deltas obvious without making you squint.

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
      refetchInterval: 60000, // Still polls every 60s as fallback
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

- [x] **Add Sentry DSNs** - Added `SENTRY_DSN` to backend hosting and `VITE_SENTRY_DSN` to frontend hosting, both redeployed
- [x] **Migrate backend/database hosting** - Backend and database now run on the current production host
- [x] **Set up auto-deploy** - Added provider API credentials as GitHub secrets; `deploy-backend.yml` triggers on push to `packages/backend/**`

---

## The Road Ahead

Features I want to add:

- [ ] Mobile app (React Native, sharing the codebase)

Recently completed:

- [x] **Sticky action headers on data pages:** Portfolio, Trades, History, and Investors now use a shared `PageActionHeader`, so the Add/Log button stays pinned under the app shell while scrolling long tables. The important restraint: only the title/action row sticks, not the whole hero/stat block, so the page keeps breathing room.
- [x] **Audit follow-up for sticky/data-entry UX:** Dark primary indigo was nudged from `234 89% 67%` to `234 89% 62%` so white primary-button text clears AA contrast. Add/log dialogs now have screen-reader descriptions, the form mode switches use plain pressed segmented buttons instead of incomplete ARIA tabs, shared Radix tabs render as 44px mobile targets, and creatable-select focus moved from raw `autoFocus` to user-triggered ref focus. Lesson: measure contrast and tap targets in the browser, because the class name is only a promise until layout proves it.
- [x] **Comma-formatted amount inputs:** editable finance fields now behave the way money brains expect: type `10000`, see `10,000`, while the component still stores raw `"10000"` for calculations and API payloads. This runs through one shared `FormattedNumberInput` used by position amounts/costs, add/reduce adjustments, trade prices/quantity, snapshot values, investor capital, perp exposure, and NAV updates. Lesson: never let display commas leak into `parseFloat()` state; format at the edge and keep the data plain.
- [x] **Creatable storage dropdown options:** the old "Others" escape hatch is gone from position storage dropdowns. Exchanges, wallets, brokers, and banks now have a "+ Add new ..." row; once you add a name, it is selected immediately and persisted in localStorage for that storage bucket. Lesson: Radix Select can emit one last empty value after a create-style option closes, so the parent handler needs to ignore empty values or it will quietly wipe the freshly-created selection.
- [x] **SPX default benchmark + Yahoo history hardening:** the Portfolio % vs Benchmarks chart now defaults to BTC, ETH, and SPX. The SPX label uses Yahoo `SPY` as its provider series because the production host returns empty/error responses for Yahoo's index symbol `^GSPC`, while SPY history is reliable and tracks the same S&P 500 benchmark well for normalized percentage comparisons. The Yahoo provider still fetches historical data through `yahooFinance.chart()` before falling back to the raw chart endpoint. Lesson: a benchmark chip is a product choice as much as a ticker choice; on production, the durable series matters more than the prettiest symbol.
- [x] **Provider-aware dashboard benchmarks:** the Portfolio % vs Benchmarks chart can now add TradFi/index lines as well as crypto. BTC/ETH still use CoinGecko, while custom benchmarks store `provider` + `providerAssetId`; SPX is a first-class preset, with SPY/QQQ available as ETF examples. Demo mode mocks both the search result and price history, so `/dev/demo` is useful for checking the flow without a backend. Lesson: a benchmark is really a price series, not a coin. Once the UI thought in providers, SPX stopped being a weird exception.
- [x] **Allocation chart title totals:** the four dashboard donut cards now show compact USD totals in the title. Portfolio-wide donuts show total owned value, while Cash Breakdown shows total cash value and includes both fiat cash and stablecoins.
- [x] **Detailed allocation category drilldown:** the By Detailed Asset donut now has an `All / Crypto / Cash / Equities` selector. All preserves the old overview, while category selections switch to symbol-level breakdowns inside that bucket. Lesson: the same chart can stay overview-friendly by default and still answer "what exactly is inside this bucket?" without adding another card.
- [x] Cash taxonomy refresh: the old Stables add-position flow is now Cash, with Type = USDT/USDC/USDe/FDUSD/DAI/Cash (fiat), storage support for Broker account and Bank, shared broker options with Equities, and Cash-labeled portfolio/dashboard groupings
- [x] Exposure calculation widened from crypto-only to total market-risk exposure: all owned non-stable/non-cash assets plus local perps, excluding custody
- [x] Local-only `/dev/demo` route for authenticated UI testing with mocked API responses; lazy-loaded in dev so mock data does not ship to production bundles
- [x] Stateful demo-mode portfolio sandbox: `/dev/demo/portfolio` now supports in-browser add/edit/delete/import testing and resets on refresh
- [x] Position edit UX overhaul: `Add/Reduce Position` inside the existing pencil flow, with auto cost-basis handling and Old/New comparison table
- [x] Dashboard stat row refinement: owner investor selected by default when present, plus clickable `Exposure` card between YTD P&L and Live Positions
- [x] Security hardening: protected position/trade/investor mutations now enforce ownership on update/delete paths
- [x] WebSocket CORS hardening: exact origin matching instead of prefix matching
- [x] Major refactor: extract backend utilities (logger, constants, pagination, tradePnL) with unit tests
- [x] Major refactor: split large frontend components into focused modules (9 new components)
- [x] Add structured logging replacing all console.log, rate limiting, Prisma indexes
- [x] Add optimistic deletes, pagination hooks, lazy-loaded routes
- [x] Add Prettier + ESLint config, GitHub Actions CI
- [x] Database migration from Railway Postgres to self-hosted Coolify/DigitalOcean
- [x] Backend migration from Railway to Coolify (Docker container on same DO droplet)
- [x] Copy/paste for trades with bulk import API endpoint
- [x] Edit/delete action buttons per trade row
- [x] Unified copy format across Portfolio, Trades, and History tabs
- [x] Copy/paste positions between accounts with JSON format
- [x] Real-time WebSocket updates with Socket.io
- [x] Dark mode with system preference detection
- [x] Keyboard shortcuts for power users
- [x] Sentry error tracking for production monitoring (frontend + backend)
- [x] Integration tests for route handlers (positions, trades, snapshots — 23 tests incl. 6 custody-specific)
- [x] Local Postgres via Docker with production data sync script
- [x] CSV export buttons on Portfolio and Trades pages
- [x] Responsive mobile design (iOS HIG-inspired) with column toggle, touch targets, overflow menus
- [x] Colored accent section headers (Crypto=blue, Cash=green) with icons on CollapsibleCard
- [x] Trade stats card redesign: expectancy, R:R ratio, visual win rate bar, avg win/loss comparison, best/worst trades
- [x] P&L by Ticker card: aggregated per-ticker stats (trades, win rate, total P&L) with click-to-filter, collapsible
- [x] Trade Analytics + P&L by Ticker cards collapsible by default (using CollapsibleCard)
- [x] Hover tooltips with formula definitions on trade stat metrics
- [x] Trade form defaults: entry date = 5 days ago, exit date = today (optimized for logging closed trades)
- [x] Frontend-only dev mode: point VITE_API_URL at prod Coolify backend (localhost:4000 in ALLOWED_ORIGINS)
- [x] Benchmark chart fix: BTC/ETH lines now normalize from portfolio start date, with binary search and dynamic thresholds
- [x] Chart UI polish: 0% reference line on benchmark chart, starting value reference on portfolio chart, end-of-line value labels
- [x] Chart loading indicators: centered "Loading..." overlay when switching time periods (uses `isFetching` for refetch detection)
- [x] Dashboard stat cards: "Live Positions" + "Closed Trades" as clickable links, compact 4-column layout, inline YTD %
- [x] Simplified theme toggle: removed "system" option, light/dark only
- [x] Configurable rate limiting: `RATE_LIMIT_MAX` env var (10000 for dev, 200 default for prod)
- [x] Pie chart color diversity: maximally distinct hues per chart slice, avoiding benchmark line colors
- [x] Custody positions: "Held for Others" section — track crypto held for other people, excluded from net worth/P&L/snapshots, checkbox+dropdown UX with localStorage name persistence
- [x] Dashboard UI refresh (inspired by Variant community references): gradient fill on portfolio value chart (LineChart → AreaChart), allocation charts reworked to donut + side legend layout with center labels, clickable legend percentages recalculate for visible items, Net Worth card gradient upgrade, "vs 30D ago" period comparison on Net Worth card
- [x] Rebrand from "PA Portfolio" to "FolioBuddy": new growth-chart SVG logo (favicon + sidebar icon), updated all user-facing text, package scope → `@foliobuddy/*`. GitHub repo renamed to `foliobuddy`.
- [x] **14-item architecture improvement sweep:**
  - Domain constants (AssetCategory, StorageType, TradeDirection, etc.) replacing magic strings
  - Generic TTLCache utility with LRU eviction (priceService 528→355 lines)
  - Consolidated portfolioService with single `getOwnedPositions()` + `Promise.all`
  - PriceHistory cleanup cron (90-day retention, daily 2am UTC)
  - Optimized `updatePositionValues` — filters by changed asset IDs only
  - Removed startup ALTER TABLE hack
  - Cleaned up YTD debug logging
  - API versioning (`/api/v1` with backward-compat legacy routes)
  - Frontend type extraction (`api.ts` split into `api.ts` + `types.ts`)
  - Shared types package (`@pa-portfolio/shared`)
  - WebSocket URL fix (removed hardcoded Railway fallback, env-var based)
  - Frontend unit tests (24 tests for hooks + key components)
  - Playwright E2E smoke tests (health, app load, auth redirect)
  - Deploy workflow health check with timeout
- [x] Clickable snapshot rows: entire AUTOMATIC row toggles expand/collapse, not just chevron
- [x] **Design overhaul (impeccable critique → 9-skill execution):**
  - Indigo-tinted color palette replacing stock shadcn/ui grays (light + dark modes)
  - Plus Jakarta Sans + JetBrains Mono fonts via Google Fonts
  - Net Worth Card: borderless hero section with large typography (removed gradient Card)
  - Dashboard/History stat strips replacing Card grids (borderless flex layout)
  - Sidebar: Linear-style tinted active state with border accent (removed solid block)
  - Shimmer skeleton loading states on all pages and chart components
  - HelpTooltip component on finance-specific labels (YTD Start, Exposure, CEX, etc.)
  - Improved empty states: icon + heading + descriptive text + CTA button
  - Emerald profit colors, thinner scrollbars, `.impeccable.md` design context
- [x] **Dashboard polish (critique follow-up):**
  - Merged stat strip into NetWorthCard (6-column grid with HelpTooltips, investor label)
  - PerformersCard restyled borderless (no Card wrapper, divide-y list)
  - Allocation chart hover: replaced Recharts Tooltip with inline header info (avoids overlap)
  - Benchmark chart: fixed Portfolio legend color to #64748B slate (matching line)
  - Staggered fade-in-up entrance animations on Dashboard, History, Investors
  - Normalized all page headers to `text-2xl font-bold` with `size="sm"` buttons
  - Animated number tickers (`useAnimatedNumber` hook) for Net Worth, P&L, Cost Basis values
  - Compact dollar formatting (`compactUsd`) on allocation chart hover to prevent truncation
- [x] **Allocation charts split for equities (4-up):**
  - Added new high-level "By Asset" donut (Crypto / Equities / Cash) using `bucketFor()` over `categoryGroup()` — both `EQUITY` and `UNIT_TRUST` fold into Equities, while `STABLECOIN` and `CASH` display as Cash
  - Renamed the original detailed donut to "By Detailed Asset" — now also bundles Equities (alongside the Cash bundle), so a portfolio with many small equity tickers stays readable
  - Layout: `grid sm:grid-cols-2 lg:grid-cols-4`. At lg+ the legend stacks below the donut so labels fit in narrow cards (`flex-col sm:flex-row lg:flex-col`)
  - Hover label moved to its own line directly under the card title with `min-h-[16px]` reserved — fixes the truncation/congestion in the title row and stops the donut shifting on hover/leave
  - Lesson: when adding a wider grid breakpoint inside cards that have donut + side legend, recheck whether legend labels still fit at the new column width before shipping. The intermediate "row of 4 with side legend" state truncated every label.
- [x] **Max chart range fix:**
  - `getDateRange('Max')` now sends an explicit `all=true` flag to `/snapshots/performance`, and the backend treats that as "all snapshots" instead of defaulting to 30 days.
  - Lesson: an empty query object is not a mode when the route has defaults. Name the intent in the request, especially for dashboard range selectors where "Max" and "default" mean very different things.
- [x] **Richer dev demo data for chart and allocation testing:**
  - `/dev/demo` now seeds a longer all-time performance curve from 2024 through June 2026 and the mock `/snapshots/performance` endpoint filters by `days`, `from`, `to`, and `all=true`, so the Max selector can be tested against visibly older points.
  - Seeded positions now cover crypto, equities, unit trust, stablecoins, USD/SGD cash, NFT/angel-style alternatives, CEX, DeFi/onchain, bank, brokerage, and custody. This gives the allocation donuts and Portfolio section grouping a better little workout.
  - While validating, chart dot renderers got stable keys and portfolio collapsible headers were adjusted to keep tooltip/action buttons outside trigger buttons, clearing noisy React console warnings.
- [x] **Impeccable audit cleanup pass:**
  - Chart colors moved from literal hex strings to theme-aware OKLCH CSS variables, with separate foreground tokens for benchmark labels and chips. The charts still feel like FolioBuddy, but now the palette belongs to the design system instead of each component freelancing.
  - Profit/loss colors now use contrast-safe foreground tokens, and import/live-row success states reuse those semantic classes instead of hard-coded green/red utilities.
  - The old colored side-stripe accents are gone. Portfolio sections and sidebar active state now use full hairline borders plus subtle surface tints, which keeps the affordance without the banned stripe pattern.
  - Mobile hit areas were hardened across shared buttons, help tooltips, sortable table headers, allocation legends, and dense row actions. The sneaky bit: a `w-11` class can still render narrower inside a flex/table cell unless the button also has `shrink-0`.
  - React Doctor is back to a 99/100 advisory score with only the known demo-mode `apiMockReady` false positive. The previous array-index key warnings were cleaned up with named skeleton keys and timestamp-based chart dot keys.
  - Lesson: verify touch targets from rendered bounding boxes, not from class names. The class can say 44px while layout says "nice try."
- [x] **Impeccable context migration documented:**
  - Current impeccable reads `PRODUCT.md` for strategic context and optional `DESIGN.md` for visual-system details. The older `.impeccable.md` file was a legacy format, not a separate Claude-only source of truth.
  - AGENTS/CLAUDE now say not to recreate or maintain both files. If an old tool asks for `.impeccable.md`, point it at `PRODUCT.md` or update that tool; symlinks add Windows/Git friction without much benefit here.
- [x] **Editable storage location menus:**
  - Broker, exchange, wallet, and bank dropdowns show row-level pencil/trash controls only for custom saved options. Defaults are protected and cannot be edited or removed from the menu.
  - Brokerage defaults are standardized across equities and cash broker storage as alphabetized `FSMOne`, `IBKR`, `Tiger`, and `UOB KH`; cash bank storage uses alphabetized `Citi`, `DBS`, `SCB`, `Trust+`, and `UOB`.
  - Cash (fiat) now has a storage-type validity guard in `PositionForm`, so switching Type cannot leave the location dropdown showing crypto-only wallet/exchange options.
  - Shared Radix `SelectContent` now lets the popper viewport size to option content and sit above dialog layers, fixing dropdown menus that looked open but were visually clipped behind the next form fields.
  - `positionOptions.ts` now ignores the old `__managedBuckets` flag and treats localStorage as custom-only again, so defaults always merge back in while user-added entries remain manageable.
  - Lesson: if a list contains product defaults and user customizations, keep those concepts separate in storage and UI. Otherwise a convenience edit affordance can accidentally make the product's vocabulary mutable.
- [x] **No-mistakes baseline cleanup:**
  - Demo mode still installs the browser fetch mock before rendering child routes, but the readiness flag now flips on a short timer after installation. That keeps React Query from racing the mock while satisfying the `set-state-in-effect` lint rule.
  - `FormattedNumberInput` moved its pure sanitize/format helpers into `formatted-number-input-utils.ts`, so the component file only exports the component and Fast Refresh stops complaining.
  - `@foliobuddy/shared` now has a lightweight `build` script (`tsc --noEmit`), so the root workspace build no longer fails on the source-only shared package after backend/frontend have already built.
  - Repo-wide Prettier was applied as a separate hygiene sweep, and `scripts:check` now uses a portable Node wrapper that still runs `bash -n` when Bash exists but skips cleanly on Windows without a WSL distro. Lesson: formatting debt is harmless until a gate asks the whole repo to be clean, then suddenly it becomes everybody's chore.
- [x] **Equities grouped by broker:**
  - The Equities card now defaults to grouping positions by broker/fund platform, with a persisted `By Broker` / `By Type` header toggle for switching back to the Stock/ETF vs Unit Trust split.
  - Unit trusts stay inside their broker group and carry a small `Unit Trust` badge, so the broker view answers "what do I hold at each place?" without hiding the fund type.
  - Lesson: when a table has dynamic group counts, do not call sorting hooks inside a loop. Use one shared sort state for the grouped view, then regroup the sorted rows by stable broker keys.
- [x] **Portfolio numbers refresh on tab focus:**
  - Dashboard, Portfolio, performer, performance-history, and benchmark queries now opt into React Query focus/reconnect refetches while the global default remains calm for the rest of the app.
  - This means stale money figures pull fresh calculations when Chrome regains focus, even if the WebSocket path was disconnected or missed an update.
  - Lesson: real-time push is lovely, but portfolio software also needs a boring recovery path for the moment a user returns to a sleepy browser tab.

---

## Final Reflections

Building your own tools teaches you things no tutorial can. You understand why frameworks exist. You appreciate good abstractions. You develop intuition for where bugs hide.

This project started as "I want to see my net worth." It became a full portfolio management system. That's the nature of software—scope creeps because understanding deepens.

The most important lesson? **Ship early, iterate often.** Version 1 was ugly and barely functional. But it worked. Each version got better because I was using it daily and feeling the pain points.

Your portfolio dashboard doesn't need to be perfect. It needs to be _yours_.

---

_Built with TypeScript, Tailwind, and too much coffee. [FolioBuddy](https://github.com/n3moxyz/foliobuddy)._
