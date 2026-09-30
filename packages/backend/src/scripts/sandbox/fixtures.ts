import { AssetCategory, StorageType, USD_SGD_FALLBACK_RATE } from '../../lib/constants.js';
import { extractCashtags } from '../../services/news/xPostText.js';
import type { IbkrCashSnapshot } from '../../services/ibkrCapture.js';

/**
 * Sample data for the local sandbox: a made-up portfolio of real, public
 * tickers, so prices, news and X-post matching behave as they do for real
 * holdings. Quantities and costs are invented; this is nobody's portfolio.
 */

const HOUR_MS = 60 * 60 * 1000;
const SGD_PER_USD = USD_SGD_FALLBACK_RATE;
const TWD_PER_USD = 32.4;

type PriceProvider = 'coingecko' | 'yahoo' | 'manual';

export interface SandboxAsset {
  id: string;
  symbol: string;
  name: string;
  category: AssetCategory;
  priceProvider: PriceProvider;
  providerAssetId: string | null;
  coingeckoId: string | null;
  nativeCurrency: string;
  exchange: string | null;
  officialDomain: string | null;
  currentPriceUsd: number;
  /** Unit trusts quote in their own currency; the USD price follows from FX. */
  currentPriceNative: number | null;
}

function asset(
  key: string,
  fields: Omit<
    SandboxAsset,
    'id' | 'coingeckoId' | 'nativeCurrency' | 'exchange' | 'officialDomain' | 'currentPriceNative'
  > &
    Partial<SandboxAsset>
): SandboxAsset {
  return {
    id: `sandbox-asset-${key}`,
    coingeckoId: null,
    nativeCurrency: 'USD',
    exchange: null,
    officialDomain: null,
    currentPriceNative: null,
    ...fields,
  };
}

function crypto(key: string, symbol: string, name: string, coingeckoId: string, price: number) {
  return asset(key, {
    symbol,
    name,
    category: AssetCategory.LIQUID_CRYPTO,
    priceProvider: 'coingecko',
    providerAssetId: coingeckoId,
    coingeckoId,
    currentPriceUsd: price,
  });
}

function equity(
  key: string,
  symbol: string,
  name: string,
  priceUsd: number,
  extra: Partial<SandboxAsset> = {}
) {
  return asset(key, {
    symbol,
    name,
    category: AssetCategory.EQUITY,
    priceProvider: 'yahoo',
    providerAssetId: symbol,
    exchange: 'NMS',
    currentPriceUsd: priceUsd,
    ...extra,
  });
}

function cash(currency: string, priceUsd: number) {
  return asset(currency.toLowerCase(), {
    symbol: currency,
    name: `Cash ${currency}`,
    category: AssetCategory.CASH,
    priceProvider: 'manual',
    providerAssetId: null,
    nativeCurrency: currency,
    currentPriceUsd: priceUsd,
  });
}

export const SANDBOX_ASSETS: SandboxAsset[] = [
  crypto('btc', 'BTC', 'Bitcoin', 'bitcoin', 95_000),
  crypto('eth', 'ETH', 'Ethereum', 'ethereum', 3_600),
  crypto('sol', 'SOL', 'Solana', 'solana', 180),
  crypto('link', 'LINK', 'Chainlink', 'chainlink', 18),
  { ...crypto('usdc', 'USDC', 'USD Coin', 'usd-coin', 1), category: AssetCategory.STABLECOIN },
  equity('nvda', 'NVDA', 'NVIDIA Corporation', 175, { officialDomain: 'nvidia.com' }),
  equity('msft', 'MSFT', 'Microsoft Corporation', 480, { officialDomain: 'microsoft.com' }),
  equity('googl', 'GOOGL', 'Alphabet Inc.', 190),
  // Held only through an open trade: exercises the "open trade" news target.
  equity('amd', 'AMD', 'Advanced Micro Devices, Inc.', 160),
  equity(
    'tsmc',
    '2330.TW',
    'Taiwan Semiconductor Manufacturing Company Limited',
    1_100 / TWD_PER_USD,
    { nativeCurrency: 'TWD', exchange: 'TAI' }
  ),
  equity('dbs', 'D05.SI', 'DBS Group Holdings Ltd', 45 / SGD_PER_USD, {
    nativeCurrency: 'SGD',
    exchange: 'SES',
  }),
  equity('hynix', '000660.KS', 'SK Hynix Inc.', 90000 / 1380, {
    nativeCurrency: 'KRW',
    exchange: 'KSC',
  }),
  asset('fund', {
    symbol: 'SBXGEF',
    name: 'Sandbox Global Equity Fund',
    category: AssetCategory.UNIT_TRUST,
    priceProvider: 'manual',
    providerAssetId: null,
    nativeCurrency: 'SGD',
    currentPriceNative: 1.52,
    currentPriceUsd: 1.52 / SGD_PER_USD,
  }),
  cash('USD', 1),
  cash('SGD', 1 / SGD_PER_USD),
];

