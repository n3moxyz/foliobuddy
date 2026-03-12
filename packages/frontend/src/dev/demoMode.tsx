import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ShortcutsHelpModal } from '@/components/layout/ShortcutsHelpModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useThemeEffect } from '@/hooks/useThemeEffect';
import {
  setTokenGetter,
  type Asset,
  type AssetPrice,
  type BenchmarkHistoricalData,
  type DbHealth,
  type FxRate,
  type Investor,
  type PerformancePoint,
  type PortfolioSummary,
  type Snapshot,
  type SnapshotPosition,
  type Trade,
  type TradeAnalytics,
} from '@/lib/api';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Portfolio = lazy(() => import('@/pages/Portfolio'));
const Trades = lazy(() => import('@/pages/Trades'));
const History = lazy(() => import('@/pages/History'));
const Investors = lazy(() => import('@/pages/Investors'));
const Settings = lazy(() => import('@/pages/Settings'));

const NOW = '2026-03-12T12:00:00.000Z';

const assets: Asset[] = [
  { id: 'btc', coingeckoId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', category: 'LIQUID_CRYPTO', currentPriceUsd: 81250, priceUpdatedAt: NOW },
  { id: 'eth', coingeckoId: 'ethereum', symbol: 'ETH', name: 'Ethereum', category: 'LIQUID_CRYPTO', currentPriceUsd: 4320, priceUpdatedAt: NOW },
  { id: 'sol', coingeckoId: 'solana', symbol: 'SOL', name: 'Solana', category: 'LIQUID_CRYPTO', currentPriceUsd: 178, priceUpdatedAt: NOW },
  { id: 'usdc', coingeckoId: 'usd-coin', symbol: 'USDC', name: 'USD Coin', category: 'STABLECOIN', currentPriceUsd: 1, priceUpdatedAt: NOW },
  { id: 'cash-sgd', coingeckoId: null, symbol: 'SGD', name: 'Cash SGD', category: 'CASH', currentPriceUsd: 0.74, priceUpdatedAt: NOW },
];

const positions = [
  {
    id: 'pos-btc',
    assetId: 'btc',
    asset: assets[0],
    quantity: 1.42,
    avgCostUsd: 52300,
    storageType: 'WALLET',
    storageLocation: 'Ledger Flex',
    notes: 'Core long-term holding',
    custodyOf: null,
    marketValueUsd: 115375,
    unrealizedPnL: 41009,
    unrealizedPnLPct: 55.1,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-eth',
    assetId: 'eth',
    asset: assets[1],
    quantity: 11.8,
    avgCostUsd: 2850,
    storageType: 'WALLET',
    storageLocation: 'Rabby',
    notes: 'Liquid staking stack',
    custodyOf: null,
    marketValueUsd: 50976,
    unrealizedPnL: 17346,
    unrealizedPnLPct: 51.5,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-sol',
    assetId: 'sol',
    asset: assets[2],
    quantity: 220,
    avgCostUsd: 132,
    storageType: 'CEX',
    storageLocation: 'Bybit',
    notes: null,
    custodyOf: null,
    marketValueUsd: 39160,
    unrealizedPnL: 10120,
    unrealizedPnLPct: 34.9,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-usdc',
    assetId: 'usdc',
    asset: assets[3],
    quantity: 24500,
    avgCostUsd: 1,
    storageType: 'CEX',
    storageLocation: 'Binance',
    notes: 'Dry powder',
    custodyOf: null,
    marketValueUsd: 24500,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-custody-btc',
    assetId: 'btc',
    asset: assets[0],
    quantity: 0.23,
    avgCostUsd: 47800,
    storageType: 'WALLET',
    storageLocation: 'Ledger Nano',
    notes: 'Held for family office',
    custodyOf: 'Family Office',
    marketValueUsd: 18687.5,
    unrealizedPnL: 7693.5,
    unrealizedPnLPct: 69.9,
    createdAt: NOW,
    updatedAt: NOW,
  },
];

const summary: PortfolioSummary = {
  totalValueUsd: 230011,
  totalValueSgd: 309835,
  totalCostBasis: 156250,
  unrealizedPnL: 73761,
  unrealizedPnLPct: 47.2,
  positionCount: positions.length,
  lastUpdated: NOW,
  ytdStartDate: '2026-01-01T00:00:00.000Z',
};

const investors: Investor[] = [
  {
    id: 'inv-owner',
    name: 'Nemo',
    stakePercentage: 62.5,
    initialCapital: 120000,
    currentValue: 143219,
    capitalAtYearStart: 109820,
    ytdReturn: 33399,
    ytdReturnPct: 30.4,
    joinDate: '2024-01-01T00:00:00.000Z',
    notes: null,
    isOwner: true,
  },
  {
    id: 'inv-avery',
    name: 'Avery',
    stakePercentage: 25,
    initialCapital: 45000,
    currentValue: 57288,
    capitalAtYearStart: 43928,
    ytdReturn: 13360,
    ytdReturnPct: 30.4,
    joinDate: '2024-02-15T00:00:00.000Z',
    notes: null,
    isOwner: false,
  },
  {
    id: 'inv-june',
    name: 'June',
    stakePercentage: 12.5,
    initialCapital: 22000,
    currentValue: 28644,
    capitalAtYearStart: 21964,
    ytdReturn: 6680,
    ytdReturnPct: 30.4,
    joinDate: '2024-06-01T00:00:00.000Z',
    notes: null,
    isOwner: false,
  },
];

const trades: Trade[] = [
  {
    id: 'trade-1',
    assetId: 'btc',
    asset: assets[0],
    direction: 'LONG',
    entryPrice: 67200,
    exitPrice: 78100,
    quantity: 0.5,
    positionSizeUsd: 33600,
    entryDate: '2026-01-10T00:00:00.000Z',
    exitDate: '2026-02-04T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: 5450,
    realizedPnLPct: 16.2,
    notes: 'Range reclaim breakout',
    tags: 'swing,btc',
  },
  {
    id: 'trade-2',
    assetId: 'eth',
    asset: assets[1],
    direction: 'LONG',
    entryPrice: 3180,
    exitPrice: 4025,
    quantity: 4,
    positionSizeUsd: 12720,
    entryDate: '2026-01-21T00:00:00.000Z',
    exitDate: '2026-02-20T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: 3380,
    realizedPnLPct: 26.6,
    notes: null,
    tags: 'eth',
  },
  {
    id: 'trade-3',
    assetId: 'sol',
    asset: assets[2],
    direction: 'SHORT',
    entryPrice: 192,
    exitPrice: 201,
    quantity: 85,
    positionSizeUsd: 16320,
    entryDate: '2026-02-28T00:00:00.000Z',
    exitDate: '2026-03-02T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: -765,
    realizedPnLPct: -4.7,
    notes: 'Countertrend scalp',
    tags: 'sol,short',
  },
  {
    id: 'trade-4',
    assetId: 'sol',
    asset: assets[2],
    direction: 'LONG',
    entryPrice: 166,
    exitPrice: null,
    quantity: 120,
    positionSizeUsd: 19920,
    entryDate: '2026-03-05T00:00:00.000Z',
    exitDate: null,
    status: 'OPEN',
    realizedPnL: null,
    realizedPnLPct: null,
    notes: 'Open trend follow',
    tags: 'open,trend',
  },
];

const tradeAnalytics: TradeAnalytics = {
  totalTrades: 3,
  winningTrades: 2,
  losingTrades: 1,
  winRate: 66.7,
  totalPnL: 8065,
  avgPnL: 2688,
  profitFactor: 11.54,
  avgWin: 4415,
  avgLoss: 765,
  breakdown: {
    long: { count: 2, winRate: 100, pnl: 8830 },
    short: { count: 1, winRate: 0, pnl: -765 },
  },
  bestTrade: { id: 'trade-1', asset: 'BTC', pnl: 5450, pnlPct: 16.2, date: '2026-02-04T00:00:00.000Z' },
  worstTrade: { id: 'trade-3', asset: 'SOL', pnl: -765, pnlPct: -4.7, date: '2026-03-02T00:00:00.000Z' },
  monthlyBreakdown: [
    { month: 'Jan 2026', pnl: 0, count: 0, winRate: 0 },
    { month: 'Feb 2026', pnl: 8065, count: 3, winRate: 66.7 },
  ],
};

const snapshots: Snapshot[] = [
  {
    id: 'snap-1',
    timestamp: '2026-03-01T13:00:00.000Z',
    snapshotType: 'MONTHLY',
    source: 'MANUAL',
    totalValueUsd: 198400,
    totalValueSgd: 266850,
    usdSgdRate: 1.345,
    totalCostBasis: 156250,
    monthlyReturn: 0,
    ytdReturn: 26.9,
    btcOutperform: 3.8,
    ethOutperform: 0.5,
    notes: 'Month-open rebalance',
  },
  {
    id: 'snap-2',
    timestamp: '2026-03-10T13:00:00.000Z',
    snapshotType: 'DAILY',
    source: 'AUTOMATIC',
    totalValueUsd: 210400,
    totalValueSgd: 283040,
    usdSgdRate: 1.345,
    totalCostBasis: 156250,
    monthlyReturn: 4.2,
    ytdReturn: 34.7,
    btcOutperform: 5.4,
    ethOutperform: -1.1,
    notes: null,
  },
  {
    id: 'snap-3',
    timestamp: '2026-03-11T13:00:00.000Z',
    snapshotType: 'DAILY',
    source: 'AUTOMATIC',
    totalValueUsd: 218900,
    totalValueSgd: 294072,
    usdSgdRate: 1.3435,
    totalCostBasis: 156250,
    monthlyReturn: 8.4,
    ytdReturn: 40.1,
    btcOutperform: 8.1,
    ethOutperform: 2.4,
    notes: null,
  },
];

const snapshotPositions: Record<string, SnapshotPosition[]> = {
  'snap-2': [
    { id: 'sp-1', snapshotId: 'snap-2', assetSymbol: 'BTC', quantity: 1.42, priceUsd: 80400, valueUsd: 114168, allocation: 54.3, asset: assets[0] },
    { id: 'sp-2', snapshotId: 'snap-2', assetSymbol: 'ETH', quantity: 11.8, priceUsd: 4210, valueUsd: 49678, allocation: 23.6, asset: assets[1] },
    { id: 'sp-3', snapshotId: 'snap-2', assetSymbol: 'USDC', quantity: 24500, priceUsd: 1, valueUsd: 24500, allocation: 11.6, asset: assets[3] },
  ],
  'snap-3': [
    { id: 'sp-4', snapshotId: 'snap-3', assetSymbol: 'BTC', quantity: 1.42, priceUsd: 81250, valueUsd: 115375, allocation: 52.7, asset: assets[0] },
    { id: 'sp-5', snapshotId: 'snap-3', assetSymbol: 'ETH', quantity: 11.8, priceUsd: 4320, valueUsd: 50976, allocation: 23.3, asset: assets[1] },
    { id: 'sp-6', snapshotId: 'snap-3', assetSymbol: 'SOL', quantity: 220, priceUsd: 178, valueUsd: 39160, allocation: 17.9, asset: assets[2] },
  ],
};

const performance: PerformancePoint[] = [
  { timestamp: '2026-02-12T13:00:00.000Z', totalValueUsd: 168200, totalValueSgd: 226230, unrealizedPnL: 11950, btcPrice: 72100, ethPrice: 3320 },
  { timestamp: '2026-02-19T13:00:00.000Z', totalValueUsd: 176950, totalValueSgd: 238018, unrealizedPnL: 20700, btcPrice: 74420, ethPrice: 3510 },
  { timestamp: '2026-02-26T13:00:00.000Z', totalValueUsd: 189300, totalValueSgd: 254805, unrealizedPnL: 33050, btcPrice: 76810, ethPrice: 3890 },
  { timestamp: '2026-03-05T13:00:00.000Z', totalValueUsd: 202480, totalValueSgd: 272337, unrealizedPnL: 46230, btcPrice: 79120, ethPrice: 4075 },
  { timestamp: '2026-03-10T13:00:00.000Z', totalValueUsd: 210400, totalValueSgd: 283040, unrealizedPnL: 54150, btcPrice: 80400, ethPrice: 4210 },
  { timestamp: '2026-03-11T13:00:00.000Z', totalValueUsd: 218900, totalValueSgd: 294072, unrealizedPnL: 62650, btcPrice: 81250, ethPrice: 4320 },
];

const dbHealth: DbHealth = { status: 'ok', latency_ms: 22 };
const fxRates: FxRate[] = [{ id: 'usd-sgd', fromCcy: 'USD', toCcy: 'SGD', rate: 1.3471, timestamp: NOW }];
const currentPrices: AssetPrice[] = assets.map((asset) => ({
  id: asset.id,
  symbol: asset.symbol,
  name: asset.name,
  coingeckoId: asset.coingeckoId,
  currentPriceUsd: asset.currentPriceUsd,
  priceUpdatedAt: asset.priceUpdatedAt,
}));

function benchmarkHistory(id: string): BenchmarkHistoricalData {
  const starts: Record<string, number> = {
    bitcoin: 72100,
    ethereum: 3320,
    chainlink: 19,
    hyperliquid: 8,
    solana: 152,
  };
  const start = starts[id] ?? 100;
  return {
    coingeckoId: id,
    days: 30,
    data: performance.map((point, index) => ({
      timestamp: new Date(point.timestamp).getTime(),
      price: Math.round((start + index * start * 0.018 + Math.sin(index * 0.7) * start * 0.01) * 100) / 100,
    })),
  };
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseUrl(input: string | URL | Request) {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(raw, window.location.origin);
}

function filterTrades(url: URL) {
  const status = url.searchParams.get('status');
  return status ? trades.filter((trade) => trade.status === status) : trades;
}

function handleDemoApi(url: URL, method: string) {
  const path = url.pathname;

  if (path === '/api/positions' && method === 'GET') return json(positions);
  if (path === '/api/positions/summary' && method === 'GET') return json(summary);
  if (path === '/api/positions/performers/top' && method === 'GET') {
    return json([
      { assetId: 'btc', symbol: 'BTC', name: 'Bitcoin', unrealizedPnL: 41009, unrealizedPnLPct: 55.1, marketValueUsd: 115375 },
      { assetId: 'eth', symbol: 'ETH', name: 'Ethereum', unrealizedPnL: 17346, unrealizedPnLPct: 51.5, marketValueUsd: 50976 },
      { assetId: 'sol', symbol: 'SOL', name: 'Solana', unrealizedPnL: 10120, unrealizedPnLPct: 34.9, marketValueUsd: 39160 },
    ]);
  }
  if (path === '/api/positions/performers/worst' && method === 'GET') {
    return json([
      { assetId: 'usdc', symbol: 'USDC', name: 'USD Coin', unrealizedPnL: 0, unrealizedPnLPct: 0, marketValueUsd: 24500 },
      { assetId: 'sol', symbol: 'SOL', name: 'Solana', unrealizedPnL: 10120, unrealizedPnLPct: 34.9, marketValueUsd: 39160 },
    ]);
  }
  if (path === '/api/trades' && method === 'GET') return json(filterTrades(url));
  if (path === '/api/trades/analytics' && method === 'GET') return json(tradeAnalytics);
  if (path === '/api/investors' && method === 'GET') return json(investors);
  if (path === '/api/snapshots' && method === 'GET') return json(snapshots);
  if (path === '/api/snapshots/performance' && method === 'GET') return json(performance);
  if (path.startsWith('/api/snapshots/') && path.endsWith('/positions') && method === 'GET') {
    const id = path.split('/')[3];
    return json(snapshotPositions[id] ?? []);
  }
  if (path === '/api/health/db' && method === 'GET') return json(dbHealth);
  if (path === '/api/fx/rates' && method === 'GET') return json(fxRates);
  if (path === '/api/fx/refresh' && method === 'POST') return json({ rates: fxRates });
  if (path === '/api/prices/current' && method === 'GET') return json(currentPrices);
  if (path === '/api/prices/refresh' && method === 'POST') return json({ updated: currentPrices.length, errors: 0 });
  if (path.startsWith('/api/prices/historical/') && method === 'GET') {
    return json(benchmarkHistory(path.split('/').pop() ?? 'benchmark'));
  }
  if (path === '/api/assets' && method === 'GET') return json(assets);
  if (path === '/api/assets/search' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const results = [
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', rank: 2 },
      { id: 'solana', symbol: 'sol', name: 'Solana', rank: 5 },
      { id: 'chainlink', symbol: 'link', name: 'Chainlink', rank: 14 },
      { id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', rank: 25 },
    ].filter((coin) => !q || coin.name.toLowerCase().includes(q) || coin.symbol.includes(q));
    return json(results);
  }
  if (path === '/api/snapshots' && method === 'POST') return json({ ...snapshots[0], id: 'snap-demo-created' });
  if (path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return json({ ok: true });

  return null;
}

let demoApiInstalled = false;
let restoreDemoApiMock: (() => void) | null = null;

function installDemoApiMock() {
  if (demoApiInstalled) return restoreDemoApiMock;

  const originalFetch = window.fetch.bind(window);
  const originalTokenGetter = async () => null;
  setTokenGetter(async () => 'demo-token');

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = parseUrl(input as string | URL | Request);
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const mocked = handleDemoApi(url, method);
    if (mocked) return mocked;
    return originalFetch(input, init);
  };

  restoreDemoApiMock = () => {
    window.fetch = originalFetch;
    setTokenGetter(originalTokenGetter);
    demoApiInstalled = false;
    restoreDemoApiMock = null;
  };
  demoApiInstalled = true;
  return restoreDemoApiMock;
}

function DemoPages() {
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  useThemeEffect();
  useKeyboardShortcuts({
    onShowHelp: () => setShowShortcutsHelp(true),
  });
  useEffect(() => {
    const cleanup = installDemoApiMock();
    return cleanup ?? undefined;
  }, []);

  return (
    <>
      <AppShell basePath="/dev/demo" demoMode>
        <Suspense fallback={<div className="flex h-64 items-center justify-center text-muted-foreground">Loading...</div>}>
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="trades" element={<Trades />} />
            <Route path="history" element={<History />} />
            <Route path="investors" element={<Investors />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/dev/demo" replace />} />
          </Routes>
        </Suspense>
      </AppShell>
      <ShortcutsHelpModal open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
    </>
  );
}

export function DemoModeApp() {
  return import.meta.env.DEV
    ? <DemoPages />
    : <Navigate to="/" replace />;
}
