import { Prisma, type IbkrSyncAttempt, type IbkrSyncDevice } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { isIbkrCash, requireIbkr, validateIbkrCapture } from './ibkrCapture.js';
import {
  canonicalIbkrDevice,
  hashIbkrDevice,
  parseIbkrDeviceHeaders,
  requireFreshIbkrSignature,
  verifyIbkrDeviceSignature,
  verifyIbkrEnrollment,
  type IbkrDeviceHeaders,
  type IbkrDeviceSignature,
} from './ibkrDeviceAuth.js';
import {
  reconcileIbkrInTransaction,
  restoreIbkrInTransaction,
  type IbkrTransaction,
} from './ibkrSyncService.js';
import { navTransaction } from './unitTrustNavService.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const attemptId = z.string().min(1).max(100);
const maxDeviceGrants = 50;
const operationSchemas = {
  status: z.object({}).strict(),
  preview: z.object({ capture: z.unknown() }).strict(),
  apply: z.object({ attemptId, checkpointHash: digest }).strict(),
  readback: z.object({ attemptId }).strict(),
  complete: z.object({ attemptId, readbackHash: digest }).strict(),
  failure: z
    .object({
      attemptId: attemptId.optional(),
      stage: z.enum(['broker', 'capture', 'checkpoint', 'apply', 'readback', 'worker']),
    })
    .strict(),
};
type Operation = keyof typeof operationSchemas;
type FailureStage = z.infer<typeof operationSchemas.failure>['stage'];
type Tx = IbkrTransaction;
type Identity = Pick<
  IbkrSyncDevice,
  | 'id'
  | 'userId'
  | 'cashPositionId'
  | 'publicKey'
  | 'keyFingerprint'
  | 'connectorFingerprint'
  | 'audience'
>;

export interface IbkrDeviceChange {
  kind: 'quantity' | 'native-average' | 'cash';
  symbol?: string;
  currency?: string;
  previous: number | null;
  current: number | null;
}
export interface IbkrDeviceStatus {
  deviceId: string;
  cashPositionId: string;
  name: string;
  keyFingerprint: string;
  connectorFingerprint: string;
  createdAt: string;
  revokedAt: string | null;
  lastSeenAt: string | null;
  lastVerifiedAt: string | null;
  lastCapturedAt: string | null;
  lastStatus: string;
  lastError: string | null;
  lastChanges: IbkrDeviceChange[];
  blocked: boolean;
  pendingAttemptId: string | null;
}

const failureMessages: Record<FailureStage, string> = {
  broker: 'IBKR reads need attention. Check the existing IBKR connection in Codex on this Mac.',
  capture: 'The broker capture could not be validated. No new sync was applied.',
  checkpoint: 'The private checkpoint could not be verified. No new sync was applied.',
  apply: 'The sync stopped during apply. Review its checkpoint before another scheduled sync.',
  readback: 'Saved IBKR records could not be independently verified. Review its checkpoint.',
  worker: 'The scheduled worker stopped. Review its private audit before another scheduled sync.',
};
const blockedMessage =
  'An unfinished or unverified IBKR attempt needs owner review before scheduled sync can continue.';
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function unauthorized(): never {
  throw new AppError('IBKR device is unavailable or revoked', 401);
}
function dto(device: IbkrSyncDevice, pending: { id: string } | null): IbkrDeviceStatus {
  return {
    deviceId: device.id,
    cashPositionId: device.cashPositionId,
    name: device.name,
    keyFingerprint: device.keyFingerprint,
    connectorFingerprint: device.connectorFingerprint,
    createdAt: device.createdAt.toISOString(),
    revokedAt: device.revokedAt?.toISOString() ?? null,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    lastVerifiedAt: device.lastVerifiedAt?.toISOString() ?? null,
    lastCapturedAt: device.lastCapturedAt?.toISOString() ?? null,
    lastStatus: device.lastStatus,
    lastError: device.lastError,
    lastChanges: (device.lastChanges ?? []) as unknown as IbkrDeviceChange[],
    blocked: pending !== null,
    pendingAttemptId: pending?.id ?? null,
  };
}

