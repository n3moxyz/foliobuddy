/** Real PostgreSQL verification using fictional holdings only. Never production. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma, basePrisma } from '../src/lib/prisma.js';
import { reconcileIbkr, restoreIbkr } from '../src/services/ibkrSyncService.js';
import { fictionalIbkrCapture } from '../src/__tests__/helpers/ibkr.js';
import { isActiveIbkrPosition, requireUnmanagedCash } from '../src/lib/ibkrCashGuard.js';

const url = new URL(process.env.DATABASE_URL ?? '');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    ['foliobuddy_nav_test', 'foliobuddy_native_cost_test', 'foliobuddy_ibkr_test'].includes(
      url.pathname.slice(1)
    ),
  'IBKR verification requires an isolated local test database'
);
const owner = `ibkr-test-${randomUUID()}`;
const cashId = `${owner}-cash`;
const stockId = `${owner}-stock`;
const stock2Id = `${owner}-stock2`;
const cashAssetId = `${owner}-usd`;
const oldFx = await prisma.fxRate.findUnique({
  where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
});
try {
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.test` } });
  await prisma.asset.createMany({
    data: [
      {
        id: cashAssetId,
        symbol: 'USD',
        name: 'Fictional USD cash',
        category: 'CASH',
        nativeCurrency: 'USD',
        priceProvider: 'manual',
        currentPriceUsd: 1,
      },
      {
        id: `${owner}-test`,
        symbol: 'TEST',
        name: 'Fictional equity',
        category: 'EQUITY',
        nativeCurrency: 'USD',
        priceProvider: 'yahoo',
        providerAssetId: `${owner}-TEST`,
        currentPriceUsd: 50,
      },
      {
        id: `${owner}-second`,
        symbol: 'SECOND',
        name: 'Fictional second equity',
        category: 'EQUITY',
        nativeCurrency: 'USD',
        priceProvider: 'yahoo',
        providerAssetId: `${owner}-SECOND`,
        currentPriceUsd: 2,
      },
    ],
  });
  // Provider identity must equal the exchange ticker; use unique fixture tickers in the capture too.
  const symbol = `T${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  const secondSymbol = `S${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
  await prisma.asset.update({
    where: { id: `${owner}-test` },
    data: { symbol, providerAssetId: symbol },
  });
  await prisma.asset.update({
    where: { id: `${owner}-second` },
    data: { symbol: secondSymbol, providerAssetId: secondSymbol },
  });
  await prisma.position.createMany({
    data: [
      {
        id: cashId,
        userId: owner,
        assetId: cashAssetId,
        quantity: 6000,
        avgCostUsd: 1,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: stockId,
        userId: owner,
        assetId: `${owner}-test`,
        quantity: 20,
        avgCostUsd: 42,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: stock2Id,
        userId: owner,
        assetId: `${owner}-second`,
        quantity: 10,
        avgCostUsd: 1.125,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: `${owner}-tiger`,
        userId: owner,
        assetId: cashAssetId,
        quantity: 777.77,
        avgCostUsd: 1,
        storageType: 'BROKERAGE',
        storageLocation: 'Tiger',
      },
    ],
  });
  await prisma.positionHistory.create({
    data: {
      userId: owner,
      positionId: stockId,
      assetId: `${owner}-test`,
      mode: 'add',
      quantity: 20,
      costBasisUsd: 840,
      previousQuantity: 0,
      previousAvgCostUsd: 0,
      previousTotalCostUsd: 0,
      nextQuantity: 20,
      nextAvgCostUsd: 42,
      nextTotalCostUsd: 840,
    },
  });
  const original = await prisma.position.findMany({
    where: { userId: owner },
    orderBy: { id: 'asc' },
  });
  const history = await prisma.positionHistory.findMany({ where: { userId: owner } });
  const capturedAt = new Date();
  function capture(offset = 0, includeSecond = true, fx = 1.35) {
    const input = fictionalIbkrCapture(new Date(capturedAt.getTime() + offset));
    for (const s of [input.first, input.second]) {
      // Receipts may have microseconds; the sync marker uses Date/SQL milliseconds.
      s.capturedAt = s.capturedAt.replace('Z', '456Z');
      s.positions[0].contract_description = `${symbol} @NASDAQ`;
      if (includeSecond)
        s.positions.push({
          contract_id: 102,
          contract_description: `${secondSymbol} @NASDAQ`,
          position: 10,
          currency: 'USD',
          average_price: 1.6666666666666667,
          market_price: 2,
          market_value: 20,
          asset_class: 'STK',
        });
      const gross = s.positions.reduce((total, p) => total + p.market_value, 0);
      s.balances[1].cash_balance = 100.123;
      s.balances[1].exchange_rate = fx;
      s.balances[1].stock_market_value = gross;
      s.balances[2].cash_balance = -45000.111;
      s.balances[2].exchange_rate = fx / 150;
      // Fictional independently refreshed BASE/summary differ from quoted FX.
      const net = 100.123 * fx - (45000.111 * fx) / 150 + 1.273;
      s.balances[0].cash_balance = net;
      s.balances[0].stock_market_value = gross * fx;
      s.summary = {
        currency: 'SGD',
        total_cash_value: net + 0.211,
        gross_position_value: gross * fx,
        net_liquidation: gross * fx + net,
      };
    }
    return input;
  }
  const input = capture();
  const options = { kind: 'sync' as const, cashPositionId: cashId, input };
  const preview = await reconcileIbkr(owner, options);
  assert.equal(preview.applied, false);
  assert(preview.cash!.netCashUsd < 0);
  assert.equal(await prisma.ibkrSyncRun.count({ where: { userId: owner } }), 0);
  assert.deepEqual(
    await prisma.position.findMany({ where: { userId: owner }, orderBy: { id: 'asc' } }),
    original
  );
  await assert.rejects(
    () => reconcileIbkr(owner, { ...options, expectedState: 'wrong' }),
    /changed after preview/
  );
  await assert.rejects(() => reconcileIbkr('another-owner', options), /owned IBKR/);
  const originalTransaction = prisma.$transaction.bind(prisma);
  let writes = 0;
  // Interrupt a multi-row apply after its first real SQL write, then verify rollback.
  const fault = async (work: (tx: any) => Promise<any>, opts: any) =>
    originalTransaction(
      (tx) =>
        work(
          new Proxy(tx, {
            get(target, key) {
              if (key !== 'position') return Reflect.get(target, key);
              return new Proxy(target.position, {
                get(model, method) {
                  if (method !== 'update') return Reflect.get(model, method);
                  return async (args: any) => {
                    if (++writes === 2) throw new Error('Fictional write interruption');
                    return model.update(args);
                  };
                },
              });
            },
          })
        ),
      opts
    );
  (prisma as unknown as { $transaction: unknown }).$transaction = fault;
  try {
    await assert.rejects(
      () => reconcileIbkr(owner, { ...options, expectedState: preview.state }),
      /write interruption/
    );
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTransaction;
  }
  assert.deepEqual(
    await prisma.position.findMany({ where: { userId: owner }, orderBy: { id: 'asc' } }),
    original
  );
  const applied = await reconcileIbkr(owner, { ...options, expectedState: preview.state });
  assert(applied.applied && applied.runId);
  const cash = await prisma.position.findUniqueOrThrow({ where: { id: cashId } });
  assert(cash.quantity < 0 && cash.ibkrCash);
  const latestBase = input.second.balances[0].cash_balance;
  const latestUsdRate = input.second.balances[1].exchange_rate;
  // PostgreSQL Float serialization can differ by at most two transport ULPs.
  assert(
    Math.abs(cash.quantity - latestBase / latestUsdRate) <=
      Number.EPSILON * 2 * Math.max(1, Math.abs(cash.quantity))
  );
  assert.deepEqual(cash.ibkrCash, {
    source: 'ibkr',
    capturedAt: input.second.capturedAt,
    baseCurrency: 'SGD',
    baseCash: latestBase,
    baseToUsd: 1 / latestUsdRate,
    netCashUsd: cash.quantity,
    balances: input.second.balances.slice(1).map((b) => ({
      currency: b.currency,
      cashBalance: b.cash_balance,
      fxRateToUsd: b.exchange_rate / latestUsdRate,
    })),
  });
  requireUnmanagedCash({ ibkrCash: null });
  assert.throws(() => requireUnmanagedCash(cash), /currency balances/);
  assert.equal(
    (await prisma.position.findUniqueOrThrow({ where: { id: stockId } })).avgCostUsd,
    42
  );
  assert.deepEqual(await prisma.positionHistory.findMany({ where: { userId: owner } }), history);
  assert.equal(
    (await prisma.position.findUniqueOrThrow({ where: { id: `${owner}-tiger` } })).quantity,
    777.77
  );
  const retry = await reconcileIbkr(owner, { ...options, expectedState: preview.state });
  assert.equal(retry.runId, applied.runId);
  assert(retry.unchanged);
  assert.equal(await prisma.ibkrSyncRun.count({ where: { userId: owner } }), 1);
  await assert.rejects(() => restoreIbkr('another-owner', applied.runId!, true), /unavailable/);
  const nextOptions = { ...options, input: capture(5, true, 1.36) };
  const nextPreview = await reconcileIbkr(owner, nextOptions);
  assert(nextPreview.unchanged);
  const next = await reconcileIbkr(owner, { ...nextOptions, expectedState: nextPreview.state });
  await assert.rejects(() => restoreIbkr(owner, applied.runId!, true), /changed after/);
  await prisma.position.update({ where: { id: stockId }, data: { notes: 'Fictional later edit' } });
  await assert.rejects(() => restoreIbkr(owner, next.runId!, true), /changed after/);
  await prisma.position.update({ where: { id: stockId }, data: { notes: null } });
  await restoreIbkr(owner, next.runId!, false);
  await restoreIbkr(owner, next.runId!, true);
  const closedInput = capture(20, false);
  await assert.rejects(
    () => reconcileIbkr(owner, { ...options, input: closedInput }),
    /closing-sale evidence/
  );
  closedInput.executions = [
    {
      id: 'fictional-close',
      symbol: secondSymbol,
      currency: 'USD',
      side: 'SELL',
      quantity: 10,
      date: new Date(capturedAt.getTime() + 10).toISOString(),
    },
  ];
  const closedPreview = await reconcileIbkr(owner, { ...options, input: closedInput });
  const closed = await reconcileIbkr(owner, {
    ...options,
    input: closedInput,
    expectedState: closedPreview.state,
  });
  const closedPosition = await prisma.position.findUniqueOrThrow({ where: { id: stock2Id } });
  assert.equal(closedPosition.quantity, 0);
  assert(!isActiveIbkrPosition(closedPosition));
  assert.deepEqual(await prisma.positionHistory.findMany({ where: { userId: owner } }), history);
  await restoreIbkr(owner, closed.runId!, true);
  await prisma.fxRate.upsert({
    where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
    create: { fromCcy: 'USD', toCcy: 'SGD', rate: 1.3333333333333333, timestamp: new Date() },
    update: { rate: 1.3333333333333333, timestamp: new Date() },
  });
  const manual = {
    kind: 'cash' as const,
    cashPositionId: cashId,
    input: {
      capturedAt: new Date().toISOString(),
      balances: [
        { currency: 'USD', cashBalance: 12 },
        { currency: 'SGD', cashBalance: -100 },
      ],
    },
  };
  const manualPreview = await reconcileIbkr(owner, manual);
  const manualApplied = await reconcileIbkr(owner, {
    ...manual,
    expectedState: manualPreview.state,
  });
  assert(
    Math.abs((await prisma.position.findUniqueOrThrow({ where: { id: cashId } })).quantity + 63) <
      1e-10
  );
  await restoreIbkr(owner, manualApplied.runId!, true);
  await restoreIbkr(owner, applied.runId!, true);
  const restored = await prisma.position.findMany({
    where: { userId: owner },
    orderBy: { id: 'asc' },
  });
  assert.deepEqual(
    restored.map(
      ({
        updatedAt: _time,
        marketValueUsd: _value,
        unrealizedPnL: _pnl,
        unrealizedPnLPct: _pct,
        ...p
      }) => p
    ),
    original.map(
      ({
        updatedAt: _time,
        marketValueUsd: _value,
        unrealizedPnL: _pnl,
        unrealizedPnLPct: _pct,
        ...p
      }) => p
    )
  );
  assert.deepEqual(await prisma.positionHistory.findMany({ where: { userId: owner } }), history);
  process.stdout.write(
    'IBKR: source completeness, signed cash, atomic rollback, exact ledger preservation, idempotency, FX-only quiet sync, ownership, closing evidence and restore verified.\n'
  );
} finally {
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.asset.deleteMany({ where: { id: { startsWith: owner } } });
  if (oldFx)
    await prisma.fxRate.update({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
      data: { rate: oldFx.rate, timestamp: oldFx.timestamp },
    });
  else await prisma.fxRate.deleteMany({ where: { fromCcy: 'USD', toCcy: 'SGD' } });
  await basePrisma.$disconnect();
}
