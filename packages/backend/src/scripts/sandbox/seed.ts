import { Prisma, PrismaClient } from '@prisma/client';
import { calculatePositionValue } from '../../lib/domain.js';
import { SnapshotSource, SnapshotType, USD_SGD_FALLBACK_RATE } from '../../lib/constants.js';
import { calculateTradePnL } from '../../lib/tradePnL.js';
import { assertSandboxDatabase, SANDBOX_USER_ID, SANDBOX_X_ROSTER } from './config.js';
import {
  SANDBOX_ASSETS,
  SANDBOX_FX_RATES,
  SANDBOX_INVESTORS,
  SANDBOX_POSITION_HISTORY,
  SANDBOX_POSITIONS,
  SANDBOX_TRADES,
  sandboxXPosts,
} from './fixtures.js';

/**
 * Seeds the local sandbox database (run by `npm run sandbox`). The portfolio
 * is written once and then left alone, so what a tester changes survives a
 * restart; `npm run sandbox -- --reset` starts over. Snapshots are rebuilt
 * when they no longer reach today, and the sample X posts are re-dated on
 * every run so the News tab always has recent ones.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const SNAPSHOT_DAYS = 400;
// 05:00 Singapore, the app's default snapshot hour.
const SNAPSHOT_UTC_HOUR = 21;
const SNAPSHOT_POSITIONS = 10;

const prisma = new PrismaClient();

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

async function seedPortfolio(now: Date): Promise<void> {
  await prisma.user.upsert({
    where: { id: SANDBOX_USER_ID },
    update: {},
    create: {
      id: SANDBOX_USER_ID,
      email: `${SANDBOX_USER_ID}@local.foliobuddy.test`,
      name: 'Sandbox User',
      perpExposureUsd: 15_000,
    },
  });
  for (const [fromCcy, toCcy, rate] of SANDBOX_FX_RATES) {
    await prisma.fxRate.upsert({
      where: { fromCcy_toCcy: { fromCcy, toCcy } },
      update: { rate, timestamp: now },
      create: { fromCcy, toCcy, rate, timestamp: now },
    });
  }

  await prisma.asset.createMany({
    data: SANDBOX_ASSETS.map(({ currentPriceNative, ...asset }) => ({
      ...asset,
      priceUpdatedAt: now,
      ...(currentPriceNative !== null && {
        currentPriceNative,
        priceAsOf: daysAgo(now, 1),
        priceSource: 'manual',
        priceFxRateToUsd: asset.currentPriceUsd / currentPriceNative,
      }),
    })),
    skipDuplicates: true,
  });

  const prices = new Map(SANDBOX_ASSETS.map((asset) => [asset.id, asset.currentPriceUsd]));
  await prisma.position.createMany({
    data: SANDBOX_POSITIONS.map(({ ibkrCash, ...position }) => ({
      ...position,
      ...(ibkrCash
        ? { ibkrCash: JSON.parse(JSON.stringify(ibkrCash)) as Prisma.InputJsonValue }
        : {}),
      userId: SANDBOX_USER_ID,
      notes: 'Sandbox sample data',
      ...calculatePositionValue({ ...position, currentPriceUsd: prices.get(position.assetId) }),
    })),
    skipDuplicates: true,
  });

  const positions = new Map(SANDBOX_POSITIONS.map((position) => [position.id, position]));
  await prisma.positionHistory.createMany({
    data: SANDBOX_POSITION_HISTORY.map(({ daysAgo: age, positionId, ...entry }) => {
      const next = positions.get(positionId)!;
      const previousTotalCostUsd = entry.previousQuantity * entry.previousAvgCostUsd;
      const nextTotalCostUsd = next.quantity * next.avgCostUsd;
      return {
        ...entry,
        userId: SANDBOX_USER_ID,
        positionId,
        assetId: next.assetId,
        quantity: Math.abs(next.quantity - entry.previousQuantity),
        costBasisUsd: Math.abs(nextTotalCostUsd - previousTotalCostUsd),
        previousTotalCostUsd,
        nextQuantity: next.quantity,
        nextAvgCostUsd: next.avgCostUsd,
        nextTotalCostUsd,
        createdAt: daysAgo(now, age),
      };
    }),
    skipDuplicates: true,
  });

  await prisma.trade.createMany({
    data: SANDBOX_TRADES.map(({ entryDaysAgo, exitDaysAgo, tags, ...trade }) => {
      const closed = trade.exitPrice !== null && exitDaysAgo !== null;
      const realized = closed
        ? calculateTradePnL(
            trade.direction,
            trade.entryPrice,
            trade.exitPrice!,
            trade.quantity,
            trade.fundingCost
          )
        : null;
      return {
        ...trade,
        userId: SANDBOX_USER_ID,
        positionSizeUsd: trade.entryPrice * trade.quantity,
        entryDate: daysAgo(now, entryDaysAgo),
        exitDate: closed ? daysAgo(now, exitDaysAgo!) : null,
        realizedPnL: realized?.pnl ?? null,
        realizedPnLPct: realized?.pnlPct ?? null,
        status: closed ? 'CLOSED' : 'OPEN',
        tags: JSON.stringify(tags),
      };
    }),
    skipDuplicates: true,
  });

  const ownedValue = SANDBOX_POSITIONS.filter((position) => !position.custodyOf).reduce(
    (sum, position) => sum + position.quantity * (prices.get(position.assetId) ?? 0),
    0
  );
  for (const investor of SANDBOX_INVESTORS) {
    const currentValue = ownedValue * (investor.stakePercentage / 100);
    const initialCapital = currentValue * 0.7;
    await prisma.investor.upsert({
      where: { id: investor.id },
      update: {},
      create: {
        ...investor,
        userId: SANDBOX_USER_ID,
        initialCapital,
        currentValue,
        totalReturn: currentValue - initialCapital,
        totalReturnPct: ((currentValue - initialCapital) / initialCapital) * 100,
        joinDate: daysAgo(now, SNAPSHOT_DAYS),
        stakes: {
          create: {
            stakePercentage: investor.stakePercentage,
            valueAtTime: initialCapital,
            timestamp: daysAgo(now, SNAPSHOT_DAYS),
          },
        },
      },
    });
  }
}

/** The most recent scheduled snapshot time at or before `now`. */
function latestSnapshotSlot(now: Date): Date {
  const slot = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), SNAPSHOT_UTC_HOUR)
  );
  return slot > now ? new Date(slot.getTime() - DAY_MS) : slot;
}