/** Enrollment and signed operations require the current owned IBKR USD cash identity. */
async function ownedCash(tx: Tx, userId: string, cashPositionId: string) {
  const rows = await tx.position.findMany({
    where: {
      userId,
      custodyOf: null,
      storageType: 'BROKERAGE',
      storageLocation: 'IBKR',
      asset: { category: 'CASH' },
    },
    include: { asset: true },
    take: 2,
  });
  const row = rows.find((candidate) => candidate.id === cashPositionId);
  requireIbkr(
    rows.length === 1 &&
      row &&
      isIbkrCash(row) &&
      row.asset.symbol === 'USD' &&
      row.asset.nativeCurrency === 'USD' &&
      row.asset.priceProvider === 'manual' &&
      row.asset.currentPriceUsd === 1,
    'Select exactly one owned IBKR USD cash position'
  );
  return row;
}
const pendingFor = (tx: Tx, cashPositionId: string) =>
  tx.ibkrSyncAttempt.findUnique({
    where: { activeCashPositionId: cashPositionId },
    select: { id: true },
  });

export async function enrollIbkrDevice(userId: string, cashPositionId: string, raw: unknown) {
  const enrollment = verifyIbkrEnrollment(raw);
  requireIbkr(
    enrollment.cashPositionId === cashPositionId,
    'IBKR enrollment cash position differs from the requested anchor'
  );
  return navTransaction(async (tx) => {
    const anchor = await ownedCash(tx, userId, cashPositionId);
    // Serialize enrollment with owner changes without altering a financial field.
    await tx.position.update({
      where: { id: anchor.id, userId },
      data: { updatedAt: anchor.updatedAt },
    });
    const existing = await tx.ibkrSyncDevice.findFirst({
      where: {
        OR: [
          { activeCashPositionId: cashPositionId },
          { id: enrollment.deviceId },
          { keyFingerprint: enrollment.keyFingerprint },
        ],
      },
    });
    requireIbkr(
      !existing,
      'An active or previously authorized device already uses this anchor or key'
    );
    requireIbkr(
      (await tx.ibkrSyncDevice.count({ where: { userId, revokedAt: null } })) < maxDeviceGrants,
      'Too many active IBKR device grants; disconnect one before authorizing another device'
    );
    requireIbkr(
      (await tx.ibkrSyncDevice.count({ where: { userId, cashPositionId } })) < maxDeviceGrants,
      'This IBKR account has too many device grants; owner review is required'
    );
    const device = await tx.ibkrSyncDevice.create({
      data: {
        id: enrollment.deviceId,
        userId,
        cashPositionId,
        activeCashPositionId: cashPositionId,
        name: enrollment.name,
        publicKey: enrollment.publicKey,
        keyFingerprint: enrollment.keyFingerprint,
        connectorFingerprint: enrollment.connectorFingerprint,
        audience: enrollment.audience,
      },
    });
    return dto(device, await pendingFor(tx, cashPositionId));
  });
}
export async function listIbkrDevices(userId: string, cashPositionId?: string) {
  return navTransaction(async (tx) => {
    const devices = await tx.ibkrSyncDevice.findMany({
      where: {
        userId,
        ...(cashPositionId === undefined ? { revokedAt: null } : { cashPositionId }),
      },
      orderBy: { createdAt: 'desc' },
      take: maxDeviceGrants + 1,
    });
    requireIbkr(
      devices.length <= maxDeviceGrants,
      'Too many IBKR device grants; owner review is required'
    );
    if (devices.length === 0) return [];
    const attempts = await tx.ibkrSyncAttempt.findMany({
      where: {
        activeCashPositionId: { in: [...new Set(devices.map((device) => device.cashPositionId))] },
        device: { userId },
      },
      select: { id: true, activeCashPositionId: true },
    });
    const pending = new Map(attempts.map((attempt) => [attempt.activeCashPositionId, attempt]));
    return devices.map((device) => dto(device, pending.get(device.cashPositionId) ?? null));
  });
}
export async function revokeIbkrDevice(userId: string, deviceId: string) {
  return navTransaction(async (tx) => {
    const device = await tx.ibkrSyncDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new AppError('IBKR device is unavailable', 404);
    const revoked = await tx.ibkrSyncDevice.update({
      where: { id: deviceId, userId },
      data: { revokedAt: device.revokedAt ?? new Date(), activeCashPositionId: null },
    });
    return dto(revoked, await pendingFor(tx, device.cashPositionId));
  });
}

