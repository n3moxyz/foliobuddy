import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_USER_ID = 'default-user';

// Sample assets with CoinGecko IDs
const SAMPLE_ASSETS = [
  { symbol: 'BTC', name: 'Bitcoin', coingeckoId: 'bitcoin', category: 'LIQUID_CRYPTO' as const },
  { symbol: 'ETH', name: 'Ethereum', coingeckoId: 'ethereum', category: 'LIQUID_CRYPTO' as const },
  { symbol: 'SOL', name: 'Solana', coingeckoId: 'solana', category: 'LIQUID_CRYPTO' as const },
  {
    symbol: 'AVAX',
    name: 'Avalanche',
    coingeckoId: 'avalanche-2',
    category: 'LIQUID_CRYPTO' as const,
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    coingeckoId: 'chainlink',
    category: 'LIQUID_CRYPTO' as const,
  },
  { symbol: 'AAVE', name: 'Aave', coingeckoId: 'aave', category: 'LIQUID_CRYPTO' as const },
  { symbol: 'UNI', name: 'Uniswap', coingeckoId: 'uniswap', category: 'LIQUID_CRYPTO' as const },
  { symbol: 'USDC', name: 'USD Coin', coingeckoId: 'usd-coin', category: 'STABLECOIN' as const },
  { symbol: 'USDT', name: 'Tether', coingeckoId: 'tether', category: 'STABLECOIN' as const },
];

async function seed() {
  console.log('Starting seed...');

  // Create default user
  await prisma.user.upsert({
    where: { id: DEFAULT_USER_ID },
    update: {},
    create: {
      id: DEFAULT_USER_ID,
      email: 'default@portfolio.app',
      name: 'Default User',
    },
  });
  console.log('Created default user');

  // Create sample assets
  for (const asset of SAMPLE_ASSETS) {
    await prisma.asset.upsert({
      where: { coingeckoId: asset.coingeckoId },
      update: {},
      create: asset,
    });
  }
  console.log(`Created ${SAMPLE_ASSETS.length} assets`);

  // Create initial USD/SGD rate
  await prisma.fxRate.upsert({
    where: {
      fromCcy_toCcy: {
        fromCcy: 'USD',
        toCcy: 'SGD',
      },
    },
    update: {},
    create: {
      fromCcy: 'USD',
      toCcy: 'SGD',
      rate: 1.35,
    },
  });
  console.log('Created USD/SGD rate');

  // Create sample positions
  const btc = await prisma.asset.findFirst({ where: { symbol: 'BTC' } });
  const eth = await prisma.asset.findFirst({ where: { symbol: 'ETH' } });
  const sol = await prisma.asset.findFirst({ where: { symbol: 'SOL' } });

  // Check if sample positions exist to avoid duplicates on re-run
  const existingBtcPosition = btc
    ? await prisma.position.findFirst({
        where: { userId: DEFAULT_USER_ID, assetId: btc.id, storageLocation: 'Ledger' },
      })
    : null;

  const existingEthPosition = eth
    ? await prisma.position.findFirst({
        where: { userId: DEFAULT_USER_ID, assetId: eth.id, storageLocation: 'Binance' },
      })
    : null;

  const existingSolPosition = sol
    ? await prisma.position.findFirst({
        where: { userId: DEFAULT_USER_ID, assetId: sol.id, storageLocation: 'Phantom' },
      })
    : null;

  if (btc && !existingBtcPosition) {
    await prisma.position.create({
      data: {
        userId: DEFAULT_USER_ID,
        assetId: btc.id,
        quantity: 0.5,
        avgCostUsd: 35000,
        storageType: 'WALLET',
        storageLocation: 'Ledger',
      },
    });
  }

  if (eth && !existingEthPosition) {
    await prisma.position.create({
      data: {
        userId: DEFAULT_USER_ID,
        assetId: eth.id,
        quantity: 5,
        avgCostUsd: 2000,
        storageType: 'CEX',
        storageLocation: 'Binance',
      },
    });
  }

  if (sol && !existingSolPosition) {
    await prisma.position.create({
      data: {
        userId: DEFAULT_USER_ID,
        assetId: sol.id,
        quantity: 50,
        avgCostUsd: 80,
        storageType: 'WALLET',
        storageLocation: 'Phantom',
      },
    });
  }

  console.log('Created sample positions');

  // Create sample trade
  if (btc) {
    await prisma.trade.create({
      data: {
        userId: DEFAULT_USER_ID,
        assetId: btc.id,
        direction: 'LONG',
        entryPrice: 40000,
        exitPrice: 45000,
        quantity: 0.1,
        positionSizeUsd: 4000,
        entryDate: new Date('2024-01-15'),
        exitDate: new Date('2024-02-01'),
        status: 'CLOSED',
        realizedPnL: 500,
        realizedPnLPct: 12.5,
        notes: 'Sample profitable trade',
      },
    });
  }

  console.log('Created sample trade');

  // Create sample investor
  await prisma.investor.upsert({
    where: {
      id: 'sample-investor',
    },
    update: {},
    create: {
      id: 'sample-investor',
      userId: DEFAULT_USER_ID,
      name: 'Sample Investor',
      stakePercentage: 10,
      initialCapital: 10000,
    },
  });

  console.log('Created sample investor');

  console.log('Seed completed successfully!');
}

seed()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(() => {
    prisma.$disconnect();
  });