/** A smooth, slightly noisy path from `start` × final to exactly `final` at the end. */
function path(final: number, start: number, phase: number, dip: number): number[] {
  const raw = Array.from({ length: SNAPSHOT_DAYS }, (_, day) => {
    const progress = day / (SNAPSHOT_DAYS - 1);
    const drawdown = dip * Math.max(0, 1 - Math.abs(day - 300) / 20);
    return (
      start +
      (1 - start) * progress +
      0.02 * Math.sin(day / 11 + phase) +
      0.012 * Math.cos(day / 27 + phase) -
      drawdown
    );
  });
  const last = raw[raw.length - 1];
  return raw.map((value) => (value / last) * final);
}

function percentChange(value: number, base: number | undefined): number | null {
  return base ? (value / base - 1) * 100 : null;
}

/** Rebuilds the snapshot history when its newest snapshot is older than today's slot. */
async function refreshSnapshots(now: Date): Promise<boolean> {
  const slot = latestSnapshotSlot(now);
  const latest = await prisma.snapshot.findFirst({
    where: { userId: SANDBOX_USER_ID },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  if (latest && latest.timestamp >= slot) return false;

  const owned = await prisma.position.findMany({
    where: { userId: SANDBOX_USER_ID, custodyOf: null },
    include: { asset: { select: { symbol: true } } },
  });
  const finalValue = owned.reduce((sum, position) => sum + (position.marketValueUsd ?? 0), 0);
  const finalCost = owned.reduce(
    (sum, position) => sum + position.quantity * position.avgCostUsd,
    0
  );
  const top = [...owned]
    .sort((a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0))
    .slice(0, SNAPSHOT_POSITIONS);
  const btc = SANDBOX_ASSETS.find((asset) => asset.symbol === 'BTC')!.currentPriceUsd;
  const eth = SANDBOX_ASSETS.find((asset) => asset.symbol === 'ETH')!.currentPriceUsd;

  const values = path(finalValue, 0.62, 0, 0.08);
  const btcPrices = path(btc, 0.7, 1.3, 0.1);
  const ethPrices = path(eth, 0.66, 2.1, 0.12);
  const snapshots: Prisma.SnapshotCreateManyInput[] = [];
  const snapshotPositions: Prisma.SnapshotPositionCreateManyInput[] = [];
  let athValueUsd = 0;
  let yearStart = { year: -1, value: 0, btc: 0, eth: 0 };

  values.forEach((totalValueUsd, day) => {
    const timestamp = new Date(slot.getTime() - (SNAPSHOT_DAYS - 1 - day) * DAY_MS);
    const date = timestamp.toISOString().slice(0, 10);
    if (timestamp.getUTCFullYear() !== yearStart.year) {
      yearStart = {
        year: timestamp.getUTCFullYear(),
        value: totalValueUsd,
        btc: btcPrices[day],
        eth: ethPrices[day],
      };
    }
    athValueUsd = Math.max(athValueUsd, totalValueUsd);
    const monthly = timestamp.getUTCDate() === 1;
    const weekly = timestamp.getUTCDay() === 0;
    const totalCostBasis = finalCost * (0.72 + 0.28 * (day / (SNAPSHOT_DAYS - 1)));
    const ytdReturn = percentChange(totalValueUsd, yearStart.value) ?? 0;
    const id = `sandbox-snap-${date}`;

    snapshots.push({
      id,
      userId: SANDBOX_USER_ID,
      timestamp,
      snapshotType: monthly
        ? SnapshotType.MONTHLY
        : weekly
          ? SnapshotType.WEEKLY
          : SnapshotType.DAILY,
      source: SnapshotSource.AUTOMATIC,
      totalValueUsd,
      totalValueSgd: totalValueUsd * USD_SGD_FALLBACK_RATE,
      usdSgdRate: USD_SGD_FALLBACK_RATE,
      totalCostBasis,
      unrealizedPnL: totalValueUsd - totalCostBasis,
      dailyReturn: percentChange(totalValueUsd, values[day - 1]),
      weeklyReturn: weekly ? percentChange(totalValueUsd, values[day - 7]) : null,
      monthlyReturn: monthly ? percentChange(totalValueUsd, values[day - 30]) : null,
      ytdReturn,
      athValueUsd,
      btcPrice: btcPrices[day],
      ethPrice: ethPrices[day],
      btcOutperform: ytdReturn - (percentChange(btcPrices[day], yearStart.btc) ?? 0),
      ethOutperform: ytdReturn - (percentChange(ethPrices[day], yearStart.eth) ?? 0),
    });

    if (monthly || day === SNAPSHOT_DAYS - 1) {
      const scale = finalValue > 0 ? totalValueUsd / finalValue : 0;
      top.forEach((position, index) => {
        const valueUsd = (position.marketValueUsd ?? 0) * scale;
        snapshotPositions.push({
          id: `${id}-${String(index + 1).padStart(2, '0')}`,
          snapshotId: id,
          assetId: position.assetId,
          assetSymbol: position.asset.symbol,
          quantity: position.quantity,
          priceUsd: position.quantity > 0 ? valueUsd / position.quantity : 0,
          valueUsd,
          allocation: totalValueUsd > 0 ? (valueUsd / totalValueUsd) * 100 : 0,
        });
      });
    }
  });

  // Snapshot positions cascade with their snapshots.
  await prisma.snapshot.deleteMany({ where: { userId: SANDBOX_USER_ID } });
  await prisma.snapshot.createMany({ data: snapshots });
  await prisma.snapshotPosition.createMany({ data: snapshotPositions });
  return true;
}

async function refreshXPosts(now: Date): Promise<number> {
  const authorKeys = SANDBOX_X_ROSTER.split(',').map((slot) => slot.split(':')[0].toLowerCase());
  await prisma.xPost.deleteMany({ where: { authorKey: { in: authorKeys } } });
  const { count } = await prisma.xPost.createMany({ data: sandboxXPosts(now) });
  return count;
}

async function seed(): Promise<void> {
  assertSandboxDatabase();
  const now = new Date();
  const fresh = (await prisma.user.findUnique({ where: { id: SANDBOX_USER_ID } })) === null;
  if (fresh) await seedPortfolio(now);
  const rebuilt = await refreshSnapshots(now);
  const posts = await refreshXPosts(now);
  console.info(
    `[sandbox] ${fresh ? 'Seeded the sample portfolio' : 'Kept the existing portfolio'}; ` +
      `snapshots ${rebuilt ? `rebuilt through ${latestSnapshotSlot(now).toISOString().slice(0, 10)}` : 'current'}; ` +
      `${posts} sample X posts re-dated`
  );
}

seed()
  .catch((error) => {
    console.error('[sandbox] Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