/** The grant row write serializes revoke with replay acceptance and financial writes. */
async function authorize(tx: Tx, identity: Identity, signature: IbkrDeviceSignature) {
  requireFreshIbkrSignature(signature.timestamp);
  const touched = await tx.ibkrSyncDevice.updateMany({
    where: {
      ...identity,
      revokedAt: null,
      activeCashPositionId: identity.cashPositionId,
    },
    data: { lastSeenAt: new Date() },
  });
  if (touched.count !== 1) unauthorized();
  await ownedCash(tx, identity.userId, identity.cashPositionId);
  // Expired signatures cannot pass again; retain nonces longer than their acceptance window.
  await tx.ibkrSyncDeviceNonce.deleteMany({
    where: { deviceId: identity.id, expiresAt: { lt: new Date() } },
  });
  try {
    await tx.ibkrSyncDeviceNonce.create({
      data: {
        deviceId: identity.id,
        nonce: signature.nonce,
        expiresAt: new Date(Date.parse(signature.timestamp) + 600_000),
      },
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002')
      throw new AppError('IBKR device request nonce was already used; replay rejected', 409);
    throw error;
  }
}
async function attemptFor(tx: Tx, identity: Identity, id: string) {
  const attempt = await tx.ibkrSyncAttempt.findFirst({ where: { id, deviceId: identity.id } });
  if (!attempt) throw new AppError('IBKR sync attempt is unavailable', 404);
  return attempt;
}
function exactEvidence(attempt: IbkrSyncAttempt, identity: Identity) {
  requireIbkr(
    attempt.captureText && attempt.backupText,
    'This IBKR attempt lacks exact reviewed evidence and needs owner review'
  );
  const capture: unknown = JSON.parse(attempt.captureText);
  const backup = z
    .object({
      version: z.literal(1),
      captureHash: digest,
      before: z.array(z.unknown()).max(101),
      after: z.array(z.unknown()).max(101),
      source: z.unknown(),
    })
    .strict()
    .parse(JSON.parse(attempt.backupText));
  requireIbkr(
    hashIbkrDevice(backup) === attempt.checkpointHash &&
      hashIbkrDevice(backup.source) === hashIbkrDevice(capture) &&
      backup.captureHash ===
        hashIbkrDevice({
          kind: 'sync',
          cashPositionId: identity.cashPositionId,
          source: capture,
        }) &&
      hashIbkrDevice({ before: backup.before, after: backup.after }) === attempt.state,
    'The exact IBKR attempt evidence differs from its reviewed checkpoint'
  );
  return { capture, backup };
}
async function savedReadback(tx: Tx, identity: Identity, attempt: IbkrSyncAttempt) {
  requireIbkr(attempt.runId, 'An applied IBKR sync is required for readback');
  const run = await tx.ibkrSyncRun.findFirst({
    where: { id: attempt.runId, userId: identity.userId },
  });
  const { backup } = exactEvidence(attempt, identity);
  requireIbkr(
    run &&
      run.kind === 'sync' &&
      run.captureHash === backup.captureHash &&
      hashIbkrDevice(run.before) === hashIbkrDevice(backup.before),
    'The saved IBKR sync differs from this attempt'
  );
  const after = run.after as Array<{ id?: string; userId?: string }>;
  requireIbkr(
    Array.isArray(after) &&
      after.some((row) => row.id === identity.cashPositionId && row.userId === identity.userId),
    'The saved IBKR sync belongs to a different cash anchor'
  );
  return restoreIbkrInTransaction(tx, identity.userId, attempt.runId, false);
}

const changeRow = z.object({
  id: z.string(),
  quantity: z.number().finite(),
  avgCostNative: z.number().finite().nullable(),
  costCurrency: z.string().nullable(),
  asset: z.object({ symbol: z.string(), nativeCurrency: z.string() }),
  ibkrCash: z
    .object({
      balances: z.array(z.object({ currency: z.string(), cashBalance: z.number().finite() })),
    })
    .nullable(),
});
function changesFor(beforeRaw: unknown, afterRaw: unknown, anchor: string): IbkrDeviceChange[] {
  const before = z.array(changeRow).max(101).parse(beforeRaw);
  const after = z.array(changeRow).max(101).parse(afterRaw);
  const result: IbkrDeviceChange[] = [];
  for (const next of after) {
    const previous = before.find((row) => row.id === next.id);
    requireIbkr(previous, 'The IBKR change summary has an unknown position');
    if (next.id === anchor) {
      const oldBalances = new Map(
        previous.ibkrCash?.balances.map((row) => [row.currency, row.cashBalance]) ?? []
      );
      const newBalances = new Map(
        next.ibkrCash?.balances.map((row) => [row.currency, row.cashBalance]) ?? []
      );
      for (const currency of [...new Set([...oldBalances.keys(), ...newBalances.keys()])].sort()) {
        const old = oldBalances.get(currency) ?? null;
        const value = newBalances.get(currency) ?? null;
        if (old !== value) result.push({ kind: 'cash', currency, previous: old, current: value });
      }
    } else {
      if (previous.quantity !== next.quantity)
        result.push({
          kind: 'quantity',
          symbol: next.asset.symbol,
          previous: previous.quantity,
          current: next.quantity,
        });
      if (previous.avgCostNative?.toPrecision(15) !== next.avgCostNative?.toPrecision(15))
        result.push({
          kind: 'native-average',
          symbol: next.asset.symbol,
          currency: next.costCurrency ?? next.asset.nativeCurrency,
          previous: previous.avgCostNative,
          current: next.avgCostNative,
        });
    }
  }
  return result;
}

/** Bound error stages prevent source payloads, credentials or runtime diagnostics reaching UI. */
async function recordFailure(tx: Tx, identity: Identity, stage: FailureStage, id?: string) {
  const pending = await pendingFor(tx, identity.cashPositionId);
  const attempt = id ? await attemptFor(tx, identity, id) : null;
  if (attempt) {
    requireIbkr(
      !['verified', 'failed'].includes(attempt.status),
      'This IBKR attempt is already complete'
    );
    const knownPreApply =
      attempt.status === 'previewed' && ['broker', 'capture', 'checkpoint'].includes(stage);
    await tx.ibkrSyncAttempt.update({
      where: { id: attempt.id, deviceId: identity.id },
      data: {
        status: knownPreApply ? 'failed' : 'blocked',
        errorStage: stage,
        ...(knownPreApply ? { activeCashPositionId: null } : {}),
      },
    });
  }
  const blocked = await pendingFor(tx, identity.cashPositionId);
  await tx.ibkrSyncDevice.update({
    where: { id: identity.id, userId: identity.userId },
    data: {
      lastStatus: 'failed',
      lastError: blocked ? blockedMessage : failureMessages[stage],
    },
  });
  // A failure without an attempt never releases an existing claim, including another grant's claim.
  return {
    recorded: true,
    blocked: blocked !== null,
    attemptId: attempt?.id ?? pending?.id ?? null,
  };
}

export async function ibkrDeviceRequest(request: {
  method: string;
  path: string;
  headers: IbkrDeviceHeaders;
  body: unknown;
}): Promise<Record<string, unknown>> {
  const parsedHeaders = parseIbkrDeviceHeaders(request.headers);
  const operation = request.path.slice('/api/v1/ibkr-device/'.length) as Operation;
  if (!Object.hasOwn(operationSchemas, operation))
    throw new AppError('Unknown IBKR device operation', 404);
  // This single bounded public-key lookup is the only database work before signature verification.
  const device = await prisma.ibkrSyncDevice.findUnique({
    where: { id: parsedHeaders.deviceId },
    select: {
      id: true,
      userId: true,
      cashPositionId: true,
      publicKey: true,
      keyFingerprint: true,
      connectorFingerprint: true,
      audience: true,
    },
  });
  if (!device) unauthorized();
  const signature = verifyIbkrDeviceSignature(
    request.headers,
    request.method,
    request.path,
    request.body,
    device
  );
  const payload = operationSchemas[operation].parse(request.body);
  requireIbkr(
    Buffer.byteLength(JSON.stringify(payload)) <= 750_000,
    'The IBKR device payload is too large'
  );
  let blockOnFailure: string | undefined;
  try {
    return await navTransaction(async (tx) => {
      blockOnFailure = undefined;
      await authorize(tx, device, signature);
      if (operation === 'status')
        return {
          deviceId: device.id,
          userId: device.userId,
          cashPositionId: device.cashPositionId,
          connectorFingerprint: device.connectorFingerprint,
          blocked: (await pendingFor(tx, device.cashPositionId)) !== null,
        };
      if (operation === 'preview') {
        requireIbkr(!(await pendingFor(tx, device.cashPositionId)), blockedMessage);
        requireIbkr(
          (await tx.ibkrSyncAttempt.count({
            where: {
              device: { userId: device.userId, cashPositionId: device.cashPositionId },
              createdAt: { gte: new Date(Date.now() - 86_400_000) },
            },
          })) < 12,
          'Too many IBKR sync attempts today; owner review is required'
        );
        const captureRaw = operationSchemas.preview.parse(payload).capture;
        const { capture } = validateIbkrCapture(captureRaw);
        requireIbkr(
          hashIbkrDevice(captureRaw) === hashIbkrDevice(capture),
          'IBKR capture has unknown or missing fields'
        );
        const preview = await reconcileIbkrInTransaction(tx, device.userId, {
          kind: 'sync',
          cashPositionId: device.cashPositionId,
          input: capture,
        });
        requireIbkr(
          !preview.applied && preview.state,
          'This broker capture was already applied; read IBKR again'
        );
        requireIbkr(
          preview.backup.before.length <= 101 &&
            Buffer.byteLength(JSON.stringify(preview.backup)) <= 900_000,
          'The IBKR checkpoint is too large for unattended sync'
        );
        const attempt = await tx.ibkrSyncAttempt.create({
          data: {
            deviceId: device.id,
            activeCashPositionId: device.cashPositionId,
            capture: json(capture),
            captureText: JSON.stringify(canonicalIbkrDevice(capture)),
            state: preview.state,
            backup: json(preview.backup),
            backupText: JSON.stringify(canonicalIbkrDevice(preview.backup)),
            checkpointHash: hashIbkrDevice(preview.backup),
            unchanged: preview.unchanged,
            capturedAt: new Date(capture.second.capturedAt),
          },
        });
        await tx.ibkrSyncDevice.update({
          where: { id: device.id, userId: device.userId },
          data: { lastStatus: 'running', lastError: null },
        });
        return { attemptId: attempt.id, ...preview };
      }
      if (operation === 'failure') {
        const failure = operationSchemas.failure.parse(payload);
        return recordFailure(tx, device, failure.stage, failure.attemptId);
      }
      const id = (payload as { attemptId: string }).attemptId;
      const attempt = await attemptFor(tx, device, id);
      if (operation === 'apply') {
        requireIbkr(
          attempt.status === 'previewed' && attempt.activeCashPositionId === device.cashPositionId,
          'This IBKR preview was already consumed or blocked'
        );
        blockOnFailure = attempt.id;
        const { checkpointHash } = operationSchemas.apply.parse(payload);
        const exact = exactEvidence(attempt, device);
        requireIbkr(
          checkpointHash === attempt.checkpointHash &&
            checkpointHash === hashIbkrDevice(exact.backup),
          'IBKR checkpoint checksum differs'
        );
        const result = await reconcileIbkrInTransaction(tx, device.userId, {
          kind: 'sync',
          cashPositionId: device.cashPositionId,
          input: exact.capture,
          expectedState: attempt.state,
        });
        requireIbkr(result.applied && result.runId, 'IBKR apply did not produce a saved run');
        await tx.ibkrSyncAttempt.update({
          where: { id, deviceId: device.id },
          data: { status: 'applied', runId: result.runId },
        });
        return { attemptId: id, ...result };
      }
      if (operation === 'readback') {
        requireIbkr(
          ['applied', 'readback'].includes(attempt.status),
          'An applied sync is required for independent readback'
        );
        blockOnFailure = attempt.id;
        const readback = await savedReadback(tx, device, attempt);
        await tx.ibkrSyncAttempt.update({
          where: { id, deviceId: device.id },
          data: { status: 'readback', readbackHash: hashIbkrDevice(readback) },
        });
        return readback;
      }
      requireIbkr(
        attempt.status === 'readback',
        'Independent readback is required before completion'
      );
      blockOnFailure = attempt.id;
      const { readbackHash } = operationSchemas.complete.parse(payload);
      requireIbkr(readbackHash === attempt.readbackHash, 'IBKR readback checksum differs');
      const current = await savedReadback(tx, device, attempt);
      requireIbkr(
        hashIbkrDevice(current) === readbackHash,
        'IBKR records changed after independent readback'
      );
      // Summarize the exact reviewed source only after the independent saved-state
      // checks pass. JSONB transport rounding must not change the worker's verdict.
      const { backup } = exactEvidence(attempt, device);
      const changes = changesFor(backup.before, backup.after, device.cashPositionId);
      await tx.ibkrSyncAttempt.update({
        where: { id, deviceId: device.id },
        data: { status: 'verified', activeCashPositionId: null, unchanged: changes.length === 0 },
      });
      await tx.ibkrSyncDevice.update({
        where: { id: device.id, userId: device.userId },
        data: {
          lastStatus: 'verified',
          lastError: null,
          lastVerifiedAt: new Date(),
          lastCapturedAt: attempt.capturedAt,
          lastChanges: json(changes),
        },
      });
      return {
        verified: true,
        unchanged: changes.length === 0,
        capturedAt: attempt.capturedAt.toISOString(),
      };
    });
  } catch (error) {
    if (blockOnFailure) {
      // The financial transaction rolled back (or its outcome is uncertain). Keep an
      // explicit durable block. Never attempt another financial write or undo here.
      const id = blockOnFailure;
      try {
        await navTransaction(async (tx) => {
          await authorize(tx, device, signature);
          await recordFailure(tx, device, operation === 'apply' ? 'apply' : 'readback', id);
        });
      } catch {
        /* The outstanding attempt already blocks every new scheduled preview. */
      }
    }
    throw error;
  }
}
