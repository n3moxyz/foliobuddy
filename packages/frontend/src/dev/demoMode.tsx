import { lazy, Suspense, useLayoutEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { ShortcutsHelpModal } from '@/components/layout/ShortcutsHelpModal';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useThemeEffect } from '@/hooks/useThemeEffect';
import { setTokenGetter } from '@/lib/api';
import type {
  Asset,
  AssetPrice,
  BenchmarkHistoricalData,
  BulkImportPosition,
  CreateAssetData,
  CreatePositionData,
  DbHealth,
  FxRate,
  Investor,
  PerformancePoint,
  Position,
  PortfolioSummary,
  Snapshot,
  SnapshotPosition,
  Trade,
  TradeAnalytics,
} from '@/lib/types';

const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Portfolio = lazy(() => import('@/pages/Portfolio'));
const Trades = lazy(() => import('@/pages/Trades'));
const History = lazy(() => import('@/pages/History'));
const Investors = lazy(() => import('@/pages/Investors'));
const Settings = lazy(() => import('@/pages/Settings'));

const NOW = '2026-06-02T12:00:00.000Z';

const ASSET_DEFAULTS = {
  priceProvider: 'coingecko' as const,
  nativeCurrency: 'USD',
  exchange: null,
  factsheetUrl: null,
  isin: null,
  priceUpdatedAt: NOW,
};

function demoCrypto(
  id: string,
  coingeckoId: string,
  symbol: string,
  name: string,
  currentPriceUsd: number,
  category: Asset['category'] = 'LIQUID_CRYPTO'
): Asset {
  return {
    ...ASSET_DEFAULTS,
    id,
    coingeckoId,
    providerAssetId: coingeckoId,
    symbol,
    name,
    category,
    currentPriceUsd,
  };
}

function demoEquity(
  id: string,
  symbol: string,
  name: string,
  currentPriceUsd: number,
  nativeCurrency = 'USD',
  exchange: string | null = 'NASDAQ'
): Asset {
  return {
    ...ASSET_DEFAULTS,
    id,
    coingeckoId: null,
    priceProvider: 'yahoo',
    providerAssetId: symbol,
    nativeCurrency,
    exchange,
    symbol,
    name,
    category: 'EQUITY',
    currentPriceUsd,
  };
}

function demoManualAsset(
  id: string,
  symbol: string,
  name: string,
  currentPriceUsd: number,
  category: Asset['category'],
  nativeCurrency = 'USD',
  exchange: string | null = null
): Asset {
  return {
    ...ASSET_DEFAULTS,
    id,
    coingeckoId: null,
    priceProvider: 'manual',
    providerAssetId: null,
    nativeCurrency,
    exchange,
    symbol,
    name,
    category,
    currentPriceUsd,
  };
}

const initialAssets: Asset[] = [
  demoCrypto('btc', 'bitcoin', 'BTC', 'Bitcoin', 81250),
  demoCrypto('eth', 'ethereum', 'ETH', 'Ethereum', 4320),
  demoCrypto('sol', 'solana', 'SOL', 'Solana', 178),
  demoCrypto('wld', 'worldcoin-wld', 'WLD', 'Worldcoin', 0.82),
  demoCrypto('xrp', 'ripple', 'XRP', 'XRP', 1.52),
  demoCrypto('hype', 'hyperliquid', 'HYPE', 'Hyperliquid', 31.2),
  demoCrypto('ip', 'story-protocol', 'IP', 'Story Protocol', 2.15),
  demoCrypto('usdc', 'usd-coin', 'USDC', 'USD Coin', 1, 'STABLECOIN'),
  demoCrypto('usdt', 'tether', 'USDT', 'Tether', 1, 'STABLECOIN'),
  {
    ...ASSET_DEFAULTS,
    id: 'cash-sgd',
    coingeckoId: null,
    providerAssetId: null,
    nativeCurrency: 'SGD',
    symbol: 'SGD',
    name: 'Cash SGD',
    category: 'CASH',
    currentPriceUsd: 0.74,
  },
  demoManualAsset('cash-usd', 'USD', 'Cash USD', 1, 'CASH'),
  demoEquity('voo', 'VOO', 'Vanguard S&P 500 ETF', 510.0, 'USD', 'NYSEARCA'),
  demoEquity('aapl', 'AAPL', 'Apple Inc.', 218.0, 'USD', 'NASDAQ'),
  demoEquity('d05-si', 'D05.SI', 'DBS Group Holdings', 22.94, 'SGD', 'SES'),
  demoManualAsset(
    'global-income-ut',
    'UT-GI-SGD',
    'Global Income Fund SGD',
    1.182,
    'UNIT_TRUST',
    'SGD'
  ),
  demoManualAsset('angel-safe', 'ANGEL-AI', 'AI Infrastructure SAFE', 50000, 'ANGEL'),
  demoManualAsset('nft-punk', 'PUNK-7614', 'CryptoPunk 7614', 12000, 'NFT'),
];

function demoAsset(id: string): Asset {
  const asset = initialAssets.find((item) => item.id === id);
  if (!asset) throw new Error(`Missing demo asset: ${id}`);
  return asset;
}

