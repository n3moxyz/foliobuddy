import assert from 'node:assert/strict';
import { createServer } from 'node:http';

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

async function verifySourceFailures() {
  // Replay the upstream wire responses over loopback HTTP. Only transport is
  // redirected: the real provider, parsers, refresh service and Postgres writes run.
  const formatManagerDate = (date: Date) =>
    `${String(date.getUTCDate()).padStart(2, '0')} ${new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date)} ${date.getUTCFullYear()}`;
  const future = new Date(now.getTime() + 3 * 86400000);
  const amova = `<h1>Amova Singapore Equity Fund - SGD Class</h1>
<span>SG9999004360</span> ISIN Number
<div>NAV</div><div>SGD 6.2462</div><div>as of ${formatManagerDate(day)}</div>`;
  const lion = `<funds totalpage="1"><fund><f_code><![CDATA[LSSD]]></f_code><eng_lgi><![CDATA[LionGlobal Singapore Dividend Equity Fund Class SGD (Dec)]]></eng_lgi><currency><![CDATA[SGD]]></currency><nav>1.5930</nav><dealdate>${day.toISOString().slice(0, 10)}</dealdate></fund></funds>`;
  const facts =
    '<facts><item><isin><![CDATA[SGXZ58947870]]></isin><currency><![CDATA[SGD]]></currency><valuation_frequency><![CDATA[Daily]]></valuation_frequency></item></facts>';
  const urls = [
    FUND_MANAGER_SOURCES[0].url,
    'https://api.lionglobalinvestors.com/fundlist?fcode=LSSD',
    'https://api.lionglobalinvestors.com/ffacts?fcode=LSSD',
  ];
  const validBodies = [amova, lion, facts];
  let bodies = [...validBodies];
  let requested: string[] = [];
  const originalFetch = globalThis.fetch;
  const replay = createServer((request, response) => {
    const index = Number(request.url?.slice(1));
    response.writeHead(200, { 'Content-Type': index === 0 ? 'text/html' : 'application/xml' });
    response.end(bodies[index] ?? 'Unexpected source');
  });
  await new Promise<void>((resolve, reject) => {
    replay.once('error', reject);
    replay.listen(0, '127.0.0.1', resolve);
  });
  const address = replay.address();
  assert.ok(address && typeof address !== 'string');
  globalThis.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    const index = urls.indexOf(url);
    assert.ok(index >= 0, 'Source replay must never send an external request');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    requested.push(url);
    return originalFetch(`http://127.0.0.1:${address.port}/${index}`, init);
  };
  const retainedState = async (assetId: string) => ({
    quote: await prisma.asset.findUniqueOrThrow({
      where: { id: assetId },
      select: {
        currentPriceUsd: true,
        currentPriceNative: true,
        priceAsOf: true,
        priceUpdatedAt: true,
        priceSource: true,
        priceFxRateToUsd: true,
        priceProvider: true,
        providerAssetId: true,
        nativeCurrency: true,
        isin: true,
      },
    }),
    positions: await prisma.position.findMany({ where: { assetId }, orderBy: { id: 'asc' } }),
    history: await prisma.priceHistory.findMany({ where: { assetId }, orderBy: { id: 'asc' } }),
  });
  try {
    await prisma.position.create({
      data: {
        id: 'nav-lion-source-replay',
        userId,
        assetId: lionId,
        quantity: 100,
        avgCostUsd: 1,
        storageType: 'BROKERAGE',
        storageLocation: 'UOB KH',
      },
    });
    for (const scenario of [
      {
        assetId: amovaId,
        expectedNav: 6.2462,
        expectedUrls: [urls[0]],
        faults: [
          ['wrong class', 0, amova.replace('Fund - SGD Class', 'Fund - SGD Class A')],
          ['wrong ISIN', 0, amova.replace('SG9999004360', 'SG9999004361')],
          ['wrong currency', 0, amova.replace('SGD 6.2462', 'USD 6.2462')],
          ['non-numeric NAV', 0, amova.replace('6.2462', '6.24junk')],
          ['non-finite NAV', 0, amova.replace('6.2462', '9'.repeat(400))],
          ['future date', 0, amova.replace(formatManagerDate(day), formatManagerDate(future))],
          ['missing NAV markup', 0, amova.replace('<div>NAV</div>', '<div>Return</div>')],
        ] as const,
      },
      {
        assetId: lionId,
        expectedNav: 1.593,
        expectedUrls: urls.slice(1),
        faults: [
          ['wrong class', 1, lion.replace('LSSD', 'LSDS')],
          ['wrong facts ISIN', 2, facts.replace('SGXZ58947870', 'SGXZ00000000')],
          ['wrong currency', 1, lion.replace('<![CDATA[SGD]]>', '<![CDATA[USD]]>')],
          ['non-numeric NAV', 1, lion.replace('1.5930', 'not-a-number')],
          ['zero NAV', 1, lion.replace('1.5930', '0')],
          [
            'future date',
            1,
            lion.replace(day.toISOString().slice(0, 10), future.toISOString().slice(0, 10)),
          ],
          ['malformed XML', 1, lion.replace('</fund>', '')],
          ['ambiguous NAV', 1, lion.replace('</nav>', '</nav><nav>2</nav>')],
        ] as const,
      },
    ]) {
      // A successful control prevents unrelated setup/transport failures from
      // making every negative case look like a valid rejection.
      bodies = [...validBodies];
      requested = [];
      await priceService.refreshUnitTrust(scenario.assetId);
      assert.deepEqual(requested.sort(), [...scenario.expectedUrls].sort());
      const before = await retainedState(scenario.assetId);
      assert.equal(before.quote.currentPriceNative, scenario.expectedNav);
      for (const position of before.positions)
        near(position.marketValueUsd, (position.quantity * scenario.expectedNav) / 1.4);
      for (const [name, index, body] of scenario.faults) {
        bodies = [...validBodies];
        bodies[index] = body;
        requested = [];
        const started = new Date();
        await assert.rejects(() => priceService.refreshUnitTrust(scenario.assetId));
        assert.deepEqual(requested.sort(), [...scenario.expectedUrls].sort(), name);
        assert.deepEqual(await retainedState(scenario.assetId), before, name);
        const checked = await prisma.asset.findUniqueOrThrow({ where: { id: scenario.assetId } });
        assert.equal(checked.priceCheckStatus, 'error', name);
        assert.ok(checked.priceCheckedAt && checked.priceCheckedAt >= started, name);
      }
      bodies = [...validBodies];
      await priceService.refreshUnitTrust(scenario.assetId);
      assert.equal(
        (await prisma.asset.findUniqueOrThrow({ where: { id: scenario.assetId } }))
          .priceCheckStatus,
        'ok'
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    replay.closeAllConnections();
    await new Promise<void>((resolve, reject) =>
      replay.close((error) => (error ? reject(error) : resolve()))
    );
  }
  process.stdout.write(
    'Source replay passed: 15 malformed/wrong-class/currency/price/date responses rejected through HTTP, real providers and Postgres; quotes, history and broker values retained; valid-response recovery.\n'
  );
}

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
  await saveManualNav(amovaId, 5.3036, now.toISOString(), userId);
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
  assert.equal(stored.priceSource, 'fund-manager');
  assert.equal(
    await prisma.priceHistory.count({ where: { assetId: amovaId, source: 'manual' } }),
    1
  );
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
  await verifySourceFailures();
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
