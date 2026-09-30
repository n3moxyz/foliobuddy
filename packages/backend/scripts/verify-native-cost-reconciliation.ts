/** Fictional regression records only. Refuses every non-local or non-test database. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { prisma, basePrisma } from '../src/lib/prisma.js';
import {
  reconcileNativeCosts,
  restoreNativeCosts,
} from '../src/services/nativeReconciliationService.js';
import { projectNativeCosts } from '../src/services/nativeCostService.js';

const url = new URL(process.env.DATABASE_URL ?? '');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    ['foliobuddy_nav_test', 'foliobuddy_native_cost_test'].includes(url.pathname.slice(1)),
  'Native reconciliation verification requires a local dedicated test database'
);
const owner = `native-test-${randomUUID()}`;
const assetId = `${owner}-asset`;
const positionId = `${owner}-position`;
const oldFx = await prisma.fxRate.findUnique({
  where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'KRW' } },
});
try {
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.test` } });
  await prisma.asset.create({
    data: {
      id: assetId,
      symbol: 'TEST.KS',
      name: 'Fictional test equity',
      category: 'EQUITY',
      nativeCurrency: 'KRW',
      currentPriceUsd: 2,
    },
  });
  await prisma.position.create({
    data: {
      id: positionId,
      userId: owner,
      assetId,
      quantity: 15,
      avgCostUsd: 1.5,
      storageType: 'BROKERAGE',
      storageLocation: 'IBKR',
      createdAt: new Date('2026-06-23T02:30:00Z'),
    },
  });
  for (const data of [
    {
      mode: 'add',
      quantity: 10,
      costBasisUsd: 20,
      previousQuantity: 10,
      previousAvgCostUsd: 1,
      previousTotalCostUsd: 10,
      nextQuantity: 20,
      nextAvgCostUsd: 1.5,
      nextTotalCostUsd: 30,
      createdAt: new Date('2026-06-25T04:00:00Z'),
    },
    {
      mode: 'reduce',
      quantity: 5,
      costBasisUsd: 7.5,
      previousQuantity: 20,
      previousAvgCostUsd: 1.5,
      previousTotalCostUsd: 30,
      nextQuantity: 15,
      nextAvgCostUsd: 1.5,
      nextTotalCostUsd: 22.5,
      createdAt: new Date('2026-09-08T04:00:00Z'),
    },
  ])
    await prisma.positionHistory.create({ data: { ...data, userId: owner, positionId, assetId } });
  await prisma.fxRate.upsert({
    where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'KRW' } },
    update: { rate: 100, timestamp: new Date() },
    create: { fromCcy: 'USD', toCcy: 'KRW', rate: 100, timestamp: new Date() },
  });
  const input = {
    capturedAt: new Date().toISOString(),
    positions: [
      {
        symbol: 'TEST.KS',
        quantity: 15,
        recordedAvgCostUsd: 1.5,
        currency: 'KRW',
        avgCostNative: 150.15,
        orders: [
          {
            orderId: 'a',
            timestamp: '2026-06-23T02:00:00Z',
            side: 'BUY',
            quantity: 10,
            price: 100,
            portfolioFees: 1,
            statementFees: 1.09,
          },
          {
            orderId: 'b',
            timestamp: '2026-06-25T02:00:00Z',
            side: 'BUY',
            quantity: 10,
            price: 200,
            portfolioFees: 2,
            statementFees: 2.18,
          },
          {
            orderId: 'c',
            timestamp: '2026-09-08T02:00:00Z',
            side: 'SELL',
            quantity: 5,
            price: 170,
            portfolioFees: 1,
            statementFees: 2,
          },
        ],
      },
    ],
  };
  const originalHistory = await prisma.positionHistory.findMany({
    where: { positionId },
    orderBy: { id: 'asc' },
  });
  const preview = await reconcileNativeCosts(owner, input);
  assert.equal(preview.applied, false);
  assert.equal(
    (await prisma.position.findUniqueOrThrow({ where: { id: positionId } })).avgCostNative,
    null
  );
  await prisma.position.update({ where: { id: positionId }, data: { notes: 'Concurrent edit' } });
  await assert.rejects(
    () => reconcileNativeCosts(owner, input, preview.state),
    /changed since preview/
  );
  await prisma.position.update({ where: { id: positionId }, data: { notes: null } });
  await assert.rejects(() => reconcileNativeCosts('another-owner', input), /count differs/);
  await reconcileNativeCosts(owner, input, preview.state);
  assert.equal((await prisma.positionHistory.findMany({ where: { positionId } })).length, 3);
  let current = await prisma.position.findUniqueOrThrow({
    where: { id: positionId },
    include: { asset: true },
  });
  assert.equal(current.avgCostUsd, 1.5);
  assert.equal(current.quantity, 15);
  assert.equal(current.avgCostNative, 150.15);
  const firstUsd = (await projectNativeCosts([current]))[0].avgCostUsd;
  await prisma.fxRate.update({
    where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'KRW' } },
    data: { rate: 120 },
  });
  assert.notEqual((await projectNativeCosts([current]))[0].avgCostUsd, firstUsd);
  await assert.rejects(
    () =>
      prisma.$executeRaw`UPDATE "Position" SET "avgCostNative" = 'Infinity'::double precision WHERE id = ${positionId}`
  );
  await assert.rejects(() =>
    prisma.position.update({ where: { id: positionId }, data: { costCurrency: null } })
  );
  await assert.rejects(
    () => restoreNativeCosts('another-owner', preview.backup, true),
    /another owner/
  );
  await prisma.position.update({ where: { id: positionId }, data: { notes: 'Later edit' } });
  await assert.rejects(
    () => restoreNativeCosts(owner, preview.backup, true),
    /changed after reconciliation/
  );
  await prisma.position.update({ where: { id: positionId }, data: { notes: null } });
  await restoreNativeCosts(owner, preview.backup, false);
  await restoreNativeCosts(owner, preview.backup, true);
  current = await prisma.position.findUniqueOrThrow({
    where: { id: positionId },
    include: { asset: true },
  });
  assert.equal(current.avgCostNative, null);
  assert.equal(current.avgCostUsd, 1.5);
  assert.equal(current.quantity, 15);
  assert.deepEqual(
    await prisma.positionHistory.findMany({ where: { positionId }, orderBy: { id: 'asc' } }),
    originalHistory
  );
  const directory = await mkdtemp(join(tmpdir(), 'foliobuddy-native-cli-'));
  try {
    const inputPath = join(directory, 'capture.json');
    const backupPath = join(directory, 'backup.json');
    await writeFile(inputPath, JSON.stringify(input), { mode: 0o600 });
    const cli = fileURLToPath(new URL('./reconcile-native-costs.ts', import.meta.url));
    const runCli = (args: string[]) =>
      promisify(execFile)(process.execPath, ['--import', 'tsx', cli, ...args], {
        env: { ...process.env, RECONCILE_USER_ID: owner },
      });
    await runCli(['--input', inputPath]);
    assert.equal(
      (await prisma.position.findUniqueOrThrow({ where: { id: positionId } })).avgCostNative,
      null
    );
    await runCli(['--input', inputPath, '--apply', '--backup', backupPath]);
    assert.equal(JSON.parse(await readFile(backupPath, 'utf8')).version, 2);
    if (process.platform !== 'win32') assert.equal((await stat(backupPath)).mode & 0o777, 0o600);
    const applied = await prisma.position.findUniqueOrThrow({ where: { id: positionId } });
    assert.equal(applied.avgCostNative, 150.15);
    assert.equal(applied.avgCostUsd, 1.5);
    await runCli(['--restore', backupPath]);
    await runCli(['--restore', backupPath, '--apply']);
    assert.equal(
      (await prisma.position.findUniqueOrThrow({ where: { id: positionId } })).avgCostNative,
      null
    );
    assert.deepEqual(
      await prisma.positionHistory.findMany({ where: { positionId }, orderBy: { id: 'asc' } }),
      originalHistory
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  process.stdout.write(
    'Native costs: real preview/apply/restore transactions, CLI backup round trip, USD preservation, FX changes, database constraints, ownership and concurrency checks passed.\n'
  );
} finally {
  await prisma.user.deleteMany({ where: { id: owner } });
  await prisma.asset.deleteMany({ where: { id: assetId } });
  if (oldFx)
    await prisma.fxRate.update({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'KRW' } },
      data: { rate: oldFx.rate, timestamp: oldFx.timestamp },
    });
  else await prisma.fxRate.deleteMany({ where: { fromCcy: 'USD', toCcy: 'KRW' } });
  await basePrisma.$disconnect();
}