const initialPositions: Position[] = [
  {
    id: 'pos-btc',
    assetId: 'btc',
    asset: demoAsset('btc'),
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
    asset: demoAsset('eth'),
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
    asset: demoAsset('sol'),
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
    id: 'pos-hype',
    assetId: 'hype',
    asset: demoAsset('hype'),
    quantity: 950,
    avgCostUsd: 24,
    storageType: 'DEFI',
    storageLocation: 'Hyperliquid',
    notes: 'Perp venue native token',
    custodyOf: null,
    marketValueUsd: 29640,
    unrealizedPnL: 6840,
    unrealizedPnLPct: 30,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-usdc',
    assetId: 'usdc',
    asset: demoAsset('usdc'),
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
    id: 'pos-usdt',
    assetId: 'usdt',
    asset: demoAsset('usdt'),
    quantity: 12000,
    avgCostUsd: 1,
    storageType: 'WALLET',
    storageLocation: 'Base Safe',
    notes: 'Onchain stablecoin reserve',
    custodyOf: null,
    marketValueUsd: 12000,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-cash-sgd',
    assetId: 'cash-sgd',
    asset: demoAsset('cash-sgd'),
    quantity: 18000,
    avgCostUsd: 0.735,
    storageType: 'BANK',
    storageLocation: 'DBS Multiplier',
    notes: 'SGD cash buffer',
    custodyOf: null,
    marketValueUsd: 13320,
    unrealizedPnL: 90,
    unrealizedPnLPct: 0.7,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-cash-usd',
    assetId: 'cash-usd',
    asset: demoAsset('cash-usd'),
    quantity: 8500,
    avgCostUsd: 1,
    storageType: 'BROKERAGE',
    storageLocation: 'Interactive Brokers',
    notes: 'USD settlement cash',
    custodyOf: null,
    marketValueUsd: 8500,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-voo',
    assetId: 'voo',
    asset: demoAsset('voo'),
    quantity: 85,
    avgCostUsd: 455,
    storageType: 'BROKERAGE',
    storageLocation: 'Interactive Brokers',
    notes: 'Core US equity beta',
    custodyOf: null,
    marketValueUsd: 43350,
    unrealizedPnL: 4675,
    unrealizedPnLPct: 12.1,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-aapl',
    assetId: 'aapl',
    asset: demoAsset('aapl'),
    quantity: 120,
    avgCostUsd: 176,
    storageType: 'BROKERAGE',
    storageLocation: 'Tiger Brokers',
    notes: 'Single-name equity',
    custodyOf: null,
    marketValueUsd: 26160,
    unrealizedPnL: 5040,
    unrealizedPnLPct: 23.9,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-d05-si',
    assetId: 'd05-si',
    asset: demoAsset('d05-si'),
    quantity: 800,
    avgCostUsd: 19.2,
    storageType: 'BROKERAGE',
    storageLocation: 'FSMOne',
    notes: 'SGX bank exposure',
    custodyOf: null,
    marketValueUsd: 18352,
    unrealizedPnL: 2992,
    unrealizedPnLPct: 19.5,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-global-income-ut',
    assetId: 'global-income-ut',
    asset: demoAsset('global-income-ut'),
    quantity: 50000,
    avgCostUsd: 1.03,
    storageType: 'BROKERAGE',
    storageLocation: 'UOB Kay Hian',
    notes: 'Manual NAV unit trust',
    custodyOf: null,
    marketValueUsd: 59100,
    unrealizedPnL: 7600,
    unrealizedPnLPct: 14.8,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-angel-safe',
    assetId: 'angel-safe',
    asset: demoAsset('angel-safe'),
    quantity: 1,
    avgCostUsd: 35000,
    storageType: 'BROKERAGE',
    storageLocation: 'Carta',
    notes: 'Private angel allocation',
    custodyOf: null,
    marketValueUsd: 50000,
    unrealizedPnL: 15000,
    unrealizedPnLPct: 42.9,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-nft-punk',
    assetId: 'nft-punk',
    asset: demoAsset('nft-punk'),
    quantity: 1,
    avgCostUsd: 18500,
    storageType: 'WALLET',
    storageLocation: 'Ledger Flex',
    notes: 'Illiquid NFT mark',
    custodyOf: null,
    marketValueUsd: 12000,
    unrealizedPnL: -6500,
    unrealizedPnLPct: -35.1,
    createdAt: NOW,
    updatedAt: NOW,
  },
  {
    id: 'pos-custody-btc',
    assetId: 'btc',
    asset: demoAsset('btc'),
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
    asset: initialAssets[0],
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
    asset: initialAssets[1],
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
    asset: initialAssets[2],
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
    asset: initialAssets[2],
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
  {
    id: 'trade-5',
    assetId: 'wld',
    asset: initialAssets[3],
    direction: 'LONG',
    entryPrice: 0.78,
    exitPrice: 0.85,
    quantity: 269272,
    positionSizeUsd: 210032,
    entryDate: '2026-03-25T00:00:00.000Z',
    exitDate: '2026-03-27T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: 18849,
    realizedPnLPct: 8.97,
    notes: 'Quick WLD scalp',
    tags: 'wld,scalp',
  },
  {
    id: 'trade-6',
    assetId: 'xrp',
    asset: initialAssets[4],
    direction: 'LONG',
    entryPrice: 1.48,
    exitPrice: 1.52,
    quantity: 106357,
    positionSizeUsd: 157408,
    entryDate: '2026-03-11T00:00:00.000Z',
    exitDate: '2026-03-11T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: 4254,
    realizedPnLPct: 2.7,
    notes: 'XRP day trade',
    tags: 'xrp,daytrade',
  },
  {
    id: 'trade-7',
    assetId: 'hype',
    asset: initialAssets[5],
    direction: 'LONG',
    entryPrice: 32.15,
    exitPrice: 31.2,
    quantity: 6063,
    positionSizeUsd: 194995,
    entryDate: '2026-02-09T00:00:00.000Z',
    exitDate: '2026-02-13T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: -5760,
    realizedPnLPct: -2.95,
    notes: 'HYPE reversal, stopped out',
    tags: 'hype,loss',
  },
  {
    id: 'trade-8',
    assetId: 'ip',
    asset: initialAssets[6],
    direction: 'LONG',
    entryPrice: 2.05,
    exitPrice: 2.18,
    quantity: 107605,
    positionSizeUsd: 220590,
    entryDate: '2026-01-22T00:00:00.000Z',
    exitDate: '2026-01-30T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: 13989,
    realizedPnLPct: 6.34,
    notes: 'IP narrative play',
    tags: 'ip,swing',
  },
  {
    id: 'trade-9',
    assetId: 'sol',
    asset: initialAssets[2],
    direction: 'LONG',
    entryPrice: 113.4,
    exitPrice: 102.1,
    quantity: 6018,
    positionSizeUsd: 682385,
    entryDate: '2026-01-30T00:00:00.000Z',
    exitDate: '2026-02-01T00:00:00.000Z',
    status: 'CLOSED',
    realizedPnL: -68003,
    realizedPnLPct: -9.96,
    notes: 'SOL leverage wipeout',
    tags: 'sol,loss',
  },
];

const tradeAnalytics: TradeAnalytics = {
  totalTrades: 8,
  winningTrades: 5,
  losingTrades: 3,
  winRate: 62.5,
  totalPnL: -27831,
  avgPnL: -3479,
  profitFactor: 0.63,
  avgWin: 9184,
  avgLoss: 24843,
  breakdown: {
    long: { count: 7, winRate: 57.1, pnl: -27066 },
    short: { count: 1, winRate: 0, pnl: -765 },
  },
  bestTrade: {
    id: 'trade-5',
    asset: 'WLD',
    pnl: 18849,
    pnlPct: 8.97,
    date: '2026-03-27T00:00:00.000Z',
  },
  worstTrade: {
    id: 'trade-9',
    asset: 'SOL',
    pnl: -68003,
    pnlPct: -9.96,
    date: '2026-02-01T00:00:00.000Z',
  },
  monthlyBreakdown: [
    { month: 'Jan 2026', pnl: 0, count: 0, winRate: 0 },
    { month: 'Feb 2026', pnl: 8065, count: 3, winRate: 66.7 },
  ],
};

const snapshots: Snapshot[] = [
  {
    id: 'snap-1',
    timestamp: '2024-08-01T13:00:00.000Z',
    snapshotType: 'MONTHLY',
    source: 'MANUAL',
    totalValueUsd: 180000,
    totalValueSgd: 242478,
    usdSgdRate: 1.3471,
    totalCostBasis: 151000,
    monthlyReturn: 0,
    ytdReturn: null,
    btcOutperform: null,
    ethOutperform: null,
    notes: 'Imported opening balance',
  },
  {
    id: 'snap-2',
    timestamp: '2025-07-01T13:00:00.000Z',
    snapshotType: 'MONTHLY',
    source: 'AUTOMATIC',
    totalValueUsd: 261400,
    totalValueSgd: 352114,
    usdSgdRate: 1.3471,
    totalCostBasis: 211000,
    monthlyReturn: 5.4,
    ytdReturn: 14.7,
    btcOutperform: 2.1,
    ethOutperform: -3.4,
    notes: null,
  },
  {
    id: 'snap-3',
    timestamp: '2026-01-05T13:00:00.000Z',
    snapshotType: 'DAILY',
    source: 'AUTOMATIC',
    totalValueUsd: 342600,
    totalValueSgd: 461528,
    usdSgdRate: 1.3471,
    totalCostBasis: 271000,
    monthlyReturn: 3.2,
    ytdReturn: 0,
    btcOutperform: 0.8,
    ethOutperform: 1.4,
    notes: null,
  },
  {
    id: 'snap-4',
    timestamp: '2026-05-05T13:00:00.000Z',
    snapshotType: 'MONTHLY',
    source: 'MANUAL',
    totalValueUsd: 442800,
    totalValueSgd: 596084,
    usdSgdRate: 1.346,
    totalCostBasis: 336000,
    monthlyReturn: 6.6,
    ytdReturn: 29.2,
    btcOutperform: 4.9,
    ethOutperform: -1.8,
    notes: 'Added unit trust and cash buckets',
  },
  {
    id: 'snap-5',
    timestamp: '2026-05-26T13:00:00.000Z',
    snapshotType: 'DAILY',
    source: 'AUTOMATIC',
    totalValueUsd: 481300,
    totalValueSgd: 648407,
    usdSgdRate: 1.3471,
    totalCostBasis: 356000,
    monthlyReturn: 11.1,
    ytdReturn: 40.5,
    btcOutperform: 7.1,
    ethOutperform: 1.2,
    notes: null,
  },
  {
    id: 'snap-6',
    timestamp: '2026-06-01T13:00:00.000Z',
    snapshotType: 'DAILY',
    source: 'AUTOMATIC',
    totalValueUsd: 492800,
    totalValueSgd: 663850,
    usdSgdRate: 1.3471,
    totalCostBasis: 361000,
    monthlyReturn: 13.3,
    ytdReturn: 43.8,
    btcOutperform: 8.4,
    ethOutperform: 2.6,
    notes: null,
  },
];

const snapshotPositions: Record<string, SnapshotPosition[]> = {
  'snap-5': [
    {
      id: 'sp-1',
      snapshotId: 'snap-5',
      assetSymbol: 'BTC',
      quantity: 1.42,
      priceUsd: 80400,
      valueUsd: 114168,
      allocation: 23.7,
      asset: demoAsset('btc'),
    },
    {
      id: 'sp-2',
      snapshotId: 'snap-5',
      assetSymbol: 'ETH',
      quantity: 11.8,
      priceUsd: 4210,
      valueUsd: 49678,
      allocation: 10.3,
      asset: demoAsset('eth'),
    },
    {
      id: 'sp-3',
      snapshotId: 'snap-5',
      assetSymbol: 'UT-GI-SGD',
      quantity: 50000,
      priceUsd: 1.16,
      valueUsd: 58000,
      allocation: 12,
      asset: demoAsset('global-income-ut'),
    },
  ],
  'snap-6': [
    {
      id: 'sp-4',
      snapshotId: 'snap-6',
      assetSymbol: 'BTC',
      quantity: 1.42,
      priceUsd: 81250,
      valueUsd: 115375,
      allocation: 23.4,
      asset: demoAsset('btc'),
    },
    {
      id: 'sp-5',
      snapshotId: 'snap-6',
      assetSymbol: 'ETH',
      quantity: 11.8,
      priceUsd: 4320,
      valueUsd: 50976,
      allocation: 10.3,
      asset: demoAsset('eth'),
    },
    {
      id: 'sp-6',
      snapshotId: 'snap-6',
      assetSymbol: 'SOL',
      quantity: 220,
      priceUsd: 178,
      valueUsd: 39160,
      allocation: 7.9,
      asset: demoAsset('sol'),
    },
    {
      id: 'sp-7',
      snapshotId: 'snap-6',
      assetSymbol: 'UT-GI-SGD',
      quantity: 50000,
      priceUsd: 1.182,
      valueUsd: 59100,
      allocation: 12,
      asset: demoAsset('global-income-ut'),
    },
    {
      id: 'sp-8',
      snapshotId: 'snap-6',
      assetSymbol: 'ANGEL-AI',
      quantity: 1,
      priceUsd: 50000,
      valueUsd: 50000,
      allocation: 10.1,
      asset: demoAsset('angel-safe'),
    },
    {
      id: 'sp-9',
      snapshotId: 'snap-6',
      assetSymbol: 'USDC',
      quantity: 24500,
      priceUsd: 1,
      valueUsd: 24500,
      allocation: 5,
      asset: demoAsset('usdc'),
    },
  ],
};

const performance: PerformancePoint[] = [
  {
    timestamp: '2024-08-01T13:00:00.000Z',
    totalValueUsd: 180000,
    totalValueSgd: 242478,
    unrealizedPnL: 29000,
    btcPrice: 61200,
    ethPrice: 2860,
  },
  {
    timestamp: '2024-11-15T13:00:00.000Z',
    totalValueUsd: 195500,
    totalValueSgd: 263358,
    unrealizedPnL: 35500,
    btcPrice: 68200,
    ethPrice: 3160,
  },
  {
    timestamp: '2025-02-03T13:00:00.000Z',
    totalValueUsd: 228000,
    totalValueSgd: 307139,
    unrealizedPnL: 42000,
    btcPrice: 70300,
    ethPrice: 3010,
  },
  {
    timestamp: '2025-07-01T13:00:00.000Z',
    totalValueUsd: 261400,
    totalValueSgd: 352114,
    unrealizedPnL: 50400,
    btcPrice: 75800,
    ethPrice: 3380,
  },
  {
    timestamp: '2025-10-15T13:00:00.000Z',
    totalValueUsd: 305800,
    totalValueSgd: 411999,
    unrealizedPnL: 61800,
    btcPrice: 82400,
    ethPrice: 3670,
  },
  {
    timestamp: '2026-01-05T13:00:00.000Z',
    totalValueUsd: 342600,
    totalValueSgd: 461528,
    unrealizedPnL: 71600,
    btcPrice: 88700,
    ethPrice: 3890,
  },
  {
    timestamp: '2026-02-03T13:00:00.000Z',
    totalValueUsd: 371200,
    totalValueSgd: 500047,
    unrealizedPnL: 84200,
    btcPrice: 92100,
    ethPrice: 4120,
  },
  {
    timestamp: '2026-03-16T13:00:00.000Z',
    totalValueUsd: 388900,
    totalValueSgd: 523889,
    unrealizedPnL: 92900,
    btcPrice: 90400,
    ethPrice: 4050,
  },
  {
    timestamp: '2026-04-15T13:00:00.000Z',
    totalValueUsd: 423600,
    totalValueSgd: 570633,
    unrealizedPnL: 103600,
    btcPrice: 94800,
    ethPrice: 4280,
  },
  {
    timestamp: '2026-05-05T13:00:00.000Z',
    totalValueUsd: 442800,
    totalValueSgd: 596084,
    unrealizedPnL: 106800,
    btcPrice: 97200,
    ethPrice: 4410,
  },
  {
    timestamp: '2026-05-12T13:00:00.000Z',
    totalValueUsd: 431200,
    totalValueSgd: 580879,
    unrealizedPnL: 95100,
    btcPrice: 93500,
    ethPrice: 4210,
  },
  {
    timestamp: '2026-05-19T13:00:00.000Z',
    totalValueUsd: 466400,
    totalValueSgd: 628227,
    unrealizedPnL: 119400,
    btcPrice: 99100,
    ethPrice: 4540,
  },
  {
    timestamp: '2026-05-26T13:00:00.000Z',
    totalValueUsd: 481300,
    totalValueSgd: 648407,
    unrealizedPnL: 125300,
    btcPrice: 100400,
    ethPrice: 4680,
  },
  {
    timestamp: '2026-06-01T13:00:00.000Z',
    totalValueUsd: 492800,
    totalValueSgd: 663850,
    unrealizedPnL: 131800,
    btcPrice: 101900,
    ethPrice: 4760,
  },
];

const dbHealth: DbHealth = { status: 'ok', latency_ms: 22 };
const fxRates: FxRate[] = [
  { id: 'usd-sgd', fromCcy: 'USD', toCcy: 'SGD', rate: 1.3471, timestamp: NOW },
];
let demoAssets: Asset[] = [...initialAssets];
let demoPositions: Position[] = [...initialPositions];
let demoIdCounter = 0;

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function nextDemoId(prefix: string) {
  demoIdCounter += 1;
  return `${prefix}-${Date.now()}-${demoIdCounter}`;
}

function seedDemoPrice(coingeckoId: string | null, category: Asset['category']) {
  if (category === 'STABLECOIN') return 1;
  if (category === 'CASH') return 0.74;

  const seededPrices: Record<string, number> = {
    bitcoin: 81250,
    ethereum: 4320,
    solana: 178,
    chainlink: 19,
    hyperliquid: 8,
    'avalanche-2': 41,
    aave: 127,
    uniswap: 14,
    tether: 1,
    'usd-coin': 1,
    'ethena-usde': 1,
    'first-digital-usd': 1,
    dai: 1,
  };

  if (coingeckoId && seededPrices[coingeckoId] !== undefined) {
    return seededPrices[coingeckoId];
  }

  return 25;
}

function computePosition(
  asset: Asset,
  data: {
    id: string;
    assetId: string;
    quantity: number;
    avgCostUsd: number;
    storageType: Position['storageType'];
    storageLocation: string | null;
    notes: string | null;
    custodyOf: string | null;
    createdAt: string;
    updatedAt: string;
  }
): Position {
  const price = asset.currentPriceUsd ?? 0;
  const marketValueUsd = round(data.quantity * price);
  const totalCostUsd = data.quantity * data.avgCostUsd;
  const unrealizedPnL = round(marketValueUsd - totalCostUsd);
  const unrealizedPnLPct = totalCostUsd > 0 ? round((unrealizedPnL / totalCostUsd) * 100, 1) : 0;

  return {
    ...data,
    asset,
    marketValueUsd,
    unrealizedPnL,
    unrealizedPnLPct,
  };
}

function getOwnedPositions() {
  return demoPositions.filter((position) => !position.custodyOf);
}

function getSummary(): PortfolioSummary {
  const owned = getOwnedPositions();
  const totalValueUsd = round(
    owned.reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0)
  );
  const totalCostBasis = round(
    owned.reduce((sum, position) => sum + position.quantity * position.avgCostUsd, 0)
  );
  const unrealizedPnL = round(totalValueUsd - totalCostBasis);
  const unrealizedPnLPct =
    totalCostBasis > 0 ? round((unrealizedPnL / totalCostBasis) * 100, 1) : 0;
  const fxRate = fxRates[0]?.rate ?? 1.3471;

  return {
    totalValueUsd,
    totalValueSgd: round(totalValueUsd * fxRate),
    totalCostBasis,
    unrealizedPnL,
    unrealizedPnLPct,
    positionCount: owned.length,
    lastUpdated: new Date().toISOString(),
    ytdStartDate: '2026-01-01T00:00:00.000Z',
  };
}

