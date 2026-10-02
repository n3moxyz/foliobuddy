/** Real PostgreSQL authorization and reconciliation verification. Fictional local data only. */
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { prisma, basePrisma } from '../src/lib/prisma.js';
import {
  enrollIbkrDevice,
  listIbkrDevices,
  revokeIbkrDevice,
  ibkrDeviceRequest,
} from '../src/services/ibkrDeviceService.js';
import {
  canonicalIbkrDevice,
  hashIbkrDevice,
  verifyIbkrEnrollment,
} from '../src/services/ibkrDeviceAuth.js';
import { fictionalIbkrCapture } from '../src/__tests__/helpers/ibkr.js';

const url = new URL(process.env.DATABASE_URL ?? '');
assert(
  ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
    ['foliobuddy_nav_test', 'foliobuddy_native_cost_test', 'foliobuddy_ibkr_test'].includes(
      url.pathname.slice(1)
    ),
  'IBKR device verification requires an isolated local test database'
);
const owner = `ibkr-device-test-${randomUUID()}`;
const cashId = `${owner}-cash`;
const stockId = `${owner}-stock`;
const cashAssetId = `${owner}-usd`;
const stockAssetId = `${owner}-equity`;
const audience = 'https://api.foliobuddy.xyz';
const symbol = `D${randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase()}`;
const makeDevice = (cashPositionId = cashId) => {
  const key = generateKeyPairSync('ed25519');
  const body = {
    version: 1,
    deviceId: randomUUID(),
    cashPositionId,
    name: 'Fictional unattended Mac',
    publicKey: key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64'),
    connectorFingerprint: 'f'.repeat(64),
    audience,
    createdAt: new Date().toISOString(),
  };
  const signature = sign(
    null,
    Buffer.from(JSON.stringify(canonicalIbkrDevice(body))),
    key.privateKey
  ).toString('base64');
  return { key, enrollment: { ...body, signature } };
};
const device = makeDevice();
function requestFor(operation: string, body: unknown, selected = device) {
  const path = `/api/v1/ibkr-device/${operation}`;
  const timestamp = new Date().toISOString();
  const nonce = randomUUID();
  const message = {
    version: 1,
    audience,
    deviceId: selected.enrollment.deviceId,
    method: 'POST',
    path,
    timestamp,
    nonce,
    bodyHash: hashIbkrDevice(body),
  };
  return {
    method: 'POST',
    path,
    body,
    headers: {
      'x-ibkr-device-id': selected.enrollment.deviceId,
      'x-ibkr-timestamp': timestamp,
      'x-ibkr-nonce': nonce,
      'x-ibkr-signature': sign(
        null,
        Buffer.from(JSON.stringify(canonicalIbkrDevice(message))),
        selected.key.privateKey
      ).toString('base64'),
    },
  };
}
const call = (operation: string, body: unknown = {}, selected = device) =>
  ibkrDeviceRequest(requestFor(operation, body, selected));
const capture = () => {
  const input = fictionalIbkrCapture();
  for (const sample of [input.first, input.second]) {
    sample.positions[0].contract_description = `${symbol} @NASDAQ`;
    sample.positions[0].contract_id = 200000001;
    const gross = 51251.892109500805;
    sample.positions[0].average_price = 51251.892109500805;
    sample.positions[0].market_price = gross / sample.positions[0].position;
    sample.positions[0].market_value = gross;
    sample.balances[0].stock_market_value = gross;
    sample.balances[1].stock_market_value = gross;
    sample.summary.gross_position_value = gross;
    sample.summary.net_liquidation = gross + sample.summary.total_cash_value;
    // These rates exercise Prisma's JSONB number decoder, which can lose a ULP.
    // The exact reviewed bytes and checkpoint checksum must survive persistence.
    sample.balances.push(
      { currency: 'TWD', cash_balance: 0, exchange_rate: 1 / 32.4, stock_market_value: 0 },
      { currency: 'KRW', cash_balance: 0, exchange_rate: 1 / 1380, stock_market_value: 0 }
    );
  }
  return input;
};
const financial = () =>
  prisma.position.findMany({ where: { userId: owner }, orderBy: { id: 'asc' } });
