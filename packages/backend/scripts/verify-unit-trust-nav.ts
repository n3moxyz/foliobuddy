import assert from 'node:assert/strict';

// Destructive test setup is restricted to this named database on loopback.
const database = new URL(process.env.DATABASE_URL ?? '');
assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
assert.equal(database.pathname, '/foliobuddy_nav_test');

const { prisma } = await import('../src/lib/prisma.js');
const {
  configureKnownUnitTrusts,
  saveAutomaticNav,
  saveManualNav,
  recordNavFailure,
  navTransaction,
} = await import('../src/services/unitTrustNavService.js');
const { upsertUsdRates } = await import('../src/services/fxRateService.js');
const { priceService } = await import('../src/services/priceService.js');
const { portfolioService } = await import('../src/services/portfolioService.js');
const { FUND_MANAGER_SOURCES } = await import('../src/services/providers/fundManagerSources.js');
const { calculatePositionValue } = await import('../src/lib/domain.js');

function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const now = new Date();
const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
const oldDay = new Date(day.getTime() - 86400000);
const userId = 'nav-integration-user';
const amovaId = FUND_MANAGER_SOURCES[0].legacy.id;
const lionId = 'nav-integration-lion';
const quote = {
  priceUsd: 999,
  nativePrice: 6.0462,
  nativeCurrency: 'SGD',
  isin: 'SG9999004360',
  asOf: day,
};
const near = (a: number | null, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-8, `${a} != ${b}`);