function getPerformers(type: 'top' | 'worst') {
  const owned = getOwnedPositions()
    .map((position) => ({
      assetId: position.assetId,
      symbol: position.asset.symbol,
      name: position.asset.name,
      unrealizedPnL: position.unrealizedPnL ?? 0,
      unrealizedPnLPct: position.unrealizedPnLPct ?? 0,
      marketValueUsd: position.marketValueUsd ?? 0,
    }))
    .sort((a, b) =>
      type === 'top' ? b.unrealizedPnL - a.unrealizedPnL : a.unrealizedPnL - b.unrealizedPnL
    );

  return owned.slice(0, 5);
}

function getCurrentPrices(): AssetPrice[] {
  return demoAssets.map((asset) => ({
    id: asset.id,
    symbol: asset.symbol,
    name: asset.name,
    coingeckoId: asset.coingeckoId,
    currentPriceUsd: asset.currentPriceUsd,
    priceUpdatedAt: asset.priceUpdatedAt,
  }));
}

function createDemoAsset(data: {
  coingeckoId: string;
  symbol: string;
  name: string;
  category?: Asset['category'];
}) {
  const existing = demoAssets.find(
    (asset) =>
      asset.coingeckoId === data.coingeckoId ||
      asset.symbol.toLowerCase() === data.symbol.toLowerCase()
  );
  if (existing) return existing;

  const asset: Asset = {
    ...ASSET_DEFAULTS,
    id: nextDemoId('asset'),
    coingeckoId: data.coingeckoId,
    providerAssetId: data.coingeckoId,
    symbol: data.symbol.toUpperCase(),
    name: data.name,
    category: data.category ?? 'LIQUID_CRYPTO',
    currentPriceUsd: seedDemoPrice(data.coingeckoId, data.category ?? 'LIQUID_CRYPTO'),
    priceUpdatedAt: new Date().toISOString(),
  };
  demoAssets = [...demoAssets, asset];
  return asset;
}