export interface SandboxPosition {
  id: string;
  assetId: string;
  quantity: number;
  avgCostUsd: number;
  avgCostNative?: number;
  costCurrency?: string;
  storageType: StorageType;
  storageLocation: string;
  custodyOf: string | null;
  ibkrCash?: IbkrCashSnapshot;
}

function position(
  key: string,
  quantity: number,
  avgCostUsd: number,
  storageType: StorageType,
  storageLocation: string,
  custodyOf: string | null = null
): SandboxPosition {
  return {
    id: custodyOf ? `sandbox-pos-${key}-${custodyOf.toLowerCase()}` : `sandbox-pos-${key}`,
    assetId: `sandbox-asset-${key}`,
    quantity,
    avgCostUsd,
    storageType,
    storageLocation,
    custodyOf,
  };
}

export const SANDBOX_POSITIONS: SandboxPosition[] = [
  position('btc', 0.85, 41_000, StorageType.CEX, 'Binance'),
  position('eth', 6.2, 2_050, StorageType.WALLET, 'Ledger'),
  position('sol', 140, 88, StorageType.CEX, 'OKX'),
  position('link', 520, 11.5, StorageType.WALLET, 'Ledger'),
  position('usdc', 12_000, 1, StorageType.CEX, 'Binance'),
  position('nvda', 80, 46, StorageType.BROKERAGE, 'IBKR'),
  position('msft', 30, 305, StorageType.BROKERAGE, 'IBKR'),
  position('googl', 45, 118, StorageType.BROKERAGE, 'Tiger'),
  position('tsmc', 600, 18, StorageType.BROKERAGE, 'IBKR'),
  {
    ...position('hynix', 30, 40, StorageType.BROKERAGE, 'IBKR'),
    avgCostNative: 60000.123456,
    costCurrency: 'KRW',
  },
  position('dbs', 900, 21, StorageType.BROKERAGE, 'UOB KH'),
  position('fund', 8_000, 0.98, StorageType.BROKERAGE, 'FSMOne'),
  position('sgd', 25_000, 1 / SGD_PER_USD, StorageType.BANK, 'DBS'),
  {
    ...position('usd', -450, 1, StorageType.BROKERAGE, 'IBKR'),
    ibkrCash: {
      capturedAt: new Date().toISOString(),
      source: 'ibkr',
      baseCurrency: 'USD',
      baseCash: -450,
      baseToUsd: 1,
      netCashUsd: -450,
      balances: [
        { currency: 'USD', cashBalance: 300, fxRateToUsd: 1 },
        { currency: 'JPY', cashBalance: -111000, fxRateToUsd: 1 / 148 },
      ],
    },
  },
  // "Held for Others": excluded from net worth, P&L and snapshots.
  position('eth', 1.5, 2_400, StorageType.WALLET, 'Ledger', 'Alex'),
];

/** Add/reduce ledger rows that end at the matching position's current totals. */
export const SANDBOX_POSITION_HISTORY = [
  {
    id: 'sandbox-hist-btc-add',
    positionId: 'sandbox-pos-btc',
    mode: 'add' as const,
    previousQuantity: 0.5,
    previousAvgCostUsd: 36_000,
    proceedsUsd: null,
    daysAgo: 20,
  },
  {
    id: 'sandbox-hist-nvda-reduce',
    positionId: 'sandbox-pos-nvda',
    mode: 'reduce' as const,
    previousQuantity: 100,
    previousAvgCostUsd: 46,
    proceedsUsd: 3_400,
    daysAgo: 10,
  },
];

export interface SandboxTrade {
  id: string;
  assetId: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  entryDaysAgo: number;
  exitDaysAgo: number | null;
  fundingCost: number;
  notes: string;
  tags: string[];
}

export const SANDBOX_TRADES: SandboxTrade[] = [
  {
    id: 'sandbox-trade-sol-swing',
    assetId: 'sandbox-asset-sol',
    direction: 'LONG',
    entryPrice: 142,
    exitPrice: 186,
    quantity: 60,
    entryDaysAgo: 40,
    exitDaysAgo: 22,
    fundingCost: 18,
    notes: 'Breakout retest',
    tags: ['swing'],
  },
  {
    id: 'sandbox-trade-eth-short',
    assetId: 'sandbox-asset-eth',
    direction: 'SHORT',
    entryPrice: 3_450,
    exitPrice: 3_180,
    quantity: 3,
    entryDaysAgo: 30,
    exitDaysAgo: 26,
    fundingCost: 9,
    notes: 'Hedge into the upgrade',
    tags: ['hedge'],
  },
  {
    id: 'sandbox-trade-nvda-stop',
    assetId: 'sandbox-asset-nvda',
    direction: 'LONG',
    entryPrice: 182,
    exitPrice: 168,
    quantity: 25,
    entryDaysAgo: 60,
    exitDaysAgo: 45,
    fundingCost: 0,
    notes: 'Stopped out after the gap down',
    tags: ['earnings'],
  },
  {
    id: 'sandbox-trade-btc-trend',
    assetId: 'sandbox-asset-btc',
    direction: 'LONG',
    entryPrice: 88_000,
    exitPrice: 97_500,
    quantity: 0.2,
    entryDaysAgo: 75,
    exitDaysAgo: 50,
    fundingCost: 35,
    notes: 'Trend follow',
    tags: ['trend'],
  },
  {
    id: 'sandbox-trade-amd-open',
    assetId: 'sandbox-asset-amd',
    direction: 'LONG',
    entryPrice: 150,
    exitPrice: null,
    quantity: 40,
    entryDaysAgo: 5,
    exitDaysAgo: null,
    fundingCost: 0,
    notes: 'Custom-accelerator thesis',
    tags: ['thesis'],
  },
  {
    id: 'sandbox-trade-btc-perp',
    assetId: 'sandbox-asset-btc',
    direction: 'LONG',
    entryPrice: 94_000,
    exitPrice: null,
    quantity: 0.15,
    entryDaysAgo: 3,
    exitDaysAgo: null,
    fundingCost: 0,
    notes: 'Perp long',
    tags: ['perp'],
  },
];