try {
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.asset.deleteMany({
    where: { id: { in: [amovaId, lionId, 'nav-unknown', 'nav-conflict'] } },
  });
  await prisma.user.create({ data: { id: userId, email: 'nav-test@example.invalid' } });
  await upsertUsdRates({ usdSgd: 1.25 });
  await prisma.asset.create({
    data: {
      id: amovaId,
      symbol: 'AMOVASIN',
      name: FUND_MANAGER_SOURCES[0].legacy.name,
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      priceProvider: 'manual',
      providerAssetId: 'ut-amovasin',
    },
  });
  await prisma.asset.create({
    data: {
      id: lionId,
      symbol: 'LIONGLOB',
      name: FUND_MANAGER_SOURCES[1].name,
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      priceProvider: 'yahoo',
      providerAssetId: '0P0001OPAN.SI',
      isin: 'SGXZ58947870',
    },
  });
  await prisma.asset.create({
    data: {
      id: 'nav-unknown',
      symbol: 'UNKNOWN',
      name: 'Unknown Class',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      priceProvider: 'manual',
      providerAssetId: 'unknown',
    },
  });
  for (const [index, broker] of ['FSMOne', 'UOB KH'].entries()) {
    await prisma.position.create({
      data: {
        id: `nav-position-${index}`,
        userId,
        assetId: amovaId,
        quantity: index ? 123.456 : 987.654,
        avgCostUsd: 3.25,
        storageType: 'BROKERAGE',
        storageLocation: broker,
      },
    });
  }
  const snapshot = await prisma.snapshot.create({
    data: { userId, totalValueUsd: 12345, timestamp: oldDay },
  });
  await saveManualNav(amovaId, 5.3036, oldDay.toISOString(), userId);
  assert.equal((await configureKnownUnitTrusts()).length, 2);
  assert.equal(
    (await prisma.asset.findUniqueOrThrow({ where: { id: amovaId } })).priceProvider,
    'manual'
  );
  assert.equal((await configureKnownUnitTrusts(true)).length, 2);
  assert.equal((await configureKnownUnitTrusts(true)).length, 0);
  assert.equal(
    (await prisma.asset.findUniqueOrThrow({ where: { id: 'nav-unknown' } })).priceProvider,
    'manual'
  );

  let stored = await saveAutomaticNav(amovaId, quote, 'fund-manager', now);
  near(stored.currentPriceUsd, 6.0462 / 1.25); // Never trust a provider's unrelated/fallback USD rate.
  assert.equal(stored.priceAsOf?.getTime(), day.getTime());
  assert.equal(stored.currentPriceNative, 6.0462);
  const positionsBeforeFx = await prisma.position.findMany({ where: { assetId: amovaId } });
  for (const position of positionsBeforeFx)
    near(position.marketValueUsd, (position.quantity * 6.0462) / 1.25);

  // Same quote/day, two concurrent checks, then a new FX observation.
  await Promise.all(
    [1, 2].map((offset) =>
      saveAutomaticNav(amovaId, quote, 'fund-manager', new Date(now.getTime() + offset))
    )
  );
  await upsertUsdRates({ usdSgd: 1.4 });
  stored = await saveAutomaticNav(amovaId, quote, 'fund-manager', new Date(now.getTime() + 3));
  near(stored.currentPriceUsd, 6.0462 / 1.4);
  assert.equal(stored.currentPriceNative, 6.0462);
  assert.equal(stored.priceAsOf?.getTime(), day.getTime());
  assert.equal(
    await prisma.priceHistory.count({ where: { assetId: amovaId, source: 'fund-manager' } }),
    1
  );
  const positions = await prisma.position.findMany({
    where: { assetId: amovaId },
    include: { asset: true },
  });
  assert.equal(positions.length, 2);
  for (const position of positions) {
    near(position.marketValueUsd, (position.quantity * 6.0462) / 1.4);
    assert.equal(position.asset.currentPriceNative, 6.0462);
    assert.equal(position.avgCostUsd, 3.25);
  }
  const summary = await portfolioService.getSummary(userId);
  near(
    summary.totalValueUsd,
    positions.reduce((sum, p) => sum + (p.marketValueUsd ?? 0), 0)
  );

  await saveManualNav(amovaId, 4.4444, day.toISOString(), userId);
  await saveManualNav(amovaId, 4.1234, oldDay.toISOString(), userId);
  stored = await prisma.asset.findUniqueOrThrow({ where: { id: amovaId } });
  assert.equal(stored.currentPriceNative, 6.0462);
  assert.equal(stored.priceProvider, 'fund-manager');
  assert.equal(stored.priceSource, 'fund-manager');
  assert.equal(await prisma.priceHistory.count({ where: { assetId: amovaId, timestamp: day } }), 2);

  for (const invalid of [
    { ...quote, asOf: oldDay },
    { ...quote, nativeCurrency: 'USD' },
    { ...quote, isin: 'SG9999004361' },
    { ...quote, nativePrice: 0 },
    { ...quote, nativePrice: Infinity },
    { ...quote, nativePrice: NaN },
    { ...quote, asOf: new Date(now.getTime() + 3 * 86400000) },
    { ...quote, asOf: null },
  ])
    await assert.rejects(() =>
      saveAutomaticNav(amovaId, invalid, 'fund-manager', new Date(now.getTime() + 4))
    );

  // Database failure must roll back the quote, history and all broker values.
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PriceHistory" ADD CONSTRAINT nav_test_reject CHECK ("nativePrice" <> 6.6666)'
  );
  await assert.rejects(() =>
    saveAutomaticNav(
      amovaId,
      { ...quote, nativePrice: 6.6666 },
      'fund-manager',
      new Date(now.getTime() + 4)
    )
  );
  await prisma.$executeRawUnsafe('ALTER TABLE "PriceHistory" DROP CONSTRAINT nav_test_reject');
  assert.deepEqual(
    await prisma.position.findMany({ where: { assetId: amovaId }, include: { asset: true } }),
    positions
  );
  stored = await prisma.asset.findUniqueOrThrow({ where: { id: amovaId } });
  assert.equal(stored.currentPriceNative, 6.0462);
  await recordNavFailure(amovaId, new Date(now.getTime() + 5), 'simulated outage');
  stored = await prisma.asset.findUniqueOrThrow({ where: { id: amovaId } });
  assert.equal(stored.priceCheckStatus, 'error');
  assert.equal(stored.priceAsOf?.getTime(), day.getTime());
  near(stored.currentPriceUsd, 6.0462 / 1.4);

  // Unknown/manual refresh does not relabel an old statement as newly priced.
  const manualBefore = await saveManualNav('nav-unknown', 1.2345, oldDay.toISOString(), userId);
  assert.equal((await priceService.refreshAllPrices('manual')).updated, 0);
  assert.deepEqual(await prisma.asset.findUnique({ where: { id: 'nav-unknown' } }), manualBefore);
  await saveManualNav('nav-unknown', 1.2346, day.toISOString(), userId);
  await saveManualNav('nav-unknown', 1.1111, oldDay.toISOString(), userId);
  assert.equal(
    (await prisma.asset.findUniqueOrThrow({ where: { id: 'nav-unknown' } })).currentPriceNative,
    1.2346
  );

  await prisma.asset.create({
    data: {
      id: 'nav-conflict',
      symbol: 'CONFLICT',
      name: 'Conflicting duplicate',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      priceProvider: 'manual',
      isin: 'SG9999004360',
    },
  });
  const conflicts = await configureKnownUnitTrusts(true);
  assert.ok(conflicts.some((change) => change.action.startsWith('conflict:')));
  assert.equal(
    (await prisma.asset.findUniqueOrThrow({ where: { id: amovaId } })).priceProvider,
    'fund-manager'
  );

  // NAV commits first while a new-position transaction holds the old pricing
  // snapshot. PostgreSQL must abort/retry the insertion rather than store it stale.
  const oldPriceRead = signal();
  const allowInsert = signal();
  let insertionAttempts = 0;
  const insertion = navTransaction(async (tx) => {
    insertionAttempts++;
    const asset = await tx.asset.findUniqueOrThrow({ where: { id: amovaId } });
    if (insertionAttempts === 1) {
      oldPriceRead.resolve();
      await allowInsert.promise;
    }
    return tx.position.create({
      data: {
        id: 'nav-overlap-refresh-first',
        userId,
        assetId: amovaId,
        quantity: 100,
        avgCostUsd: 3,
        ...calculatePositionValue({
          quantity: 100,
          avgCostUsd: 3,
          currentPriceUsd: asset.currentPriceUsd,
        }),
      },
    });
  });
  await oldPriceRead.promise;
  try {
    await saveAutomaticNav(
      amovaId,
      { ...quote, nativePrice: 6.1462 },
      'fund-manager',
      new Date(now.getTime() + 6)
    );
  } finally {
    allowInsert.resolve();
  }
  const refreshedInsertion = await insertion;
  assert.ok(insertionAttempts > 1, 'Overlapping insertion must retry its old pricing snapshot');
  near(refreshedInsertion.marketValueUsd, (100 * 6.1462) / 1.4);

  // Position commits first after the NAV transaction has read its snapshot.
  // Hold only history writes to make that ordering deterministic, then let the
  // actual NAV service continue; its Serializable retry must include the new row.
  const lockedHistory = signal();
  const releaseHistory = signal();
  const lock = prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe('LOCK TABLE "PriceHistory" IN ACCESS EXCLUSIVE MODE');
      lockedHistory.resolve();
      await releaseHistory.promise;
    },
    { timeout: 10000 }
  );
  await lockedHistory.promise;
  const overlappingNav = saveAutomaticNav(
    amovaId,
    { ...quote, nativePrice: 6.2462 },
    'fund-manager',
    new Date(now.getTime() + 7)
  );
  void overlappingNav.catch(() => {}); // Observed below; avoid an early unhandled rejection.
  try {
    const deadline = Date.now() + 2000;
    let blocked = false;
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRawUnsafe<Array<{ blocked: bigint }>>(
        `SELECT COUNT(*) AS blocked FROM pg_locks WHERE relation = '"PriceHistory"'::regclass AND NOT granted`
      );
      if (Number(rows[0].blocked) > 0) {
        blocked = true;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.ok(blocked, 'NAV must hold a snapshot before the position commits');
    await navTransaction(async (tx) => {
      const asset = await tx.asset.findUniqueOrThrow({ where: { id: amovaId } });
      await tx.position.create({
        data: {
          id: 'nav-overlap-position-first',
          userId,
          assetId: amovaId,
          quantity: 200,
          avgCostUsd: 3,
          ...calculatePositionValue({
            quantity: 200,
            avgCostUsd: 3,
            currentPriceUsd: asset.currentPriceUsd,
          }),
        },
      });
    });
  } finally {
    releaseHistory.resolve();
    await lock;
  }
  await overlappingNav;
  const finalPositions = await prisma.position.findMany({
    where: { assetId: amovaId },
    include: { asset: true },
  });
  assert.equal(finalPositions.length, 4);
  for (const position of finalPositions) {
    near(position.marketValueUsd, (position.quantity * 6.2462) / 1.4);
    near(position.asset.currentPriceUsd, 6.2462 / 1.4);
  }
  assert.deepEqual(await prisma.snapshot.findUnique({ where: { id: snapshot.id } }), snapshot);
  process.stdout.write(
    'NAV integration passed: mapping/idempotency, concurrency, same-day FX, both brokers, totals, history, invalid/stale quotes, rollback, manual truthfulness, unchanged snapshot.\n'
  );
} finally {
  await prisma.$executeRawUnsafe(
    'ALTER TABLE "PriceHistory" DROP CONSTRAINT IF EXISTS nav_test_reject'
  );
  await prisma.user.deleteMany({ where: { id: userId } });
  await prisma.asset.deleteMany({
    where: { id: { in: [amovaId, lionId, 'nav-unknown', 'nav-conflict'] } },
  });
  await prisma.$disconnect();
}
