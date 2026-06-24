import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { calculatePositionValue } from '../lib/domain.js';
import { SnapshotSource, SnapshotType, USD_SGD_FALLBACK_RATE } from '../lib/constants.js';

dotenv.config({ path: new URL('../../.env', import.meta.url) });

const prisma = new PrismaClient();

const SCALE_USER_ID = process.env.LOCAL_AUTH_USER_ID?.trim() || 'local-scale-user';
const SCALE_NOW = new Date('2026-06-23T12:00:00.000Z');
const SNAPSHOT_DAYS = 390;

type ScaleAsset = {
  id: string;
  symbol: string;
  name: string;
  category: string;
  currentPriceUsd: number;
  priceProvider: 'coingecko' | 'yahoo' | 'manual';
  nativeCurrency?: string;
  exchange?: string | null;
};

type SeededPosition = {
  id: string;
  assetId: string;
  symbol: string;
  quantity: number;
  avgCostUsd: number;
  marketValueUsd: number;
  storageType: string;
  storageLocation: string | null;
  custodyOf: string | null;
};

type ScalePositionRow = {
  id: string;
  symbol: string;
  quantity: number;
  avgCostUsd: number;
  storageType: string;
  storageLocation: string | null;
  custodyOf: string | null;
};

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to seed local scale data.');
  }

  if (process.env.PRODUCTION_DATABASE_URL && process.env.PRODUCTION_DATABASE_URL === databaseUrl) {
    throw new Error('Refusing to seed: DATABASE_URL matches PRODUCTION_DATABASE_URL.');
  }

  const parsed = new URL(databaseUrl);
  const host = parsed.hostname.toLowerCase();
  const dbName = parsed.pathname.replace(/^\//, '').toLowerCase();
  const localHost = ['localhost', '127.0.0.1', '::1', 'local-db'].includes(host);
  const localName = dbName.includes('example_portfolio') || dbName.includes('local');

  if (!localHost && !localName) {
    throw new Error(
      `Refusing to seed non-local database "${host}/${dbName}". Use the Docker local DB.`
    );
  }
}