async function scenario(label: string) {
  const id = `${owner}-${label}`;
  const anchor = `${id}-cash`;
  await prisma.user.create({ data: { id, email: `${id}@example.test` } });
  await prisma.position.createMany({
    data: [
      {
        id: anchor,
        userId: id,
        assetId: cashAssetId,
        quantity: 100,
        avgCostUsd: 1,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: `${id}-stock`,
        userId: id,
        assetId: stockAssetId,
        quantity: 18,
        avgCostUsd: 39,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
    ],
  });
  const selected = makeDevice(anchor);
  return {
    id,
    anchor,
    selected,
    call: (operation: string, body: unknown = {}) => call(operation, body, selected),
    financial: () => prisma.position.findMany({ where: { userId: id }, orderBy: { id: 'asc' } }),
  };
}

try {
  await prisma.user.create({ data: { id: owner, email: `${owner}@example.test` } });
  await prisma.asset.createMany({
    data: [
      {
        id: cashAssetId,
        symbol: 'USD',
        name: 'Fictional USD',
        category: 'CASH',
        nativeCurrency: 'USD',
        priceProvider: 'manual',
        currentPriceUsd: 1,
      },
      {
        id: stockAssetId,
        symbol,
        name: 'Fictional equity',
        category: 'EQUITY',
        nativeCurrency: 'USD',
        priceProvider: 'yahoo',
        providerAssetId: symbol,
        currentPriceUsd: 50,
      },
    ],
  });
  await prisma.position.createMany({
    data: [
      {
        id: cashId,
        userId: owner,
        assetId: cashAssetId,
        quantity: 100,
        avgCostUsd: 1,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: stockId,
        userId: owner,
        assetId: stockAssetId,
        quantity: 18,
        avgCostUsd: 39,
        storageType: 'BROKERAGE',
        storageLocation: 'IBKR',
      },
      {
        id: `${owner}-tiger`,
        userId: owner,
        assetId: cashAssetId,
        quantity: 777,
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
      assetId: stockAssetId,
      mode: 'add',
      quantity: 18,
      costBasisUsd: 702,
      previousQuantity: 0,
      previousAvgCostUsd: 0,
      previousTotalCostUsd: 0,
      nextQuantity: 18,
      nextAvgCostUsd: 39,
      nextTotalCostUsd: 702,
    },
  });
  const original = await financial();
  const history = await prisma.positionHistory.findMany({ where: { userId: owner } });
  await assert.rejects(() => call('status'), /device|authorized/i);
  await assert.rejects(
    () => enrollIbkrDevice('another-owner', cashId, device.enrollment),
    /owned/i
  );
  await assert.rejects(
    () => enrollIbkrDevice(owner, `${owner}-tiger`, makeDevice(`${owner}-tiger`).enrollment),
    /owned/i
  );
  const enrollmentTarget = await scenario('enrollment-target');
  const copiedEnrollment = makeDevice();
  await assert.rejects(
    () =>
      enrollIbkrDevice(enrollmentTarget.id, enrollmentTarget.anchor, copiedEnrollment.enrollment),
    /enrollment.*anchor/i
  );
  assert.equal(await prisma.ibkrSyncDevice.count({ where: { userId: enrollmentTarget.id } }), 0);
  const registered = await enrollIbkrDevice(owner, cashId, device.enrollment);
  assert.equal(registered.deviceId, device.enrollment.deviceId);
  assert.equal(registered.cashPositionId, cashId);
  assert(!('publicKey' in registered) && !('privateKey' in registered));
  assert.equal((await listIbkrDevices(owner))[0].deviceId, registered.deviceId);
  assert.deepEqual(await listIbkrDevices('another-owner'), []);
  await assert.rejects(
    () => enrollIbkrDevice(owner, cashId, makeDevice().enrollment),
    /active|authorized/i
  );
  assert.deepEqual(await listIbkrDevices('another-owner', cashId), []);
  await assert.rejects(
    () => revokeIbkrDevice('another-owner', device.enrollment.deviceId),
    /unavailable/i
  );

  // Owners must still be able to inspect and revoke a grant after its cash anchor changes.
  for (const change of ['second-cash', 'reclassified-anchor', 'custody-anchor']) {
    const changed = await scenario(change);
    await enrollIbkrDevice(changed.id, changed.anchor, changed.selected.enrollment);
    if (change === 'second-cash') {
      await prisma.position.create({
        data: {
          id: `${changed.id}-second-cash`,
          userId: changed.id,
          assetId: cashAssetId,
          quantity: 200,
          avgCostUsd: 1,
          storageType: 'BROKERAGE',
          storageLocation: 'IBKR',
        },
      });
    } else {
      await prisma.position.update({
        where: { id: changed.anchor },
        data:
          change === 'custody-anchor'
            ? { custodyOf: 'Fictional third party' }
            : { storageLocation: 'Tiger' },
      });
    }
    await assert.rejects(() => changed.call('status'), /owned/i);
    const listed = await listIbkrDevices(changed.id, changed.anchor);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].deviceId, changed.selected.enrollment.deviceId);
    assert.equal(listed[0].cashPositionId, changed.anchor);
    assert.deepEqual(await listIbkrDevices(changed.id), listed);
    assert.equal((await listIbkrDevices(owner))[0].deviceId, registered.deviceId);
    assert.deepEqual(await listIbkrDevices('another-owner', changed.anchor), []);
    await assert.rejects(
      () => revokeIbkrDevice('another-owner', changed.selected.enrollment.deviceId),
      /unavailable/i
    );
    const beforeRevocation = await changed.financial();
    const revoked = await revokeIbkrDevice(changed.id, changed.selected.enrollment.deviceId);
    assert(revoked.revokedAt);
    assert.deepEqual(await listIbkrDevices(changed.id), []);
    assert.deepEqual(await changed.financial(), beforeRevocation);
    await assert.rejects(() => changed.call('status'), /revoked|unavailable/i);
    assert.equal(
      (await listIbkrDevices(changed.id, changed.anchor))[0].revokedAt,
      revoked.revokedAt
    );
  }

  // The owner-wide Settings list must never silently hide active grants. Legacy
  // anchors can remain granted after they cease to be eligible IBKR cash rows.
  const capped = await scenario('active-cap');
  const historicalAnchors = Array.from({ length: 51 }, (_, index) => ({
    id: `${capped.id}-old-cash-${index}`,
    userId: capped.id,
    assetId: cashAssetId,
    quantity: 0,
    avgCostUsd: 1,
    storageType: 'BROKERAGE',
    storageLocation: 'Tiger',
  }));
  await prisma.position.createMany({ data: historicalAnchors });
  const historicalGrants = historicalAnchors.map((anchor) => {
    const enrollment = verifyIbkrEnrollment(makeDevice(anchor.id).enrollment);
    return {
      id: enrollment.deviceId,
      userId: capped.id,
      cashPositionId: anchor.id,
      activeCashPositionId: anchor.id,
      name: enrollment.name,
      publicKey: enrollment.publicKey,
      keyFingerprint: enrollment.keyFingerprint,
      connectorFingerprint: enrollment.connectorFingerprint,
      audience: enrollment.audience,
    };
  });
  await prisma.ibkrSyncDevice.createMany({ data: historicalGrants.slice(0, 50) });
  assert.equal((await listIbkrDevices(capped.id)).length, 50);
  await assert.rejects(
    () => enrollIbkrDevice(capped.id, capped.anchor, capped.selected.enrollment),
    /too many active/i
  );
  assert.equal(await prisma.ibkrSyncDevice.count({ where: { userId: capped.id } }), 50);
  await revokeIbkrDevice(capped.id, historicalGrants[0].id);
  assert.equal((await listIbkrDevices(capped.id)).length, 49);
  await enrollIbkrDevice(capped.id, capped.anchor, capped.selected.enrollment);
  assert.equal((await listIbkrDevices(capped.id)).length, 50);
  assert((await listIbkrDevices(capped.id, historicalAnchors[0].id))[0].revokedAt);
  await prisma.ibkrSyncDevice.create({ data: historicalGrants[50] });
  await assert.rejects(() => listIbkrDevices(capped.id), /too many.*grants/i);
  assert.equal((await listIbkrDevices(capped.id, capped.anchor)).length, 1);
  await revokeIbkrDevice(capped.id, historicalGrants[50].id);
  assert.equal((await listIbkrDevices(capped.id)).length, 50);

  const statusRequest = requestFor('status', {});
  const status = await ibkrDeviceRequest(statusRequest);
  assert.equal(status.cashPositionId, cashId);
  assert.equal(status.blocked, false);
  await assert.rejects(() => ibkrDeviceRequest(statusRequest), /replay|already used/i);
  await assert.rejects(
    () => ibkrDeviceRequest({ ...requestFor('status', {}), body: { userId: 'other' } }),
    /signature/i
  );
  await assert.rejects(() => call('status', { cashPositionId: 'other' }));

  const beforePreview = await financial();
  const abandoned = await call('preview', { capture: capture() });
  assert.equal(abandoned.applied, false);
  assert.deepEqual(await financial(), beforePreview);
  assert.equal((await call('status')).blocked, true);
  await assert.rejects(() => call('preview', { capture: capture() }), /unfinished|blocked|review/i);
  await call('failure', { attemptId: abandoned.attemptId, stage: 'checkpoint' });
  assert.equal((await call('status')).blocked, false);

  const preview = await call('preview', { capture: capture() });
  const applied = await call('apply', {
    attemptId: preview.attemptId,
    checkpointHash: hashIbkrDevice(preview.backup),
  });
  assert.equal(applied.applied, true);
  assert(applied.runId);
  await assert.rejects(
    () =>
      call('apply', {
        attemptId: preview.attemptId,
        checkpointHash: hashIbkrDevice(preview.backup),
      }),
    /consumed|already|state/i
  );
  await assert.rejects(
    () => call('complete', { attemptId: preview.attemptId, readbackHash: '0'.repeat(64) }),
    /readback/i
  );
  const readback = await call('readback', { attemptId: preview.attemptId });
  assert.equal(readback.applied, false);
  const completed = await call('complete', {
    attemptId: preview.attemptId,
    readbackHash: hashIbkrDevice(readback),
  });
  assert.equal(completed.verified, true);
  assert.equal(completed.unchanged, false);
  assert.equal((await call('status')).blocked, false);
  const recorded = (await listIbkrDevices(owner, cashId))[0];
  assert.equal(recorded.lastStatus, 'verified');
  assert(
    recorded.lastChanges.some((change) => change.kind === 'quantity' && change.symbol === symbol)
  );
  assert.equal(
    (await prisma.position.findUniqueOrThrow({ where: { id: stockId } })).avgCostUsd,
    39
  );
  assert.equal(
    (await prisma.position.findUniqueOrThrow({ where: { id: `${owner}-tiger` } })).quantity,
    777
  );
  assert.deepEqual(await prisma.positionHistory.findMany({ where: { userId: owner } }), history);

  const fxCapture = capture();
  for (const sample of [fxCapture.first, fxCapture.second]) {
    sample.balances[0].cash_balance += 0.03;
    sample.summary.total_cash_value += 0.03;
    sample.summary.net_liquidation += 0.03;
  }
  const fxPreview = await call('preview', { capture: fxCapture });
  await call('apply', {
    attemptId: fxPreview.attemptId,
    checkpointHash: hashIbkrDevice(fxPreview.backup),
  });
  const fxReadback = await call('readback', { attemptId: fxPreview.attemptId });
  assert.equal(
    (
      await call('complete', {
        attemptId: fxPreview.attemptId,
        readbackHash: hashIbkrDevice(fxReadback),
      })
    ).unchanged,
    true
  );
  assert.deepEqual((await listIbkrDevices(owner, cashId))[0].lastChanges, []);

  // Prisma's JSONB decoder rounds this native cash value by one ULP. Completion
  // must report the exact reviewed change, matching the worker's checkpoint view.
  const precision = await scenario('cash-precision');
  await enrollIbkrDevice(precision.id, precision.anchor, precision.selected.enrollment);
  const roundedCash = 51251.8921095008;
  const preciseCash = 51251.892109500805;
  const precisionCapture = (cashBalance: number) => {
    const input = fictionalIbkrCapture();
    for (const sample of [input.first, input.second]) {
      sample.positions[0].contract_description = `${symbol} @NASDAQ`;
      sample.positions[0].contract_id = 200000001;
      sample.balances[0].cash_balance = 50951.89;
      sample.balances[1].cash_balance = cashBalance;
      sample.summary.total_cash_value = 50951.89;
      sample.summary.net_liquidation = 51951.89;
    }
    return input;
  };
  for (const cashBalance of [roundedCash, preciseCash]) {
    const reviewed = await precision.call('preview', { capture: precisionCapture(cashBalance) });
    const backup = reviewed.backup as {
      before: Array<{
        id: string;
        ibkrCash: { balances: Array<{ currency: string; cashBalance: number }> } | null;
      }>;
      after: Array<{
        id: string;
        ibkrCash: { balances: Array<{ currency: string; cashBalance: number }> } | null;
      }>;
    };
    const cashFrom = (rows: typeof backup.after) =>
      rows
        .find((row) => row.id === precision.anchor)
        ?.ibkrCash?.balances.find((row) => row.currency === 'USD')?.cashBalance;
    assert.equal(cashFrom(backup.after), cashBalance);
    if (cashBalance === preciseCash) assert.equal(cashFrom(backup.before), roundedCash);
    await precision.call('apply', {
      attemptId: reviewed.attemptId,
      checkpointHash: hashIbkrDevice(reviewed.backup),
    });
    const independent = await precision.call('readback', { attemptId: reviewed.attemptId });
    assert.equal(cashFrom(independent.after as typeof backup.after), roundedCash);
    const completion = await precision.call('complete', {
      attemptId: reviewed.attemptId,
      readbackHash: hashIbkrDevice(independent),
    });
    assert.equal(completion.verified, true);
    assert.equal(
      completion.unchanged,
      false,
      'Completion must retain the exact reviewed native cash change'
    );
    assert.equal((await precision.call('status')).blocked, false);
  }
  const precisionStatus = (await listIbkrDevices(precision.id, precision.anchor))[0];
  assert.equal(precisionStatus.lastStatus, 'verified');
  assert.equal(precisionStatus.lastChanges.length, 1);
  assert.equal(precisionStatus.lastChanges[0].kind, 'cash');
  assert.equal(precisionStatus.lastChanges[0].currency, 'USD');

  const stale = capture();
  stale.first.capturedAt = new Date(Date.now() - 1000).toISOString();
  stale.second.capturedAt = stale.first.capturedAt;
  await assert.rejects(() => call('preview', { capture: stale }), /newer|older|capture/i);
  const changedPreview = await call('preview', { capture: capture() });
  await prisma.position.update({ where: { id: stockId }, data: { notes: 'Fictional owner edit' } });
  await assert.rejects(
    () =>
      call('apply', {
        attemptId: changedPreview.attemptId,
        checkpointHash: hashIbkrDevice(changedPreview.backup),
      }),
    /changed after preview/i
  );
  assert.equal((await call('status')).blocked, true);
  await call('failure', { attemptId: changedPreview.attemptId, stage: 'checkpoint' });
  assert.equal(
    (await call('status')).blocked,
    true,
    'An uncertain apply cannot become a pre-apply failure'
  );
  await revokeIbkrDevice(owner, device.enrollment.deviceId);
  await assert.rejects(() => call('status'), /revoked|authorized|device/i);
  const replacement = makeDevice();
  await enrollIbkrDevice(owner, cashId, replacement.enrollment);
  assert.equal((await call('status', {}, replacement)).blocked, true);
  await assert.rejects(
    () => call('preview', { capture: capture() }, replacement),
    /unfinished|blocked|review/i
  );
  assert.deepEqual(await prisma.positionHistory.findMany({ where: { userId: owner } }), history);
  assert.equal(
    original.find((row) => row.id === `${owner}-tiger`)!.quantity,
    (await financial()).find((row) => row.id === `${owner}-tiger`)!.quantity
  );

  // These races use real PostgreSQL Serializable transactions and unique indexes.
  const races = await scenario('races');
  const competitor = makeDevice(races.anchor);
  const registrations = await Promise.allSettled([
    enrollIbkrDevice(races.id, races.anchor, races.selected.enrollment),
    enrollIbkrDevice(races.id, races.anchor, competitor.enrollment),
  ]);
  assert.equal(registrations.filter((result) => result.status === 'fulfilled').length, 1);
  const winner = registrations[0].status === 'fulfilled' ? races.selected : competitor;
  const winningCall = (operation: string, body: unknown = {}) => call(operation, body, winner);
  const replayRequest = requestFor('status', {}, winner);
  const replay = await Promise.allSettled([
    ibkrDeviceRequest(replayRequest),
    ibkrDeviceRequest(replayRequest),
  ]);
  assert.equal(replay.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(
    await prisma.ibkrSyncDeviceNonce.count({
      where: {
        deviceId: winner.enrollment.deviceId,
        nonce: replayRequest.headers['x-ibkr-nonce'],
      },
    }),
    1
  );
  const racingCapture = capture();
  const previews = await Promise.allSettled([
    winningCall('preview', { capture: racingCapture }),
    winningCall('preview', { capture: racingCapture }),
  ]);
  assert.equal(previews.filter((result) => result.status === 'fulfilled').length, 1);
  const racingPreview = previews.find((result) => result.status === 'fulfilled');
  assert(racingPreview?.status === 'fulfilled');
  const applyBody = {
    attemptId: racingPreview.value.attemptId,
    checkpointHash: hashIbkrDevice(racingPreview.value.backup),
  };
  const applications = await Promise.allSettled([
    winningCall('apply', applyBody),
    winningCall('apply', applyBody),
  ]);
  assert.equal(applications.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(await prisma.ibkrSyncRun.count({ where: { userId: races.id } }), 1);
  assert.equal((await races.financial()).find((row) => row.assetId === stockAssetId)?.quantity, 20);

  // A request authenticated against an earlier grant read must recheck revocation inside SQL.
  const staleGrant = await scenario('stale-grant');
  await enrollIbkrDevice(staleGrant.id, staleGrant.anchor, staleGrant.selected.enrollment);
  const stalePreview = await staleGrant.call('preview', { capture: capture() });
  const staleBefore = await staleGrant.financial();
  const originalLookup = prisma.ibkrSyncDevice.findUnique.bind(prisma.ibkrSyncDevice);
  let observed!: () => void;
  let releaseLookup!: () => void;
  const observedLookup = new Promise<void>((resolve) => {
    observed = resolve;
  });
  const continueLookup = new Promise<void>((resolve) => {
    releaseLookup = resolve;
  });
  (prisma.ibkrSyncDevice as unknown as { findUnique: unknown }).findUnique = async (args: any) => {
    const row = await originalLookup(args);
    if (args.where.id === staleGrant.selected.enrollment.deviceId && args.select?.publicKey) {
      observed();
      await continueLookup;
    }
    return row;
  };
  try {
    const pendingApply = staleGrant.call('apply', {
      attemptId: stalePreview.attemptId,
      checkpointHash: hashIbkrDevice(stalePreview.backup),
    });
    await observedLookup;
    await revokeIbkrDevice(staleGrant.id, staleGrant.selected.enrollment.deviceId);
    releaseLookup();
    await assert.rejects(() => pendingApply, /revoked|unavailable/i);
    assert.deepEqual(await staleGrant.financial(), staleBefore);
  } finally {
    releaseLookup();
    (prisma.ibkrSyncDevice as unknown as { findUnique: unknown }).findUnique = originalLookup;
  }

  // Revocation waits behind an already-writing sync, then bars all later device work.
  const serial = await scenario('revoke-race');
  await enrollIbkrDevice(serial.id, serial.anchor, serial.selected.enrollment);
  const serialPreview = await serial.call('preview', { capture: capture() });
  const originalTransaction = prisma.$transaction.bind(prisma);
  let wrote!: () => void;
  let releaseWrite!: () => void;
  const firstWrite = new Promise<void>((resolve) => {
    wrote = resolve;
  });
  const continueWrite = new Promise<void>((resolve) => {
    releaseWrite = resolve;
  });
  let paused = false;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (
    work: (tx: any) => Promise<any>,
    options: any
  ) =>
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
                    const result = await model.update(args);
                    if (!paused && args.where.userId === serial.id && 'quantity' in args.data) {
                      paused = true;
                      wrote();
                      await continueWrite;
                    }
                    return result;
                  };
                },
              });
            },
          })
        ),
      options
    );
  try {
    const pendingApply = serial.call('apply', {
      attemptId: serialPreview.attemptId,
      checkpointHash: hashIbkrDevice(serialPreview.backup),
    });
    await firstWrite;
    let revoked = false;
    const pendingRevoke = revokeIbkrDevice(serial.id, serial.selected.enrollment.deviceId).then(
      (result) => {
        revoked = true;
        return result;
      }
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(
      revoked,
      false,
      'Revocation cannot return while an authorized financial write is outstanding'
    );
    releaseWrite();
    const [saved] = await Promise.all([pendingApply, pendingRevoke]);
    assert.equal(saved.applied, true);
    await assert.rejects(() => serial.call('status'), /revoked|unavailable/i);
    assert.equal(await prisma.ibkrSyncRun.count({ where: { userId: serial.id } }), 1);
  } finally {
    releaseWrite();
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTransaction;
  }

  // An error after one real SQL position update rolls all financial changes back.
  const fault = await scenario('write-fault');
  await enrollIbkrDevice(fault.id, fault.anchor, fault.selected.enrollment);
  const faultPreview = await fault.call('preview', { capture: capture() });
  const beforeFault = await fault.financial();
  let writeCount = 0;
  (prisma as unknown as { $transaction: unknown }).$transaction = async (
    work: (tx: any) => Promise<any>,
    options: any
  ) =>
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
                    if (
                      args.where.userId === fault.id &&
                      'quantity' in args.data &&
                      ++writeCount === 2
                    )
                      throw new Error('Fictional interrupted second position write');
                    return model.update(args);
                  };
                },
              });
            },
          })
        ),
      options
    );
  try {
    await assert.rejects(
      () =>
        fault.call('apply', {
          attemptId: faultPreview.attemptId,
          checkpointHash: hashIbkrDevice(faultPreview.backup),
        }),
      /interrupted second position write/i
    );
  } finally {
    (prisma as unknown as { $transaction: unknown }).$transaction = originalTransaction;
  }
  assert.deepEqual(await fault.financial(), beforeFault);
  assert.equal(await prisma.ibkrSyncRun.count({ where: { userId: fault.id } }), 0);
  assert.equal((await fault.call('status')).blocked, true);
  assert.equal(
    (await prisma.ibkrSyncAttempt.findUniqueOrThrow({ where: { id: faultPreview.attemptId } }))
      .status,
    'blocked'
  );

  const badReadback = await scenario('readback-fault');
  await enrollIbkrDevice(badReadback.id, badReadback.anchor, badReadback.selected.enrollment);
  const badPreview = await badReadback.call('preview', { capture: capture() });
  await badReadback.call('apply', {
    attemptId: badPreview.attemptId,
    checkpointHash: hashIbkrDevice(badPreview.backup),
  });
  await prisma.position.update({
    where: { id: `${badReadback.id}-stock` },
    data: { notes: 'Later owner edit' },
  });
  await assert.rejects(
    () => badReadback.call('readback', { attemptId: badPreview.attemptId }),
    /changed after/i
  );
  await assert.rejects(
    () =>
      badReadback.call('complete', {
        attemptId: badPreview.attemptId,
        readbackHash: '0'.repeat(64),
      }),
    /readback/i
  );
  assert.equal((await badReadback.call('status')).blocked, true);
  assert.equal((await listIbkrDevices(badReadback.id, badReadback.anchor))[0].lastVerifiedAt, null);

  process.stdout.write(
    'IBKR device: signatures, signed anchor enrollment, owner revocation after anchor changes, concurrent replay/enrollment/apply, atomic rollback, revocation races, durable blocking, independent verification, FX-only quiet status and ledger/history preservation verified.\n'
  );
} finally {
  await prisma.user.deleteMany({ where: { id: { startsWith: owner } } });
  await prisma.asset.deleteMany({ where: { id: { in: [cashAssetId, stockAssetId] } } });
  await basePrisma.$disconnect();
}