export const SANDBOX_INVESTORS = [
  { id: 'sandbox-investor-owner', name: 'Sandbox Owner', stakePercentage: 80, isOwner: true },
  { id: 'sandbox-investor-family', name: 'Family Trust', stakePercentage: 20, isOwner: false },
];

export const SANDBOX_FX_RATES: Array<[fromCcy: string, toCcy: string, rate: number]> = [
  ['USD', 'SGD', SGD_PER_USD],
  ['USD', 'JPY', 148],
  ['USD', 'TWD', TWD_PER_USD],
  ['USD', 'KRW', 1_380],
  ['USD', 'NOK', 10.6],
  ['USD', 'GBP', 0.76],
];

interface SandboxXPostSeed {
  handle: string;
  hoursAgo: number;
  text: string;
  hasExternalLink?: boolean;
}

// Invented posts from the fictional roster, shaped to exercise the ranking
// rules: anchors and important corroboration reach the feed; radar posts,
// questions and cashtag baskets stay on holding pages.
const SANDBOX_X_POST_SEEDS: SandboxXPostSeed[] = [
  {
    handle: 'fbsandbox_desk',
    hoursAgo: 2,
    hasExternalLink: true,
    text: '$NVDA raises full-year guidance: data-center revenue jumps 40% as next-gen accelerator supply is booked into 2027.',
  },
  {
    handle: 'fbsandbox_radar',
    hoursAgo: 3,
    text: 'Watching $SOL fee markets into the next client release; congestion metrics are trending up.',
  },
  {
    handle: 'fbsandbox_macro',
    hoursAgo: 4,
    text: 'Spot $BTC ETF inflows hit $1.2B this week, the largest since March, per issuer data.',
  },
  {
    handle: 'fbsandbox_chain',
    hoursAgo: 6,
    hasExternalLink: true,
    text: '$ETH mainnet upgrade goes live on schedule; client teams report finality stable across the first 1,000 epochs.',
  },
  {
    handle: 'fbsandbox_desk',
    hoursAgo: 9,
    hasExternalLink: true,
    text: 'TSMC revenue jumps 38% year on year on AI accelerator demand, well ahead of what the street modeled.',
  },
  {
    handle: 'fbsandbox_macro',
    hoursAgo: 12,
    text: '$BTC $ETH $SOL $LINK all bid into the weekend as funding resets.',
  },
  {
    handle: 'fbsandbox_macro',
    hoursAgo: 20,
    text: 'DBS posts record quarterly profit and lifts its dividend; management sees loan growth holding steady.',
  },
  {
    handle: 'fbsandbox_radar',
    hoursAgo: 26,
    text: '$LINK integration count keeps climbing; watching whether fees follow.',
  },
  {
    handle: 'fbsandbox_macro',
    hoursAgo: 30,
    text: "Is $MSFT's capex outlook too aggressive after the latest guidance?",
  },
  {
    handle: 'fbsandbox_desk',
    hoursAgo: 50,
    hasExternalLink: true,
    text: 'Alphabet wins a $4B cloud contract with a sovereign buyer; the deal runs five years.',
  },
  {
    handle: 'fbsandbox_desk',
    hoursAgo: 70,
    text: '$AMD design win at a hyperscaler for a custom accelerator; volumes ramp next year.',
  },
];

/** The sample posts as stored rows, dated relative to `now` so they stay recent. */
export function sandboxXPosts(now: Date) {
  return SANDBOX_X_POST_SEEDS.map((post, index) => {
    const postedAt = new Date(now.getTime() - post.hoursAgo * HOUR_MS);
    return {
      id: `99900000000000${String(index + 1).padStart(4, '0')}`,
      authorHandle: post.handle,
      authorKey: post.handle.toLowerCase(),
      text: post.text,
      quotedPostId: null,
      quotedHandle: null,
      quotedText: null,
      hasExternalLink: post.hasExternalLink ?? false,
      cashtags: extractCashtags(post.text),
      lang: 'en',
      postedAt,
      collectedAt: new Date(postedAt.getTime() + 5 * 60 * 1000),
    };
  });
}