function assetId(symbol: string) {
  return `scale-asset-${symbol.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}

function scaleAsset(input: Omit<ScaleAsset, 'id'>): ScaleAsset {
  return { id: assetId(input.symbol), ...input };
}

const assets: ScaleAsset[] = [
  ...[
    ['QA-BTC', 'Bitcoin Scale', 81250],
    ['QA-ETH', 'Ethereum Scale', 4320],
    ['QA-SOL', 'Solana Scale', 178],
    ['QA-LINK', 'Chainlink Scale', 18.4],
    ['QA-AAVE', 'Aave Scale', 245],
    ['QA-UNI', 'Uniswap Scale', 9.8],
    ['QA-ARB', 'Arbitrum Scale', 1.15],
    ['QA-OP', 'Optimism Scale', 1.82],
    ['QA-WLD', 'Worldcoin Scale', 0.82],
    ['QA-HYPE', 'Hyperliquid Scale', 31.2],
    ['QA-IP', 'Story Protocol Scale', 2.15],
    ['QA-ENA', 'Ethena Scale', 0.46],
    ['QA-SEI', 'Sei Scale', 0.31],
    ['QA-TIA', 'Celestia Scale', 4.2],
    ['QA-JUP', 'Jupiter Scale', 0.71],
  ].map(([symbol, name, price]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'LIQUID_CRYPTO',
      currentPriceUsd: Number(price),
      priceProvider: 'coingecko',
    })
  ),
  ...[
    ['QA-USDC', 'USDC Scale Reserve', 1],
    ['QA-USDT', 'USDT Scale Reserve', 1],
    ['QA-USDE', 'USDe Scale Reserve', 1],
    ['QA-FDUSD', 'FDUSD Scale Reserve', 1],
    ['QA-DAI', 'DAI Scale Reserve', 1],
    ['QA-PYUSD', 'PYUSD Scale Reserve', 1],
  ].map(([symbol, name, price]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'STABLECOIN',
      currentPriceUsd: Number(price),
      priceProvider: 'coingecko',
    })
  ),
  scaleAsset({
    symbol: 'QA-USD',
    name: 'USD Cash Scale',
    category: 'CASH',
    currentPriceUsd: 1,
    priceProvider: 'manual',
  }),
  scaleAsset({
    symbol: 'QA-SGD',
    name: 'SGD Cash Scale',
    category: 'CASH',
    currentPriceUsd: 0.742,
    priceProvider: 'manual',
    nativeCurrency: 'SGD',
  }),
  scaleAsset({
    symbol: 'QA-JPY',
    name: 'JPY Cash Scale',
    category: 'CASH',
    currentPriceUsd: 0.0064,
    priceProvider: 'manual',
    nativeCurrency: 'JPY',
  }),
  scaleAsset({
    symbol: 'QA-GBP',
    name: 'GBP Cash Scale',
    category: 'CASH',
    currentPriceUsd: 1.27,
    priceProvider: 'manual',
    nativeCurrency: 'GBP',
  }),
  ...[
    ['QA-VOO', 'Vanguard S&P 500 ETF Scale', 510, 'USD', 'NYSEARCA'],
    ['QA-SPY', 'SPDR S&P 500 ETF Scale', 506, 'USD', 'NYSEARCA'],
    ['QA-QQQ', 'Invesco QQQ Trust Scale', 442, 'USD', 'NASDAQ'],
    ['QA-AAPL', 'Apple Scale', 218, 'USD', 'NASDAQ'],
    ['QA-MSFT', 'Microsoft Scale', 430, 'USD', 'NASDAQ'],
    ['QA-NVDA', 'NVIDIA Scale', 128, 'USD', 'NASDAQ'],
    ['QA-TSLA', 'Tesla Scale', 186, 'USD', 'NASDAQ'],
    ['QA-META', 'Meta Scale', 515, 'USD', 'NASDAQ'],
    ['QA-D05.SI', 'DBS Scale', 22.94, 'SGD', 'SES'],
    ['QA-O39.SI', 'OCBC Scale', 11.31, 'SGD', 'SES'],
    ['QA-285A.T', 'Kioxia Scale', 18.4, 'JPY', 'TSE'],
    ['QA-005930.KS', 'Samsung Scale', 46.3, 'KRW', 'KRX'],
    ['QA-2330.TW', 'TSMC Taiwan Scale', 31.8, 'TWD', 'TWSE'],
    ['QA-EQNR.OL', 'Equinor Scale', 26.5, 'NOK', 'OSL'],
    ['QA-VWRD', 'Vanguard FTSE World Scale', 123, 'USD', 'LSE'],
    ['QA-CSPX', 'iShares Core S&P 500 Scale', 548, 'USD', 'LSE'],
  ].map(([symbol, name, price, nativeCurrency, exchange]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'EQUITY',
      currentPriceUsd: Number(price),
      priceProvider: 'yahoo',
      nativeCurrency: String(nativeCurrency),
      exchange: String(exchange),
    })
  ),
  ...[
    ['QA-UT-SGD-INC', 'Scale Global Income SGD', 1.18, 'SGD'],
    ['QA-UT-SGD-GRO', 'Scale Growth SGD', 1.42, 'SGD'],
    ['QA-UT-USD-BND', 'Scale Global Bond USD', 1.07, 'USD'],
    ['QA-UT-USD-TECH', 'Scale Technology USD', 2.34, 'USD'],
    ['QA-UT-JPY', 'Scale Japan Income JPY', 0.94, 'JPY'],
    ['QA-UT-TWD', 'Scale Taiwan Equity TWD', 1.63, 'TWD'],
    ['QA-UT-KRW', 'Scale Korea Balanced KRW', 0.88, 'KRW'],
    ['QA-UT-NOK', 'Scale Nordic Fund NOK', 1.21, 'NOK'],
    ['QA-UT-ALT', 'Scale Alternatives Fund', 1.56, 'USD'],
    ['QA-UT-CASH', 'Scale Money Market Fund', 1.01, 'USD'],
  ].map(([symbol, name, price, nativeCurrency]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'UNIT_TRUST',
      currentPriceUsd: Number(price),
      priceProvider: 'manual',
      nativeCurrency: String(nativeCurrency),
    })
  ),
  ...[
    ['QA-ANGEL-AI', 'Scale AI Infrastructure SAFE', 75000],
    ['QA-ANGEL-BIO', 'Scale Biotech SAFE', 42000],
    ['QA-ANGEL-FIN', 'Scale Fintech SAFE', 56000],
    ['QA-ANGEL-CLM', 'Scale Climate SAFE', 30000],
    ['QA-ANGEL-DEV', 'Scale Developer Tools SAFE', 36000],
  ].map(([symbol, name, price]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'ANGEL',
      currentPriceUsd: Number(price),
      priceProvider: 'manual',
    })
  ),
  ...[
    ['QA-NFT-PUNK', 'Scale Punk NFT', 12000],
    ['QA-NFT-ART', 'Scale Generative Art NFT', 6500],
    ['QA-NFT-GAME', 'Scale Gaming NFT', 1800],
    ['QA-NFT-MUSIC', 'Scale Music NFT', 900],
  ].map(([symbol, name, price]) =>
    scaleAsset({
      symbol: String(symbol),
      name: String(name),
      category: 'NFT',
      currentPriceUsd: Number(price),
      priceProvider: 'manual',
    })
  ),
];

function positionRows(): ScalePositionRow[] {
  const storageByCategory: Record<string, Array<[string, string]>> = {
    LIQUID_CRYPTO: [
      ['WALLET', 'Ledger Flex'],
      ['WALLET', 'Rabby'],
      ['CEX', 'Bybit'],
      ['DEFI', 'Hyperliquid'],
    ],
    STABLECOIN: [
      ['CEX', 'Binance'],
      ['WALLET', 'Base Safe'],
      ['CEX', 'Coinbase'],
    ],
    CASH: [
      ['BANK', 'DBS'],
      ['BANK', 'UOB'],
      ['BROKERAGE', 'IBKR'],
    ],
    EQUITY: [
      ['BROKERAGE', 'IBKR'],
      ['BROKERAGE', 'Tiger'],
      ['BROKERAGE', 'FSMOne'],
      ['BROKERAGE', 'UOB KH'],
    ],
    UNIT_TRUST: [
      ['BROKERAGE', 'FSMOne'],
      ['BROKERAGE', 'UOB KH'],
    ],
    ANGEL: [['BROKERAGE', 'Carta']],
    NFT: [['WALLET', 'Ledger Flex']],
  };

  const generatedRows: ScalePositionRow[] = assets.map((asset, index) => {
    const storageOptions = storageByCategory[asset.category] ?? [['WALLET', 'Ledger Flex']];
    const [storageType, storageLocation] = storageOptions[index % storageOptions.length];
    const categoryBase: Record<string, number> = {
      LIQUID_CRYPTO: 0.8,
      STABLECOIN: 5000,
      CASH: 12000,
      EQUITY: 40,
      UNIT_TRUST: 15000,
      ANGEL: 1,
      NFT: 1,
    };
    const quantity = categoryBase[asset.category] * (1 + (index % 5) * 0.32);
    const avgCostUsd =
      asset.currentPriceUsd * (asset.category === 'CASH' ? 1 : 0.72 + (index % 7) * 0.08);

    return {
      id: `scale-pos-${String(index + 1).padStart(3, '0')}`,
      symbol: asset.symbol,
      quantity: Number(quantity.toFixed(asset.category === 'LIQUID_CRYPTO' ? 6 : 3)),
      avgCostUsd: Number(avgCostUsd.toFixed(4)),
      storageType,
      storageLocation,
      custodyOf: null,
    };
  });

  return generatedRows.concat([
    {
      id: 'scale-pos-custody-btc-mum',
      symbol: 'QA-BTC',
      quantity: 0.18,
      avgCostUsd: 57000,
      storageType: 'WALLET',
      storageLocation: 'Ledger Flex',
      custodyOf: 'Mum',
    },
    {
      id: 'scale-pos-custody-usdc-dad',
      symbol: 'QA-USDC',
      quantity: 6000,
      avgCostUsd: 1,
      storageType: 'CEX',
      storageLocation: 'Coinbase',
      custodyOf: 'Dad',
    },
    {
      id: 'scale-pos-custody-eth-sis',
      symbol: 'QA-ETH',
      quantity: 1.5,
      avgCostUsd: 3200,
      storageType: 'WALLET',
      storageLocation: 'Rabby',
      custodyOf: 'Sister',
    },
  ]);
}

function calculateTrade(
  direction: string,
  entryPrice: number,
  exitPrice: number,
  quantity: number
) {
  const pnl =
    direction === 'SHORT'
      ? (entryPrice - exitPrice) * quantity
      : (exitPrice - entryPrice) * quantity;
  const positionSizeUsd = entryPrice * quantity;
  return {
    realizedPnL: pnl,
    realizedPnLPct: positionSizeUsd > 0 ? (pnl / positionSizeUsd) * 100 : 0,
  };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function seedAssets() {
  for (const asset of assets) {
    const coingeckoId =
      asset.priceProvider === 'coingecko' ? `scale-${asset.symbol.toLowerCase()}` : null;
    const providerAssetId =
      asset.priceProvider === 'manual' ? asset.symbol : `scale-${asset.symbol.toLowerCase()}`;
    await prisma.asset.upsert({
      where: { id: asset.id },
      update: {
        coingeckoId,
        priceProvider: asset.priceProvider,
        providerAssetId,
        nativeCurrency: asset.nativeCurrency ?? 'USD',
        exchange: asset.exchange ?? null,
        symbol: asset.symbol,
        name: asset.name,
        category: asset.category,
        currentPriceUsd: asset.currentPriceUsd,
        priceUpdatedAt: SCALE_NOW,
      },
      create: {
        id: asset.id,
        coingeckoId,
        priceProvider: asset.priceProvider,
        providerAssetId,
        nativeCurrency: asset.nativeCurrency ?? 'USD',
        exchange: asset.exchange ?? null,
        symbol: asset.symbol,
        name: asset.name,
        category: asset.category,
        currentPriceUsd: asset.currentPriceUsd,
        priceUpdatedAt: SCALE_NOW,
      },
    });
  }
}

async function seedPositions() {
  const assetMap = new Map(
    (await prisma.asset.findMany({ where: { id: { startsWith: 'scale-asset-' } } })).map(
      (asset) => [asset.symbol, asset]
    )
  );
  const seeded: SeededPosition[] = [];

  for (const row of positionRows()) {
    const asset = assetMap.get(row.symbol);
    if (!asset) throw new Error(`Missing asset for position ${row.symbol}`);

    const valueFields = calculatePositionValue({
      quantity: row.quantity,
      avgCostUsd: row.avgCostUsd,
      currentPriceUsd: asset.currentPriceUsd,
    });

    await prisma.position.upsert({
      where: { id: row.id },
      update: {
        userId: SCALE_USER_ID,
        assetId: asset.id,
        quantity: row.quantity,
        avgCostUsd: row.avgCostUsd,
        storageType: row.storageType,
        storageLocation: row.storageLocation,
        notes: 'Sanitized production-scale local seed',
        custodyOf: row.custodyOf ?? null,
        ...valueFields,
      },
      create: {
        id: row.id,
        userId: SCALE_USER_ID,
        assetId: asset.id,
        quantity: row.quantity,
        avgCostUsd: row.avgCostUsd,
        storageType: row.storageType,
        storageLocation: row.storageLocation,
        notes: 'Sanitized production-scale local seed',
        custodyOf: row.custodyOf ?? null,
        ...valueFields,
      },
    });

    seeded.push({
      id: row.id,
      assetId: asset.id,
      symbol: asset.symbol,
      quantity: row.quantity,
      avgCostUsd: row.avgCostUsd,
      marketValueUsd: valueFields.marketValueUsd ?? 0,
      storageType: row.storageType,
      storageLocation: row.storageLocation,
      custodyOf: row.custodyOf ?? null,
    });
  }

  return seeded;
}

async function seedPositionHistory(positions: SeededPosition[]) {
  for (const [index, position] of positions
    .filter((item) => !item.custodyOf)
    .slice(0, 16)
    .entries()) {
    const previousQuantity = Number((position.quantity * 0.72).toFixed(6));
    const previousAvgCostUsd = Number((position.avgCostUsd * 0.92).toFixed(4));
    const previousTotalCostUsd = previousQuantity * previousAvgCostUsd;
    const nextTotalCostUsd = position.quantity * position.avgCostUsd;
    const quantity = position.quantity - previousQuantity;
    const costBasisUsd = nextTotalCostUsd - previousTotalCostUsd;

    await prisma.positionHistory.upsert({
      where: { id: `scale-hist-${String(index + 1).padStart(3, '0')}` },
      update: {
        userId: SCALE_USER_ID,
        positionId: position.id,
        assetId: position.assetId,
        mode: 'add',
        quantity,
        costBasisUsd,
        previousQuantity,
        previousAvgCostUsd,
        previousTotalCostUsd,
        nextQuantity: position.quantity,
        nextAvgCostUsd: position.avgCostUsd,
        nextTotalCostUsd,
        operationId: null,
        createdAt: addDays(SCALE_NOW, -120 + index),
      },
      create: {
        id: `scale-hist-${String(index + 1).padStart(3, '0')}`,
        userId: SCALE_USER_ID,
        positionId: position.id,
        assetId: position.assetId,
        mode: 'add',
        quantity,
        costBasisUsd,
        previousQuantity,
        previousAvgCostUsd,
        previousTotalCostUsd,
        nextQuantity: position.quantity,
        nextAvgCostUsd: position.avgCostUsd,
        nextTotalCostUsd,
        operationId: null,
        createdAt: addDays(SCALE_NOW, -120 + index),
      },
    });
  }
}

async function seedTrades() {
  const tradeAssets = await prisma.asset.findMany({
    where: {
      id: {
        in: assets
          .filter((asset) =>
            ['LIQUID_CRYPTO', 'STABLECOIN', 'CASH', 'ANGEL', 'NFT'].includes(asset.category)
          )
          .map((asset) => asset.id),
      },
    },
    orderBy: { symbol: 'asc' },
  });
  const baseDate = new Date('2025-01-03T00:00:00.000Z');

  for (let index = 0; index < 240; index += 1) {
    const asset = tradeAssets[index % tradeAssets.length];
    const direction = index % 7 === 0 ? 'SHORT' : 'LONG';
    const entryDate = addDays(baseDate, index * 2);
    const isOpen = index % 6 === 0;
    const entryPrice = Number(
      ((asset.currentPriceUsd ?? 1) * (0.88 + (index % 9) * 0.035)).toFixed(4)
    );
    const move = index % 5 === 0 ? -0.09 : 0.035 + (index % 8) * 0.011;
    const exitPrice =
      direction === 'SHORT'
        ? Number((entryPrice * (1 - move)).toFixed(4))
        : Number((entryPrice * (1 + move)).toFixed(4));
    const quantity = Number(
      (asset.category === 'LIQUID_CRYPTO' ? 0.5 + index * 0.045 : 1 + (index % 11) * 1.7).toFixed(4)
    );
    const positionSizeUsd = entryPrice * quantity;
    const realized = isOpen ? null : calculateTrade(direction, entryPrice, exitPrice, quantity);

    await prisma.trade.upsert({
      where: { id: `scale-trade-${String(index + 1).padStart(3, '0')}` },
      update: {
        userId: SCALE_USER_ID,
        assetId: asset.id,
        direction,
        entryPrice,
        exitPrice: isOpen ? null : exitPrice,
        quantity,
        positionSizeUsd,
        entryDate,
        exitDate: isOpen ? null : addDays(entryDate, 1 + (index % 12)),
        realizedPnL: realized?.realizedPnL ?? null,
        realizedPnLPct: realized?.realizedPnLPct ?? null,
        status: isOpen ? 'OPEN' : 'CLOSED',
        notes: `Sanitized scale trade ${index + 1}`,
        tags: JSON.stringify([index % 2 === 0 ? 'scale' : 'regression', direction.toLowerCase()]),
      },
      create: {
        id: `scale-trade-${String(index + 1).padStart(3, '0')}`,
        userId: SCALE_USER_ID,
        assetId: asset.id,
        direction,
        entryPrice,
        exitPrice: isOpen ? null : exitPrice,
        quantity,
        positionSizeUsd,
        entryDate,
        exitDate: isOpen ? null : addDays(entryDate, 1 + (index % 12)),
        realizedPnL: realized?.realizedPnL ?? null,
        realizedPnLPct: realized?.realizedPnLPct ?? null,
        status: isOpen ? 'OPEN' : 'CLOSED',
        notes: `Sanitized scale trade ${index + 1}`,
        tags: JSON.stringify([index % 2 === 0 ? 'scale' : 'regression', direction.toLowerCase()]),
      },
    });
  }
}

async function seedSnapshots(positions: SeededPosition[]) {
  const ownedPositions = positions.filter((position) => !position.custodyOf);
  const finalValue = ownedPositions.reduce((sum, position) => sum + position.marketValueUsd, 0);
  const topPositions = [...ownedPositions]
    .sort((a, b) => b.marketValueUsd - a.marketValueUsd)
    .slice(0, 12);
  const startDate = addDays(SCALE_NOW, -(SNAPSHOT_DAYS - 1));

  for (let index = 0; index < SNAPSHOT_DAYS; index += 1) {
    const timestamp = addDays(startDate, index);
    const progress = index / Math.max(1, SNAPSHOT_DAYS - 1);
    const trend = finalValue * (0.58 + progress * 0.42);
    const wave =
      Math.sin(index / 13) * finalValue * 0.018 + Math.cos(index / 29) * finalValue * 0.01;
    const drawdown =
      index > 210 && index < 245 ? -finalValue * 0.075 * (1 - Math.abs(index - 227) / 18) : 0;
    const totalValueUsd = Math.max(10000, trend + wave + drawdown);
    const totalCostBasis = totalValueUsd * (0.78 + (index % 14) * 0.004);
    const snapshotId = `scale-snap-${timestamp.toISOString().slice(0, 10)}`;

    await prisma.snapshot.upsert({
      where: { id: snapshotId },
      update: {
        userId: SCALE_USER_ID,
        timestamp,
        snapshotType:
          timestamp.getUTCDate() === 1
            ? SnapshotType.MONTHLY
            : timestamp.getUTCDay() === 0
              ? SnapshotType.WEEKLY
              : SnapshotType.DAILY,
        source: index % 31 === 0 ? SnapshotSource.MANUAL : SnapshotSource.AUTOMATIC,
        totalValueUsd,
        totalValueSgd: totalValueUsd * USD_SGD_FALLBACK_RATE,
        usdSgdRate: USD_SGD_FALLBACK_RATE,
        totalCostBasis,
        unrealizedPnL: totalValueUsd - totalCostBasis,
        monthlyReturn: Math.sin(index / 16) * 4,
        ytdReturn: progress * 100 - 12,
        btcPrice: 70000 + index * 92,
        ethPrice: 3100 + index * 4.5,
        notes: index % 45 === 0 ? `Scale checkpoint ${Math.floor(index / 45) + 1}` : null,
      },
      create: {
        id: snapshotId,
        userId: SCALE_USER_ID,
        timestamp,
        snapshotType:
          timestamp.getUTCDate() === 1
            ? SnapshotType.MONTHLY
            : timestamp.getUTCDay() === 0
              ? SnapshotType.WEEKLY
              : SnapshotType.DAILY,
        source: index % 31 === 0 ? SnapshotSource.MANUAL : SnapshotSource.AUTOMATIC,
        totalValueUsd,
        totalValueSgd: totalValueUsd * USD_SGD_FALLBACK_RATE,
        usdSgdRate: USD_SGD_FALLBACK_RATE,
        totalCostBasis,
        unrealizedPnL: totalValueUsd - totalCostBasis,
        monthlyReturn: Math.sin(index / 16) * 4,
        ytdReturn: progress * 100 - 12,
        btcPrice: 70000 + index * 92,
        ethPrice: 3100 + index * 4.5,
        notes: index % 45 === 0 ? `Scale checkpoint ${Math.floor(index / 45) + 1}` : null,
      },
    });

    if (timestamp.getUTCDate() === 1 || index === SNAPSHOT_DAYS - 1) {
      for (const [positionIndex, position] of topPositions.entries()) {
        const scaledValue = position.marketValueUsd * (totalValueUsd / finalValue);
        await prisma.snapshotPosition.upsert({
          where: { id: `scale-sp-${snapshotId}-${String(positionIndex + 1).padStart(2, '0')}` },
          update: {
            snapshotId,
            assetSymbol: position.symbol,
            quantity: position.quantity,
            priceUsd: position.quantity > 0 ? scaledValue / position.quantity : 0,
            valueUsd: scaledValue,
            allocation: totalValueUsd > 0 ? (scaledValue / totalValueUsd) * 100 : 0,
          },
          create: {
            id: `scale-sp-${snapshotId}-${String(positionIndex + 1).padStart(2, '0')}`,
            snapshotId,
            assetSymbol: position.symbol,
            quantity: position.quantity,
            priceUsd: position.quantity > 0 ? scaledValue / position.quantity : 0,
            valueUsd: scaledValue,
            allocation: totalValueUsd > 0 ? (scaledValue / totalValueUsd) * 100 : 0,
          },
        });
      }
    }
  }
}

async function seedInvestors(finalValue: number) {
  const investors = [
    ['scale-investor-owner', 'Scale Owner', 62.5, true],
    ['scale-investor-family', 'Scale Family Trust', 20, false],
    ['scale-investor-lp', 'Scale Angel LP', 10, false],
    ['scale-investor-sibling', 'Scale Sibling', 7.5, false],
    ['scale-investor-observer', 'Scale Observer', 0, false],
  ] as const;

  for (const [id, name, stakePercentage, isOwner] of investors) {
    const currentValue = finalValue * (stakePercentage / 100);
    const initialCapital = currentValue * 0.74;
    await prisma.investor.upsert({
      where: { id },
      update: {
        userId: SCALE_USER_ID,
        name,
        stakePercentage,
        initialCapital,
        currentValue,
        totalReturn: currentValue - initialCapital,
        totalReturnPct:
          initialCapital > 0 ? ((currentValue - initialCapital) / initialCapital) * 100 : 0,
        joinDate: new Date('2025-01-01T00:00:00.000Z'),
        notes: 'Sanitized production-scale local seed',
        isOwner,
      },
      create: {
        id,
        userId: SCALE_USER_ID,
        name,
        stakePercentage,
        initialCapital,
        currentValue,
        totalReturn: currentValue - initialCapital,
        totalReturnPct:
          initialCapital > 0 ? ((currentValue - initialCapital) / initialCapital) * 100 : 0,
        joinDate: new Date('2025-01-01T00:00:00.000Z'),
        notes: 'Sanitized production-scale local seed',
        isOwner,
      },
    });

    await prisma.investorStake.upsert({
      where: { id: `scale-stake-${id}` },
      update: {
        investorId: id,
        stakePercentage,
        valueAtTime: currentValue,
        timestamp: SCALE_NOW,
      },
      create: {
        id: `scale-stake-${id}`,
        investorId: id,
        stakePercentage,
        valueAtTime: currentValue,
        timestamp: SCALE_NOW,
      },
    });
  }
}

async function seedFxRates() {
  const rates = [
    ['USD', 'SGD', USD_SGD_FALLBACK_RATE],
    ['USD', 'JPY', 156.2],
    ['USD', 'TWD', 32.4],
    ['USD', 'KRW', 1390],
    ['USD', 'NOK', 10.6],
    ['USD', 'GBP', 0.79],
  ] as const;

  for (const [fromCcy, toCcy, rate] of rates) {
    await prisma.fxRate.upsert({
      where: { fromCcy_toCcy: { fromCcy, toCcy } },
      update: { rate, timestamp: SCALE_NOW },
      create: { fromCcy, toCcy, rate, timestamp: SCALE_NOW },
    });
  }
}

async function seed() {
  assertLocalDatabase();

  await prisma.user.upsert({
    where: { id: SCALE_USER_ID },
    update: {
      email: `${SCALE_USER_ID}@local.foliobuddy.test`,
      name: 'Local Scale User',
    },
    create: {
      id: SCALE_USER_ID,
      email: `${SCALE_USER_ID}@local.foliobuddy.test`,
      name: 'Local Scale User',
    },
  });

  await seedFxRates();
  await seedAssets();
  const positions = await seedPositions();
  await seedPositionHistory(positions);
  await seedTrades();
  await seedSnapshots(positions);
  await seedInvestors(
    positions
      .filter((position) => !position.custodyOf)
      .reduce((sum, position) => sum + position.marketValueUsd, 0)
  );

  const [assetCount, positionCount, tradeCount, snapshotCount, investorCount] = await Promise.all([
    prisma.asset.count({ where: { id: { startsWith: 'scale-asset-' } } }),
    prisma.position.count({ where: { userId: SCALE_USER_ID } }),
    prisma.trade.count({ where: { userId: SCALE_USER_ID } }),
    prisma.snapshot.count({ where: { userId: SCALE_USER_ID } }),
    prisma.investor.count({ where: { userId: SCALE_USER_ID } }),
  ]);

  console.info(
    JSON.stringify(
      {
        userId: SCALE_USER_ID,
        assetCount,
        positionCount,
        tradeCount,
        snapshotCount,
        investorCount,
      },
      null,
      2
    )
  );
}

seed()
  .catch((error) => {
    console.error('Scale seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
