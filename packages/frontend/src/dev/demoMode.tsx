import { lazy, Suspense, useLayoutEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { applyPositionDelta, CategoryGroup, categoryGroup } from '@foliobuddy/shared';
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
  BulkImportSnapshot,
  BulkImportTrade,
  CreateAssetData,
  CreateInvestorData,
  CreatePositionData,
  CreateTradeData,
  DbHealth,
  FxRate,
  Investor,
  PerformancePoint,
  Position,
  PositionHistoryEntry,
  PortfolioSummary,
  Snapshot,
  SnapshotPosition,
  Trade,
  TradeAnalytics,
  UpdatePositionData,
  UserPreferences,
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

const initialPositionHistory: PositionHistoryEntry[] = [
  {
    id: 'hist-btc-add-1',
    positionId: 'pos-btc',
    assetId: 'btc',
    mode: 'add',
    quantity: 0.42,
    costBasisUsd: 29266,
    previousQuantity: 1,
    previousAvgCostUsd: 45000,
    previousTotalCostUsd: 45000,
    nextQuantity: 1.42,
    nextAvgCostUsd: 52300,
    nextTotalCostUsd: 74266,
    createdAt: '2026-05-24T09:10:00.000Z',
  },
  {
    id: 'hist-sol-reduce-1',
    positionId: 'pos-sol',
    assetId: 'sol',
    mode: 'reduce',
    quantity: 35,
    costBasisUsd: 4620,
    previousQuantity: 255,
    previousAvgCostUsd: 132,
    previousTotalCostUsd: 33660,
    nextQuantity: 220,
    nextAvgCostUsd: 132,
    nextTotalCostUsd: 29040,
    createdAt: '2026-05-29T14:35:00.000Z',
  },
];

const initialInvestors: Investor[] = [
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

const initialTrades: Trade[] = [
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
    fundingCost: 50,
    status: 'CLOSED',
    realizedPnL: 5400,
    realizedPnLPct: 16.07,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
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
    fundingCost: 0,
    status: 'CLOSED',
    realizedPnL: -68003,
    realizedPnLPct: -9.96,
    notes: 'SOL leverage wipeout',
    tags: 'sol,loss',
  },
];

const initialSnapshots: Snapshot[] = [
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

const initialSnapshotPositions: Record<string, SnapshotPosition[]> = {
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

const initialPerformance: PerformancePoint[] = [
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
// Stateful (resets on refresh) so the Settings snapshot-schedule selects round-trip.
let demoPreferences: UserPreferences = { snapshotHour: 5, snapshotTimezone: 'Asia/Singapore' };
const fxRates: FxRate[] = [
  { id: 'usd-sgd', fromCcy: 'USD', toCcy: 'SGD', rate: 1.3471, timestamp: NOW },
  { id: 'usd-jpy', fromCcy: 'USD', toCcy: 'JPY', rate: 150, timestamp: NOW },
  { id: 'usd-twd', fromCcy: 'USD', toCcy: 'TWD', rate: 31.2, timestamp: NOW },
  { id: 'usd-krw', fromCcy: 'USD', toCcy: 'KRW', rate: 1375, timestamp: NOW },
  { id: 'usd-nok', fromCcy: 'USD', toCcy: 'NOK', rate: 10.5, timestamp: NOW },
];
let demoAssets: Asset[] = [...initialAssets];
let demoPositions: Position[] = [...initialPositions];
let demoPositionHistory: PositionHistoryEntry[] = [...initialPositionHistory];
let demoInvestors: Investor[] = [...initialInvestors];
let demoTrades: Trade[] = [...initialTrades];
let demoSnapshots: Snapshot[] = [...initialSnapshots];
let demoSnapshotPositions: Record<string, SnapshotPosition[]> = { ...initialSnapshotPositions };
let demoPerformance: PerformancePoint[] = [...initialPerformance];
let demoIdCounter = 0;

export function resetDemoDataForTests() {
  demoAssets = [...initialAssets];
  demoPositions = [...initialPositions];
  demoPositionHistory = [...initialPositionHistory];
  demoInvestors = [...initialInvestors];
  demoTrades = [...initialTrades];
  demoSnapshots = [...initialSnapshots];
  demoSnapshotPositions = { ...initialSnapshotPositions };
  demoPerformance = [...initialPerformance];
  demoIdCounter = 0;
}

function round(value: number, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const FLOAT_TOLERANCE = 1e-6;

function numbersClose(a: number, b: number) {
  return Math.abs(a - b) <= FLOAT_TOLERANCE * Math.max(1, Math.abs(a), Math.abs(b));
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
  reduceDemoFundingCashPositionByCost(
    data.fundingCashPositionId,
    data.quantity * (data.avgCostUsd ?? 0),
    timestamp
  );
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

function reduceDemoFundingCashPositionByCost(
  fundingCashPositionIdInput: string | null | undefined,
  purchaseCostUsd: number,
  timestamp: string,
  operationId?: string
) {
  const fundingCashPositionId = fundingCashPositionIdInput?.trim();
  if (!fundingCashPositionId) return;

  const fundingPosition = demoPositions.find(
    (position) => position.id === fundingCashPositionId && !position.custodyOf
  );
  if (!fundingPosition) {
    throw new Error('Funding cash position not found');
  }
  if (categoryGroup(fundingPosition.asset.category) !== CategoryGroup.STABLES) {
    throw new Error('Funding position must be a cash position');
  }

  if (!(purchaseCostUsd > 0)) {
    throw new Error('Funding cash source requires a positive position cost');
  }

  const fundingPriceUsd = fundingPosition.asset.currentPriceUsd ?? fundingPosition.avgCostUsd;
  if (!(fundingPriceUsd > 0)) {
    throw new Error('Funding cash position needs a usable USD price');
  }

  const quantityToReduce = purchaseCostUsd / fundingPriceUsd;
  const delta = applyPositionDelta({
    currentQuantity: fundingPosition.quantity,
    currentAvgCostUsd: fundingPosition.avgCostUsd,
    deltaQuantity: quantityToReduce,
    mode: 'reduce',
  });

  const updatedFundingPosition = computePosition(fundingPosition.asset, {
    id: fundingPosition.id,
    assetId: fundingPosition.assetId,
    quantity: delta.nextQuantity,
    avgCostUsd: delta.nextAvgCostUsd,
    storageType: fundingPosition.storageType,
    storageLocation: fundingPosition.storageLocation,
    notes: fundingPosition.notes,
    custodyOf: fundingPosition.custodyOf,
    createdAt: fundingPosition.createdAt,
    updatedAt: timestamp,
  });

  demoPositions = demoPositions.map((position) =>
    position.id === fundingPosition.id ? updatedFundingPosition : position
  );
  demoPositionHistory = [
    {
      id: nextDemoId('hist'),
      positionId: fundingPosition.id,
      assetId: fundingPosition.assetId,
      mode: 'reduce',
      quantity: quantityToReduce,
      costBasisUsd: delta.deltaCostUsd,
      previousQuantity: fundingPosition.quantity,
      previousAvgCostUsd: fundingPosition.avgCostUsd,
      previousTotalCostUsd: delta.currentTotalCostUsd,
      nextQuantity: delta.nextQuantity,
      nextAvgCostUsd: delta.nextAvgCostUsd,
      nextTotalCostUsd: delta.nextTotalCostUsd,
      operationId,
      createdAt: timestamp,
    },
    ...demoPositionHistory,
  ];
}

function updateDemoPosition(id: string, data: UpdatePositionData) {
  const existing = demoPositions.find((position) => position.id === id);
  if (!existing) {
    throw new Error('Position not found');
  }

  const asset = demoAssets.find((item) => item.id === (data.assetId ?? existing.assetId));
  if (!asset) {
    throw new Error('Asset not found');
  }

  const timestamp = new Date().toISOString();
  const operationId =
    data.positionDelta?.mode === 'add' && data.fundingCashPositionId
      ? nextDemoId('operation')
      : undefined;
  if (data.fundingCashPositionId) {
    if (data.positionDelta?.mode !== 'add') {
      throw new Error('Funding cash source is only supported when adding to a position');
    }
    reduceDemoFundingCashPositionByCost(
      data.fundingCashPositionId,
      data.positionDelta.totalCostUsd ?? 0,
      timestamp,
      operationId
    );
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
    updatedAt: timestamp,
  });

  demoPositions = demoPositions.map((position) => (position.id === id ? updated : position));

  if (data.positionDelta) {
    const previousTotalCostUsd = existing.quantity * existing.avgCostUsd;
    const nextTotalCostUsd = updated.quantity * updated.avgCostUsd;
    const costBasisUsd =
      data.positionDelta.mode === 'add'
        ? (data.positionDelta.totalCostUsd ?? nextTotalCostUsd - previousTotalCostUsd)
        : data.positionDelta.quantity * existing.avgCostUsd;

    demoPositionHistory = [
      {
        id: nextDemoId('hist'),
        positionId: existing.id,
        assetId: updated.assetId,
        mode: data.positionDelta.mode,
        quantity: data.positionDelta.quantity,
        costBasisUsd,
        previousQuantity: existing.quantity,
        previousAvgCostUsd: existing.avgCostUsd,
        previousTotalCostUsd,
        nextQuantity: updated.quantity,
        nextAvgCostUsd: updated.avgCostUsd,
        nextTotalCostUsd,
        operationId,
        createdAt: timestamp,
      },
      ...demoPositionHistory,
    ];
  } else {
    const assetChanged = data.assetId !== undefined && data.assetId !== existing.assetId;
    const manualTotalsChanged =
      (data.quantity !== undefined || data.avgCostUsd !== undefined || assetChanged) &&
      (assetChanged ||
        !numbersClose(updated.quantity, existing.quantity) ||
        !numbersClose(updated.avgCostUsd, existing.avgCostUsd));

    if (manualTotalsChanged) {
      const previousTotalCostUsd = existing.quantity * existing.avgCostUsd;
      const nextTotalCostUsd = updated.quantity * updated.avgCostUsd;

      demoPositionHistory = [
        {
          id: nextDemoId('hist'),
          positionId: existing.id,
          assetId: updated.assetId,
          mode: 'reset',
          quantity: updated.quantity,
          costBasisUsd: nextTotalCostUsd,
          previousQuantity: existing.quantity,
          previousAvgCostUsd: existing.avgCostUsd,
          previousTotalCostUsd,
          nextQuantity: updated.quantity,
          nextAvgCostUsd: updated.avgCostUsd,
          nextTotalCostUsd,
          createdAt: timestamp,
        },
        ...demoPositionHistory,
      ];
    }
  }

  return updated;
}

function cancelDemoPositionHistory(positionId: string, historyId: string) {
  const existing = demoPositions.find((position) => position.id === positionId);
  if (!existing) {
    throw new Error('Position not found');
  }

  const historyEntry = demoPositionHistory.find(
    (entry) => entry.id === historyId && entry.positionId === positionId
  );
  if (!historyEntry) {
    throw new Error('Position history entry not found');
  }

  if (historyEntry.mode === 'reset') {
    throw new Error('Manual total reset entries cannot be canceled from history');
  }

  const timestamp = new Date().toISOString();
  const entriesToCancel = [
    {
      history: historyEntry,
      position: existing,
    },
  ];

  if (historyEntry.operationId) {
    demoPositionHistory
      .filter(
        (entry) => entry.operationId === historyEntry.operationId && entry.id !== historyEntry.id
      )
      .forEach((relatedHistory) => {
        if (relatedHistory.mode === 'reset') {
          throw new Error('Manual total reset entries cannot be canceled from history');
        }
        const relatedPosition = demoPositions.find(
          (position) => position.id === relatedHistory.positionId
        );
        if (!relatedPosition) {
          throw new Error('Related position for history entry not found');
        }
        entriesToCancel.push({ history: relatedHistory, position: relatedPosition });
      });
  }

  entriesToCancel.forEach((entryToCancel) => {
    const latestHistoryEntry = [...demoPositionHistory]
      .filter((entry) => entry.positionId === entryToCancel.position.id)
      .sort((a, b) => {
        const timeDiff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return timeDiff || b.id.localeCompare(a.id);
      })[0];

    if (latestHistoryEntry?.id !== entryToCancel.history.id) {
      throw new Error('Only the latest position history entry can be canceled');
    }

    const currentTotalCostUsd = entryToCancel.position.quantity * entryToCancel.position.avgCostUsd;
    if (
      entryToCancel.position.assetId !== entryToCancel.history.assetId ||
      !numbersClose(entryToCancel.position.quantity, entryToCancel.history.nextQuantity) ||
      !numbersClose(entryToCancel.position.avgCostUsd, entryToCancel.history.nextAvgCostUsd) ||
      !numbersClose(currentTotalCostUsd, entryToCancel.history.nextTotalCostUsd)
    ) {
      throw new Error('Position has changed since this history entry was recorded');
    }
  });

  let updatedRequestedPosition = existing;
  const canceledIds = new Set(entriesToCancel.map((entry) => entry.history.id));

  entriesToCancel.forEach((entryToCancel) => {
    const updated = computePosition(entryToCancel.position.asset, {
      id: entryToCancel.position.id,
      assetId: entryToCancel.position.assetId,
      quantity: entryToCancel.history.previousQuantity,
      avgCostUsd: entryToCancel.history.previousAvgCostUsd,
      storageType: entryToCancel.position.storageType,
      storageLocation: entryToCancel.position.storageLocation,
      notes: entryToCancel.position.notes,
      custodyOf: entryToCancel.position.custodyOf,
      createdAt: entryToCancel.position.createdAt,
      updatedAt: timestamp,
    });

    demoPositions = demoPositions.map((position) =>
      position.id === updated.id ? updated : position
    );
    if (updated.id === positionId) {
      updatedRequestedPosition = updated;
    }
  });

  demoPositionHistory = demoPositionHistory.filter((entry) => !canceledIds.has(entry.id));

  return updatedRequestedPosition;
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

function calculateTradePnL(
  direction: Trade['direction'],
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fundingCost = 0
) {
  const pricePnL =
    direction === 'SHORT'
      ? (entryPrice - exitPrice) * quantity
      : (exitPrice - entryPrice) * quantity;
  const pnl = pricePnL - fundingCost;
  const positionSizeUsd = entryPrice * quantity;
  return {
    pnl: round(pnl),
    pnlPct: positionSizeUsd > 0 ? round((pnl / positionSizeUsd) * 100, 2) : 0,
  };
}

function assetFromImportedTrade(assetData: BulkImportTrade['asset']) {
  let asset = demoAssets.find(
    (item) =>
      (assetData.coingeckoId && item.coingeckoId === assetData.coingeckoId) ||
      item.symbol.toLowerCase() === assetData.symbol.toLowerCase()
  );

  if (!asset) {
    asset = createDemoAsset({
      coingeckoId: assetData.coingeckoId ?? assetData.symbol.toLowerCase(),
      symbol: assetData.symbol,
      name: assetData.name,
      category: assetData.category,
    });
  }

  return asset;
}

type DemoTradeInput = {
  asset?: BulkImportTrade['asset'];
  assetId?: string;
  direction?: Trade['direction'];
  entryPrice?: number;
  exitPrice?: number | null;
  quantity?: number;
  entryDate?: string;
  exitDate?: string | null;
  fundingCost?: number;
  status?: Trade['status'];
  notes?: string | null;
  tags?: string[] | null;
};

function normalizeTradeInput(data: DemoTradeInput, existing?: Trade): Trade {
  const asset = data.asset
    ? assetFromImportedTrade(data.asset)
    : demoAssets.find((item) => item.id === (data.assetId ?? existing?.assetId));
  if (!asset) throw new Error('Asset not found');

  const direction = data.direction ?? existing?.direction ?? 'LONG';
  const entryPrice = data.entryPrice ?? existing?.entryPrice ?? 0;
  const exitPrice = data.exitPrice ?? existing?.exitPrice ?? null;
  const quantity = data.quantity ?? existing?.quantity ?? 0;
  const fundingCost = data.fundingCost ?? existing?.fundingCost ?? 0;
  const status = data.status ?? (exitPrice ? 'CLOSED' : 'OPEN');
  const positionSizeUsd = round(entryPrice * quantity);
  const realized =
    exitPrice && status === 'CLOSED'
      ? calculateTradePnL(direction, entryPrice, exitPrice, quantity, fundingCost)
      : null;
  const entryDate = data.entryDate ?? existing?.entryDate ?? new Date().toISOString();
  const exitDate = data.exitDate ?? existing?.exitDate ?? null;
  const tags = 'tags' in data ? data.tags : undefined;

  return {
    id: existing?.id ?? nextDemoId('trade'),
    assetId: asset.id,
    asset,
    direction,
    entryPrice,
    exitPrice,
    quantity,
    positionSizeUsd,
    entryDate: new Date(entryDate).toISOString(),
    exitDate: exitDate ? new Date(exitDate).toISOString() : null,
    fundingCost,
    status,
    realizedPnL: realized?.pnl ?? null,
    realizedPnLPct: realized?.pnlPct ?? null,
    notes: data.notes ?? existing?.notes ?? null,
    tags: tags ? JSON.stringify(tags) : (existing?.tags ?? null),
  };
}

function createDemoTrade(data: BulkImportTrade | CreateTradeData) {
  const trade = normalizeTradeInput(data);
  demoTrades = [trade, ...demoTrades];
  return trade;
}

function updateDemoTrade(id: string, data: Partial<CreateTradeData>) {
  const existing = demoTrades.find((trade) => trade.id === id);
  if (!existing) throw new Error('Trade not found');
  const updated = normalizeTradeInput(
    { ...data, assetId: data.assetId ?? existing.assetId },
    existing
  );
  demoTrades = demoTrades.map((trade) => (trade.id === id ? updated : trade));
  return updated;
}

function closeDemoTrade(
  id: string,
  data: { exitPrice: number; exitDate?: string; fundingCost?: number; notes?: string }
) {
  return updateDemoTrade(id, {
    exitPrice: data.exitPrice,
    exitDate: data.exitDate ?? new Date().toISOString(),
    fundingCost: data.fundingCost,
    notes: data.notes,
  });
}

function getTradeAnalytics(): TradeAnalytics {
  const closedTrades = demoTrades.filter((trade) => trade.status === 'CLOSED');
  const winningTrades = closedTrades.filter((trade) => (trade.realizedPnL ?? 0) > 0);
  const losingTrades = closedTrades.filter((trade) => (trade.realizedPnL ?? 0) < 0);
  const totalTrades = closedTrades.length;
  const totalPnL = round(closedTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0));
  const totalWins = winningTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0);
  const totalLosses = Math.abs(
    losingTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0)
  );
  const longTrades = closedTrades.filter((trade) => trade.direction === 'LONG');
  const shortTrades = closedTrades.filter((trade) => trade.direction === 'SHORT');
  const sortedByPnl = [...closedTrades].sort((a, b) => (b.realizedPnL ?? 0) - (a.realizedPnL ?? 0));
  const bestTrade = sortedByPnl[0] ?? null;
  const worstTrade = sortedByPnl[sortedByPnl.length - 1] ?? null;
  const monthlyMap = new Map<string, { pnl: number; count: number; wins: number }>();

  for (const trade of closedTrades) {
    if (!trade.exitDate) continue;
    const exitDate = new Date(trade.exitDate);
    const month = `${exitDate.getFullYear()}-${String(exitDate.getMonth() + 1).padStart(2, '0')}`;
    const existing = monthlyMap.get(month) ?? { pnl: 0, count: 0, wins: 0 };
    monthlyMap.set(month, {
      pnl: existing.pnl + (trade.realizedPnL ?? 0),
      count: existing.count + 1,
      wins: existing.wins + ((trade.realizedPnL ?? 0) > 0 ? 1 : 0),
    });
  }

  const winRate = totalTrades > 0 ? (winningTrades.length / totalTrades) * 100 : 0;

  return {
    totalTrades,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: round(winRate, 1),
    totalPnL,
    avgPnL: totalTrades > 0 ? round(totalPnL / totalTrades) : 0,
    profitFactor: totalLosses > 0 ? round(totalWins / totalLosses, 2) : totalWins > 0 ? null : 0,
    avgWin: winningTrades.length > 0 ? round(totalWins / winningTrades.length) : 0,
    avgLoss: losingTrades.length > 0 ? round(totalLosses / losingTrades.length) : 0,
    breakdown: {
      long: {
        count: longTrades.length,
        winRate:
          longTrades.length > 0
            ? round(
                (longTrades.filter((trade) => (trade.realizedPnL ?? 0) > 0).length /
                  longTrades.length) *
                  100,
                1
              )
            : 0,
        pnl: round(longTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0)),
      },
      short: {
        count: shortTrades.length,
        winRate:
          shortTrades.length > 0
            ? round(
                (shortTrades.filter((trade) => (trade.realizedPnL ?? 0) > 0).length /
                  shortTrades.length) *
                  100,
                1
              )
            : 0,
        pnl: round(shortTrades.reduce((sum, trade) => sum + (trade.realizedPnL ?? 0), 0)),
      },
    },
    bestTrade: bestTrade
      ? {
          id: bestTrade.id,
          asset: bestTrade.asset.symbol,
          pnl: bestTrade.realizedPnL ?? 0,
          pnlPct: bestTrade.realizedPnLPct ?? 0,
          date: bestTrade.exitDate ?? bestTrade.entryDate,
        }
      : null,
    worstTrade: worstTrade
      ? {
          id: worstTrade.id,
          asset: worstTrade.asset.symbol,
          pnl: worstTrade.realizedPnL ?? 0,
          pnlPct: worstTrade.realizedPnLPct ?? 0,
          date: worstTrade.exitDate ?? worstTrade.entryDate,
        }
      : null,
    monthlyBreakdown: Array.from(monthlyMap.entries())
      .map(([month, data]) => ({
        month,
        pnl: round(data.pnl),
        count: data.count,
        winRate: round((data.wins / data.count) * 100, 1),
      }))
      .sort((a, b) => a.month.localeCompare(b.month)),
  };
}

function deriveInvestorValues(investor: Investor): Investor {
  const totalValueUsd = getSummary().totalValueUsd;
  const currentValue = round((totalValueUsd * investor.stakePercentage) / 100);
  const capitalAtYearStart = investor.capitalAtYearStart ?? investor.initialCapital ?? 0;
  const ytdReturn = round(currentValue - capitalAtYearStart);

  return {
    ...investor,
    currentValue,
    capitalAtYearStart,
    ytdReturn,
    ytdReturnPct: capitalAtYearStart > 0 ? round((ytdReturn / capitalAtYearStart) * 100, 1) : null,
  };
}

function createDemoInvestor(data: CreateInvestorData) {
  const currentStake = demoInvestors.reduce((sum, investor) => sum + investor.stakePercentage, 0);
  const stakePercentage = data.stakePercentage ?? Math.max(0, 100 - currentStake);
  const investor = deriveInvestorValues({
    id: nextDemoId('inv'),
    name: data.name,
    stakePercentage,
    initialCapital: data.initialCapital ?? 0,
    currentValue: 0,
    capitalAtYearStart: data.initialCapital ?? 0,
    ytdReturn: 0,
    ytdReturnPct: 0,
    joinDate: data.joinDate ? new Date(data.joinDate).toISOString() : new Date().toISOString(),
    notes: data.notes ?? null,
    isOwner: data.isOwner ?? false,
  });
  demoInvestors = [...demoInvestors, investor];
  return investor;
}

function updateDemoInvestor(id: string, data: Partial<CreateInvestorData>) {
  const existing = demoInvestors.find((investor) => investor.id === id);
  if (!existing) throw new Error('Investor not found');
  const updated = deriveInvestorValues({
    ...existing,
    ...data,
    initialCapital: data.initialCapital ?? existing.initialCapital,
    joinDate: data.joinDate ? new Date(data.joinDate).toISOString() : existing.joinDate,
    notes: data.notes ?? existing.notes,
    isOwner: data.isOwner ?? existing.isOwner,
  });
  demoInvestors = demoInvestors.map((investor) => (investor.id === id ? updated : investor));
  return updated;
}

function deleteDemoInvestor(id: string, reassignTo?: string | null) {
  const deleted = demoInvestors.find((investor) => investor.id === id);
  if (!deleted) throw new Error('Investor not found');

  demoInvestors = demoInvestors
    .filter((investor) => investor.id !== id)
    .map((investor) =>
      reassignTo && investor.id === reassignTo
        ? { ...investor, stakePercentage: investor.stakePercentage + deleted.stakePercentage }
        : investor
    );
}

function snapshotToPerformancePoint(snapshot: Snapshot): PerformancePoint {
  const fxRate = snapshot.usdSgdRate ?? fxRates[0]?.rate ?? 1.3471;
  return {
    timestamp: snapshot.timestamp,
    totalValueUsd: snapshot.totalValueUsd,
    totalValueSgd: snapshot.totalValueSgd ?? round(snapshot.totalValueUsd * fxRate),
    unrealizedPnL: round(snapshot.totalValueUsd - (snapshot.totalCostBasis ?? 0)),
    btcPrice: 100000,
    ethPrice: 4500,
  };
}

function upsertPerformancePoint(snapshot: Snapshot) {
  const point = snapshotToPerformancePoint(snapshot);
  demoPerformance = [
    ...demoPerformance.filter(
      (item) =>
        new Date(item.timestamp).toDateString() !== new Date(snapshot.timestamp).toDateString()
    ),
    point,
  ].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

type DemoSnapshotInput = {
  timestamp?: string;
  snapshotType?: Snapshot['snapshotType'];
  totalValueUsd?: number;
  totalCostBasis?: number | null;
  notes?: string | null;
  manual?: true;
};

function normalizeSnapshotInput(data: DemoSnapshotInput, existing?: Snapshot): Snapshot {
  const timestamp = new Date(
    data.timestamp ?? existing?.timestamp ?? new Date().toISOString()
  ).toISOString();
  const fxRate = fxRates[0]?.rate ?? 1.3471;
  const totalValueUsd = data.totalValueUsd ?? existing?.totalValueUsd ?? getSummary().totalValueUsd;
  const totalCostBasis = data.totalCostBasis ?? existing?.totalCostBasis ?? null;

  return {
    id: existing?.id ?? nextDemoId('snap'),
    timestamp,
    snapshotType: data.snapshotType ?? existing?.snapshotType ?? 'DAILY',
    source: 'MANUAL',
    totalValueUsd,
    totalValueSgd: round(totalValueUsd * fxRate),
    usdSgdRate: fxRate,
    totalCostBasis,
    monthlyReturn: existing?.monthlyReturn ?? null,
    ytdReturn: existing?.ytdReturn ?? null,
    btcOutperform: existing?.btcOutperform ?? null,
    ethOutperform: existing?.ethOutperform ?? null,
    notes: data.notes ?? existing?.notes ?? null,
  };
}

function createDemoSnapshot(data?: DemoSnapshotInput) {
  const snapshot = normalizeSnapshotInput({
    manual: true,
    timestamp: data?.timestamp ?? new Date().toISOString(),
    snapshotType: data?.snapshotType ?? 'DAILY',
    totalValueUsd: data?.totalValueUsd ?? getSummary().totalValueUsd,
    totalCostBasis: data?.totalCostBasis ?? getSummary().totalCostBasis,
    notes: data?.notes ?? null,
  });
  demoSnapshots = [snapshot, ...demoSnapshots].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  upsertPerformancePoint(snapshot);
  return snapshot;
}

function updateDemoSnapshot(id: string, data: DemoSnapshotInput) {
  const existing = demoSnapshots.find((snapshot) => snapshot.id === id);
  if (!existing) throw new Error('Snapshot not found');
  const updated = normalizeSnapshotInput({ ...existing, ...data, manual: true }, existing);
  demoSnapshots = demoSnapshots.map((snapshot) => (snapshot.id === id ? updated : snapshot));
  upsertPerformancePoint(updated);
  return updated;
}

function bulkImportDemoSnapshots(imports: BulkImportSnapshot[]) {
  const results: Array<{ success: boolean; timestamp: string; error?: string }> = [];

  for (const imported of imports) {
    try {
      const timestamp = new Date(imported.timestamp);
      const existing = demoSnapshots.find(
        (snapshot) => new Date(snapshot.timestamp).toDateString() === timestamp.toDateString()
      );
      const snapshot = existing
        ? updateDemoSnapshot(existing.id, imported)
        : createDemoSnapshot({ ...imported, timestamp: timestamp.toISOString() });
      demoSnapshotPositions[snapshot.id] = demoSnapshotPositions[snapshot.id] ?? [];
      results.push({ success: true, timestamp: imported.timestamp });
    } catch (error) {
      results.push({
        success: false,
        timestamp: imported.timestamp,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return {
    results,
    successCount: results.filter((result) => result.success).length,
    totalCount: imports.length,
  };
}

function updateDemoAssetNav(id: string, data: { navPrice: number; asOfDate?: string }) {
  const asset = demoAssets.find((item) => item.id === id);
  if (!asset) throw new Error('Asset not found');
  const nativeCurrency = asset.nativeCurrency.toUpperCase();
  const fxRate =
    nativeCurrency === 'USD' ? 1 : fxRates.find((rate) => rate.toCcy === nativeCurrency)?.rate;
  const currentPriceUsd = fxRate && fxRate > 0 ? data.navPrice / fxRate : data.navPrice;
  const updated: Asset = {
    ...asset,
    currentPriceUsd,
    priceUpdatedAt: data.asOfDate
      ? new Date(data.asOfDate).toISOString()
      : new Date().toISOString(),
  };
  demoAssets = demoAssets.map((item) => (item.id === id ? updated : item));
  demoPositions = demoPositions.map((position) =>
    position.assetId === id
      ? computePosition(updated, {
          id: position.id,
          assetId: position.assetId,
          quantity: position.quantity,
          avgCostUsd: position.avgCostUsd,
          storageType: position.storageType,
          storageLocation: position.storageLocation,
          notes: position.notes,
          custodyOf: position.custodyOf,
          createdAt: position.createdAt,
          updatedAt: new Date().toISOString(),
        })
      : position
  );
  return updated;
}

function benchmarkHistory(
  id: string,
  provider: 'coingecko' | 'yahoo' = 'coingecko'
): BenchmarkHistoricalData {
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
    data: demoPerformance.map((point, index) => ({
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
  return status ? demoTrades.filter((trade) => trade.status === status) : demoTrades;
}

function filterPerformance(url: URL) {
  if (url.searchParams.get('all') === 'true') return demoPerformance;

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  if (from || to) {
    const fromTime = from ? new Date(from).getTime() : Number.NEGATIVE_INFINITY;
    const toTime = to ? new Date(to).getTime() : Number.POSITIVE_INFINITY;
    return demoPerformance.filter((point) => {
      const timestamp = new Date(point.timestamp).getTime();
      return timestamp >= fromTime && timestamp <= toTime;
    });
  }

  const days = Number.parseInt(url.searchParams.get('days') ?? '30', 10);
  const windowDays = Number.isFinite(days) ? days : 30;
  const endTime = new Date(NOW).getTime();
  const startTime = endTime - windowDays * 24 * 60 * 60 * 1000;

  return demoPerformance.filter((point) => {
    const timestamp = new Date(point.timestamp).getTime();
    return timestamp >= startTime && timestamp <= endTime;
  });
}

function demoApiPath(url: URL) {
  return url.pathname.replace(/^\/api\/v1(?=\/|$)/, '/api');
}

export async function handleDemoApi(url: URL, method: string, init?: RequestInit) {
  const path = demoApiPath(url);

  if (path === '/api/positions' && method === 'GET') return json(demoPositions);
  if (path === '/api/positions' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as CreatePositionData;
    return json(createDemoPosition(body), 201);
  }
  if (path === '/api/positions' && method === 'DELETE') {
    const count = demoPositions.length;
    demoPositions = [];
    demoPositionHistory = [];
    return json({ count });
  }
  if (path === '/api/positions/summary' && method === 'GET') return json(getSummary());
  if (path === '/api/positions/performers/top' && method === 'GET') {
    return json(getPerformers('top'));
  }
  if (path === '/api/positions/performers/worst' && method === 'GET') {
    return json(getPerformers('worst'));
  }
  if (path.startsWith('/api/positions/') && path.endsWith('/history') && method === 'GET') {
    const id = path.split('/')[3];
    return json(demoPositionHistory.filter((entry) => entry.positionId === id));
  }
  if (path.startsWith('/api/positions/') && method === 'PUT') {
    const id = path.split('/')[3];
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as UpdatePositionData;
    return json(updateDemoPosition(id, body));
  }
  if (path.startsWith('/api/positions/') && path.includes('/history/') && method === 'DELETE') {
    const parts = path.split('/');
    return json(cancelDemoPositionHistory(parts[3], parts[5]));
  }
  if (path.startsWith('/api/positions/') && method === 'DELETE') {
    const id = path.split('/')[3];
    const before = demoPositions.length;
    demoPositions = demoPositions.filter((position) => position.id !== id);
    demoPositionHistory = demoPositionHistory.filter((entry) => entry.positionId !== id);
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
  if (path === '/api/trades/analytics' && method === 'GET') return json(getTradeAnalytics());
  if (path === '/api/trades' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as CreateTradeData;
    return json(createDemoTrade(body), 201);
  }
  if (path === '/api/trades/bulk-import' && method === 'POST') {
    const imports = JSON.parse((init?.body as string | undefined) ?? '[]') as BulkImportTrade[];
    const results = imports.map((trade) => {
      try {
        createDemoTrade(trade);
        return { success: true, symbol: trade.asset.symbol };
      } catch (error) {
        return {
          success: false,
          symbol: trade.asset.symbol,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });
    return json({ results }, 201);
  }
  if (path === '/api/trades' && method === 'DELETE') {
    const count = demoTrades.length;
    demoTrades = [];
    return json({ count });
  }
  if (path.startsWith('/api/trades/') && method === 'GET') {
    const id = path.split('/')[3];
    const trade = demoTrades.find((item) => item.id === id);
    return trade ? json(trade) : json({ error: 'Trade not found' }, 404);
  }
  if (path.startsWith('/api/trades/') && path.endsWith('/close') && method === 'PATCH') {
    const id = path.split('/')[3];
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      exitPrice: number;
      exitDate?: string;
      fundingCost?: number;
      notes?: string;
    };
    return json(closeDemoTrade(id, body));
  }
  if (path.startsWith('/api/trades/') && method === 'PUT') {
    const id = path.split('/')[3];
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Partial<CreateTradeData>;
    return json(updateDemoTrade(id, body));
  }
  if (path.startsWith('/api/trades/') && method === 'DELETE') {
    const id = path.split('/')[3];
    const before = demoTrades.length;
    demoTrades = demoTrades.filter((trade) => trade.id !== id);
    return before === demoTrades.length
      ? json({ error: 'Trade not found' }, 404)
      : new Response(null, { status: 204 });
  }
  if (path === '/api/investors' && method === 'GET')
    return json(demoInvestors.map(deriveInvestorValues));
  if (path === '/api/investors' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as CreateInvestorData;
    return json(createDemoInvestor(body), 201);
  }
  if (path.startsWith('/api/investors/') && path.endsWith('/report') && method === 'GET') {
    const id = path.split('/')[3];
    const investor = demoInvestors.map(deriveInvestorValues).find((item) => item.id === id);
    return investor
      ? json({ investor, snapshots: [], summary: { currentValue: investor.currentValue } })
      : json({ error: 'Investor not found' }, 404);
  }
  if (path.startsWith('/api/investors/') && method === 'GET') {
    const id = path.split('/')[3];
    const investor = demoInvestors.map(deriveInvestorValues).find((item) => item.id === id);
    return investor ? json(investor) : json({ error: 'Investor not found' }, 404);
  }
  if (path.startsWith('/api/investors/') && method === 'PUT') {
    const id = path.split('/')[3];
    const body = JSON.parse(
      (init?.body as string | undefined) ?? '{}'
    ) as Partial<CreateInvestorData>;
    return json(updateDemoInvestor(id, body));
  }
  if (path.startsWith('/api/investors/') && method === 'DELETE') {
    const id = path.split('/')[3];
    deleteDemoInvestor(id, url.searchParams.get('reassignTo'));
    return new Response(null, { status: 204 });
  }
  if (path === '/api/snapshots' && method === 'GET') return json(demoSnapshots);
  if (path === '/api/snapshots/performance' && method === 'GET')
    return json(filterPerformance(url));
  if (path === '/api/snapshots/bulk' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      snapshots?: BulkImportSnapshot[];
    };
    return json(bulkImportDemoSnapshots(body.snapshots ?? []), 201);
  }
  if (path === '/api/snapshots' && method === 'POST') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as DemoSnapshotInput & {
      type?: string;
    };
    return json(
      createDemoSnapshot(
        body.type ? { snapshotType: body.type as Snapshot['snapshotType'] } : body
      ),
      201
    );
  }
  if (path.startsWith('/api/snapshots/') && path.endsWith('/positions') && method === 'GET') {
    const id = path.split('/')[3];
    return json(demoSnapshotPositions[id] ?? []);
  }
  if (path.startsWith('/api/snapshots/') && method === 'GET') {
    const id = path.split('/')[3];
    const snapshot = demoSnapshots.find((item) => item.id === id);
    return snapshot ? json(snapshot) : json({ error: 'Snapshot not found' }, 404);
  }
  if (path.startsWith('/api/snapshots/') && method === 'PUT') {
    const id = path.split('/')[3];
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as DemoSnapshotInput;
    return json(updateDemoSnapshot(id, body));
  }
  if (path.startsWith('/api/snapshots/') && method === 'DELETE') {
    const id = path.split('/')[3];
    const deleted = demoSnapshots.find((snapshot) => snapshot.id === id);
    const before = demoSnapshots.length;
    demoSnapshots = demoSnapshots.filter((snapshot) => snapshot.id !== id);
    delete demoSnapshotPositions[id];
    if (deleted) {
      demoPerformance = demoPerformance.filter((point) => point.timestamp !== deleted.timestamp);
    }
    return before === demoSnapshots.length
      ? json({ error: 'Snapshot not found' }, 404)
      : new Response(null, { status: 204 });
  }
  if (path === '/api/snapshots' && method === 'DELETE') {
    const count = demoSnapshots.length;
    demoSnapshots = [];
    demoSnapshotPositions = {};
    demoPerformance = [];
    return json({ count });
  }
  if (path === '/api/health/db' && method === 'GET') return json(dbHealth);
  if (path === '/api/users/me/preferences' && method === 'GET') return json(demoPreferences);
  if (path === '/api/users/me/preferences' && method === 'PATCH') {
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Partial<UserPreferences>;
    demoPreferences = { ...demoPreferences, ...body };
    return json(demoPreferences);
  }
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
        {
          symbol: '285A.T',
          name: 'Kioxia Holdings Corporation',
          exchange: 'Tokyo Stock Exchange',
          nativeCurrency: 'JPY',
        },
        {
          symbol: '2330.TW',
          name: 'Taiwan Semiconductor Manufacturing Company Limited',
          exchange: 'Taiwan Stock Exchange',
          nativeCurrency: 'TWD',
        },
        {
          symbol: '005930.KS',
          name: 'Samsung Electronics Co., Ltd.',
          exchange: 'Korea Stock Exchange',
          nativeCurrency: 'KRW',
        },
        {
          symbol: '000660.KS',
          name: 'SK hynix Inc.',
          exchange: 'Korea Stock Exchange',
          nativeCurrency: 'KRW',
        },
        {
          symbol: 'ENH.OL',
          name: 'FED Energy Holdings ASA',
          exchange: 'Oslo Stock Exchange',
          nativeCurrency: 'NOK',
        },
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
  if (path.startsWith('/api/assets/') && path.endsWith('/refresh-price') && method === 'POST') {
    const id = path.split('/')[3];
    const asset = demoAssets.find((item) => item.id === id);
    if (!asset) return json({ error: 'Asset not found' }, 404);
    const updated: Asset = {
      ...asset,
      currentPriceUsd: asset.currentPriceUsd ?? seedDemoPrice(asset.coingeckoId, asset.category),
      priceUpdatedAt: new Date().toISOString(),
    };
    demoAssets = demoAssets.map((item) => (item.id === id ? updated : item));
    return json(updated);
  }
  if (path.startsWith('/api/assets/') && path.endsWith('/nav') && method === 'PATCH') {
    const id = path.split('/')[3];
    const body = JSON.parse((init?.body as string | undefined) ?? '{}') as {
      navPrice: number;
      asOfDate?: string;
    };
    return json(updateDemoAssetNav(id, body));
  }
  if (path.startsWith('/api/assets/') && method === 'GET') {
    const id = path.split('/')[3];
    const asset = demoAssets.find((item) => item.id === id);
    return asset ? json(asset) : json({ error: 'Asset not found' }, 404);
  }
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
    const readyTimer = window.setTimeout(() => setApiMockReady(true), 0);

    return () => {
      window.clearTimeout(readyTimer);
      cleanup?.();
    };
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