function createDemoPosition(data: CreatePositionData): Position {
  const asset = demoAssets.find((item) => item.id === data.assetId);
  if (!asset) {
    throw new Error('Asset not found');
  }

  const timestamp = new Date().toISOString();
  const position = computePosition(asset, {
    id: nextDemoId('pos'),
    assetId: data.assetId,
    quantity: data.quantity,
    avgCostUsd: data.avgCostUsd ?? 0,
    storageType: data.storageType ?? 'WALLET',
    storageLocation: data.storageLocation ?? null,
    notes: data.notes ?? null,
    custodyOf: data.custodyOf?.trim() ? data.custodyOf : null,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  demoPositions = [position, ...demoPositions];
  return position;
}

function updateDemoPosition(id: string, data: Partial<CreatePositionData>) {
  const existing = demoPositions.find((position) => position.id === id);
  if (!existing) {
    throw new Error('Position not found');
  }

  const asset = demoAssets.find((item) => item.id === (data.assetId ?? existing.assetId));
  if (!asset) {
    throw new Error('Asset not found');
  }

  const updated = computePosition(asset, {
    id: existing.id,
    assetId: asset.id,
    quantity: data.quantity ?? existing.quantity,
    avgCostUsd: data.avgCostUsd ?? existing.avgCostUsd,
    storageType: data.storageType ?? existing.storageType,
    storageLocation: data.storageLocation ?? existing.storageLocation,
    notes: data.notes === undefined ? existing.notes : data.notes || null,
    custodyOf:
      data.custodyOf === undefined
        ? existing.custodyOf
        : data.custodyOf?.trim()
          ? data.custodyOf
          : null,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });

  demoPositions = demoPositions.map((position) => (position.id === id ? updated : position));
  return updated;
}

function createImportedPosition(position: BulkImportPosition) {
  let asset = demoAssets.find(
    (item) =>
      item.coingeckoId === position.asset.coingeckoId ||
      item.symbol.toLowerCase() === position.asset.symbol.toLowerCase()
  );

  if (!asset) {
    asset = createDemoAsset({
      coingeckoId: position.asset.coingeckoId ?? position.asset.symbol.toLowerCase(),
      symbol: position.asset.symbol,
      name: position.asset.name,
      category: position.asset.category,
    });
  }

  createDemoPosition({
    assetId: asset.id,
    quantity: position.quantity,
    avgCostUsd: position.avgCostUsd,
    storageType: position.storageType,
    storageLocation: position.storageLocation ?? undefined,
    notes: position.notes ?? undefined,
    custodyOf: position.custodyOf ?? undefined,
  });
}

function benchmarkHistory(id: string, provider: 'coingecko' | 'yahoo' = 'coingecko'): BenchmarkHistoricalData {
  const normalizedId = id.toUpperCase();
  const starts: Record<string, number> = {
    bitcoin: 72100,
    ethereum: 3320,
    chainlink: 19,
    hyperliquid: 8,
    solana: 152,
    '^GSPC': 5100,
    SPY: 510,
    QQQ: 440,
  };
  const start = starts[id] ?? starts[normalizedId] ?? 100;
  return {
    coingeckoId: provider === 'coingecko' ? id : undefined,
    provider,
    providerAssetId: id,
    days: 30,
    data: performance.map((point, index) => ({
      timestamp: new Date(point.timestamp).getTime(),
      price:
        Math.round((start + index * start * 0.018 + Math.sin(index * 0.7) * start * 0.01) * 100) /
        100,
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
  const raw =
    typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(raw, window.location.origin);
}

function filterTrades(url: URL) {
  const status = url.searchParams.get('status');
  return status ? trades.filter((trade) => trade.status === status) : trades;
}

function filterPerformance(url: URL) {
  if (url.searchParams.get('all') === 'true') return performance;

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from || to) {
    const fromTime = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
    return performance.filter((point) => {
      const timestamp = new Date(point.timestamp).getTime();
      return timestamp >= fromTime && timestamp <= toTime;
    });
  }

  const days = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const windowDays = Number.isFinite(days) ? days : 30;
  const endTime = new Date(NOW).getTime();
  const startTime = endTime - windowDays * 24 * 60 * 60 * 1000;

  return performance.filter((point) => {
    const timestamp = new Date(point.timestamp).getTime();
    return timestamp >= startTime && timestamp <= endTime;
  });
}

function demoApiPath(url: URL) {
  return url.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
}

async function handleDemoApi(url: URL, method: string, init?: RequestInit) {
  const path = demoApiPath(url);

  if (path === '/api/positions' && method === 'GET') return json(demoPositions);
  if (path === '/api/positions' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as CreatePositionData;
    return json(createDemoPosition(body), 201);
  }
  if (path === '/api/positions' && method === 'DELETE') {
    const count = demoPositions.length;
    demoPositions = [];
    return json({ count });
  }
  if (path === '/api/positions/summary' && method === 'GET') return json(getSummary());
  if (path === '/api/positions/performers/top' && method === 'GET') {
    return json(getPerformers('top'));
  }
  if (path === '/api/positions/performers/worst' && method === 'GET') {
    return json(getPerformers('worst'));
  }
  if (path.startsWith('/api/positions/') && method === 'PUT') {
    const id = path.split('/')[3];
    const body = JSON.parse(
      (init?.body as string | undefined) ?? '{}'
    ) as Partial<CreatePositionData>;
    return json(updateDemoPosition(id, body));
  }
  if (path.startsWith('/api/positions/') && method === 'DELETE') {
    const id = path.split('/')[3];
    const before = demoPositions.length;
    demoPositions = demoPositions.filter((position) => position.id !== id);
    return before === demoPositions.length
      ? json({ error: 'Position not found' }, 404)
      : new Response(null, { status: 204 });
  }
  if (path === '/api/positions/bulk' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      positions?: BulkImportPosition[];
    };
    const imports = body.positions ?? [];
    imports.forEach(createImportedPosition);
    return json(
      {
        results: imports.map((position) => ({ success: true, symbol: position.asset.symbol })),
        successCount: imports.length,
        totalCount: imports.length,
      },
      201
    );
  }
  if (path === '/api/trades' && method === 'GET') return json(filterTrades(url));
  if (path === '/api/trades/analytics' && method === 'GET') return json(tradeAnalytics);
  if (path === '/api/investors' && method === 'GET') return json(investors);
  if (path === '/api/snapshots' && method === 'GET') return json(snapshots);
  if (path === '/api/snapshots/performance' && method === 'GET')
    return json(filterPerformance(url));
  if (path.startsWith('/api/snapshots/') && path.endsWith('/positions') && method === 'GET') {
    const id = path.split('/')[3];
    return json(snapshotPositions[id] ?? []);
  }
  if (path === '/api/health/db' && method === 'GET') return json(dbHealth);
  if (path === '/api/fx/rates' && method === 'GET') return json(fxRates);
  if (path === '/api/fx/refresh' && method === 'POST') return json({ rates: fxRates });
  if (path === '/api/prices/current' && method === 'GET') return json(getCurrentPrices());
  if (path === '/api/prices/refresh' && method === 'POST')
    return json({ updated: getCurrentPrices().length, errors: 0 });
  if (path.startsWith('/api/prices/historical/') && method === 'GET') {
    const provider = url.searchParams.get('provider') === 'yahoo' ? 'yahoo' : 'coingecko';
    const providerAssetId = decodeURIComponent(path.split('/').pop() ?? 'benchmark');
    return json(benchmarkHistory(providerAssetId, provider));
  }
  if (path === '/api/assets' && method === 'GET') return json(demoAssets);
  if (path === '/api/assets' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as CreateAssetData;
    const existing = demoAssets.find(
      (asset) => asset.symbol.toLowerCase() === body.symbol.toLowerCase()
    );
    if (existing) return json(existing);

    const currentPriceUsd =
      body.currentPriceUsd ??
      seedDemoPrice(body.coingeckoId ?? null, body.category ?? 'LIQUID_CRYPTO');
    const asset: Asset = {
      ...ASSET_DEFAULTS,
      id: nextDemoId('asset'),
      coingeckoId: body.coingeckoId ?? null,
      priceProvider: body.priceProvider ?? 'coingecko',
      providerAssetId: body.providerAssetId ?? body.coingeckoId ?? null,
      nativeCurrency: (body.nativeCurrency ?? 'USD').toUpperCase(),
      exchange: body.exchange ?? null,
      symbol: body.symbol.toUpperCase(),
      name: body.name,
      category: body.category ?? 'LIQUID_CRYPTO',
      currentPriceUsd,
      priceUpdatedAt: currentPriceUsd !== null ? new Date().toISOString() : null,
    };
    demoAssets = [...demoAssets, asset];
    return json(asset, 201);
  }
  if (path === '/api/assets/search' && method === 'GET') {
    const q = (url.searchParams.get('q') ?? '').toLowerCase();
    const category = url.searchParams.get('category');
    const provider = url.searchParams.get('provider');

    if (category === 'EQUITY' || provider === 'yahoo') {
      const equities = [
        {
          providerAssetId: '^GSPC',
          symbol: 'SPX',
          name: 'S&P 500 Index',
          exchange: 'Yahoo Finance',
          nativeCurrency: 'USD',
        },
        {
          symbol: 'D05.SI',
          name: 'DBS Group Holdings Ltd',
          exchange: 'Singapore',
          nativeCurrency: 'SGD',
        },
        {
          symbol: 'O39.SI',
          name: 'Oversea-Chinese Banking Corporation Ltd',
          exchange: 'Singapore',
          nativeCurrency: 'SGD',
        },
        {
          symbol: 'U11.SI',
          name: 'United Overseas Bank Ltd',
          exchange: 'Singapore',
          nativeCurrency: 'SGD',
        },
        {
          symbol: 'Z74.SI',
          name: 'Singapore Telecommunications Limited',
          exchange: 'Singapore',
          nativeCurrency: 'SGD',
        },
        { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'NasdaqGS', nativeCurrency: 'USD' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NasdaqGS', nativeCurrency: 'USD' },
        { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NasdaqGS', nativeCurrency: 'USD' },
        {
          symbol: 'MSFT',
          name: 'Microsoft Corporation',
          exchange: 'NasdaqGS',
          nativeCurrency: 'USD',
        },
        { symbol: 'GOOGL', name: 'Alphabet Inc.', exchange: 'NasdaqGS', nativeCurrency: 'USD' },
        { symbol: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'NasdaqGS', nativeCurrency: 'USD' },
        {
          symbol: 'META',
          name: 'Meta Platforms, Inc.',
          exchange: 'NasdaqGS',
          nativeCurrency: 'USD',
        },
        { symbol: 'GLXY', name: 'Galaxy Digital Inc.', exchange: 'NASDAQ', nativeCurrency: 'USD' },
        {
          symbol: 'COIN',
          name: 'Coinbase Global, Inc.',
          exchange: 'NasdaqGS',
          nativeCurrency: 'USD',
        },
        {
          symbol: 'MSTR',
          name: 'MicroStrategy Incorporated',
          exchange: 'NasdaqGS',
          nativeCurrency: 'USD',
        },
        {
          symbol: 'SPY',
          name: 'SPDR S&P 500 ETF Trust',
          exchange: 'NYSEArca',
          nativeCurrency: 'USD',
        },
        { symbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NasdaqGM', nativeCurrency: 'USD' },
      ]
        .filter(
          (e) =>
            !q ||
            e.symbol.toLowerCase().includes(q) ||
            e.name.toLowerCase().includes(q) ||
            e.providerAssetId?.toLowerCase().includes(q)
        )
        .map((e) => ({
          id: e.providerAssetId ?? e.symbol,
          providerAssetId: e.providerAssetId ?? e.symbol,
          provider: 'yahoo',
          symbol: e.symbol,
          name: e.name,
          exchange: e.exchange,
          nativeCurrency: e.nativeCurrency,
          rank: null,
        }));
      return json(equities);
    }

    const results = [
      { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 },
      { id: 'ethereum', symbol: 'eth', name: 'Ethereum', rank: 2 },
      { id: 'solana', symbol: 'sol', name: 'Solana', rank: 5 },
      { id: 'chainlink', symbol: 'link', name: 'Chainlink', rank: 14 },
      { id: 'hyperliquid', symbol: 'hype', name: 'Hyperliquid', rank: 25 },
    ].filter((coin) => !q || coin.name.toLowerCase().includes(q) || coin.symbol.includes(q));
    return json(results);
  }
  if (path === '/api/assets/from-coingecko' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      coingeckoId: string;
      symbol: string;
      name: string;
      category?: Asset['category'];
    };
    return json(createDemoAsset(body), 201);
  }
  if (path === '/api/assets/from-provider' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      provider: 'coingecko' | 'yahoo' | 'manual';
      providerAssetId: string;
      symbol: string;
      name: string;
      category: Asset['category'];
      nativeCurrency?: string;
      exchange?: string | null;
    };
    const existing = demoAssets.find(
      (a) =>
        (a.priceProvider === body.provider && a.providerAssetId === body.providerAssetId) ||
        a.symbol.toLowerCase() === body.symbol.toLowerCase()
    );
    if (existing) return json(existing);

    const base = createDemoAsset({
      coingeckoId: body.providerAssetId,
      symbol: body.symbol,
      name: body.name,
      category: body.category,
    });
    const merged: Asset = {
      ...base,
      priceProvider: body.provider,
      providerAssetId: body.providerAssetId,
      coingeckoId: body.provider === 'coingecko' ? body.providerAssetId : null,
      nativeCurrency: (body.nativeCurrency ?? 'USD').toUpperCase(),
      exchange: body.exchange ?? null,
    };
    demoAssets = demoAssets.map((a) => (a.id === merged.id ? merged : a));
    return json(merged, 201);
  }
  if (path === '/api/snapshots' && method === 'POST')
    return json({ ...snapshots[0], id: 'snap-demo-created' });
  if (path.endsWith('/assets/unit-trust') && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      symbol: string;
      name: string;
      nativeCurrency?: string;
      isin?: string | null;
      initialNav?: number;
      navAsOfDate?: string;
    };
    const ccy = (body.nativeCurrency ?? 'SGD').toUpperCase();
    const navUsd =
      body.initialNav === undefined
        ? null
        : ccy === 'USD'
          ? body.initialNav
          : body.initialNav * 0.741;
    const asset = createDemoAsset({
      coingeckoId: `ut-${body.symbol.toLowerCase()}`,
      symbol: body.symbol,
      name: body.name,
      category: 'UNIT_TRUST',
    });
    const priceUpdatedAt = body.navAsOfDate ?? new Date().toISOString();
    const merged: Asset = {
      ...asset,
      priceProvider: 'manual',
      nativeCurrency: ccy,
      isin: body.isin ?? null,
      currentPriceUsd: navUsd,
      priceUpdatedAt,
    };
    demoAssets = demoAssets.map((a) => (a.id === merged.id ? merged : a));
    return json(merged, 201);
  }
  if (path.endsWith('/assets/parse-unit-trust-statement') && method === 'POST') {
    return json({
      broker: 'UOB Kay Hian (demo)',
      periodEnd: new Date().toISOString(),
      holdings: [
        {
          symbol: 'LIONGLOB',
          name: 'LionGlobal Singapore Dividend Equity SGD (Decumulation)',
          isin: 'SGXZ58947870',
          nativeCurrency: 'SGD',
          units: 68153.43,
          avgCostNative: 1.47474,
          navNative: 1.421,
          navUsd: 1.053,
          currentValueNative: 96846.02,
          totalCostNative: 100508.59,
          totalCostUsd: 74450.06,
          fxRateToUsd: 0.741,
          navAsOfDate: new Date().toISOString(),
          yahooSymbol: '0P0001OPAN.SI',
        },
      ],
    });
  }
  if (path.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method))
    return json({ ok: true });

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
    const method = (
      init?.method ?? (input instanceof Request ? input.method : 'GET')
    ).toUpperCase();
    const mocked = await handleDemoApi(url, method, init);
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
  const [apiMockReady, setApiMockReady] = useState(false);

  useThemeEffect();
  useKeyboardShortcuts({
    onShowHelp: () => setShowShortcutsHelp(true),
  });
  useLayoutEffect(() => {
    const cleanup = installDemoApiMock();
    setApiMockReady(true);
    return cleanup ?? undefined;
  }, []);

  if (!apiMockReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <>
      <AppShell basePath="/dev/demo" demoMode>
        <Suspense
          fallback={
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              Loading...
            </div>
          }
        >
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
  return import.meta.env.DEV ? <DemoPages /> : <Navigate to="/" replace />;
}
