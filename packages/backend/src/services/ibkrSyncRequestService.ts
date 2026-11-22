import type { IbkrSyncRequestStatus, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { ownedIbkrCash, requireIbkrConnector } from './ibkrConnectorOwnership.js';
import type { IbkrTransaction } from './ibkrSyncService.js';
import { navTransaction } from './unitTrustNavService.js';

const queueLifetimeMs = 5 * 60_000;
const runLifetimeMs = 10 * 60_000;
const dayMs = 24 * 60 * 60_000;
const maxRequestsPerDay = 12;
const missedRequest = 'The connected Mac did not pick up the request. Check the Mac and try again.';
const expiredRun = 'The Mac did not finish reading IBKR in time. Try again.';
const unverifiedRun =
  'Review IBKR Daily Sync before starting another run. The saved result is unverified.';

const viewFields = {
  id: true,
  status: true,
  expiresAt: true,
  error: true,
  device: { select: { name: true } },
  attempt: { select: { capturedAt: true, unchanged: true } },
} satisfies Prisma.IbkrSyncRequestSelect;
type RequestView = Prisma.IbkrSyncRequestGetPayload<{ select: typeof viewFields }>;

function dto(row: RequestView, now: Date) {
  const { id, expiresAt, device, attempt } = row;
  let { status, error } = row;
  if ((status === 'queued' || status === 'running') && expiresAt <= now) {
    error = status === 'queued' ? missedRequest : attempt ? unverifiedRun : expiredRun;
    status = attempt ? 'blocked' : 'expired';
  }
  if (status === 'expired' && !error)
    error = 'The request expired before IBKR could sync. Check the connected Mac and try again.';
  return {
    id,
    status,
    deviceName: device.name,
    error,
    capturedAt: status === 'verified' ? (attempt?.capturedAt.toISOString() ?? null) : null,
    unchanged: status === 'verified' ? (attempt?.unchanged ?? null) : null,
  };
}

async function expireIdle(tx: IbkrTransaction, deviceId: string, now: Date) {
  await tx.ibkrSyncRequest.updateMany({
    where: { activeDeviceId: deviceId, expiresAt: { lte: now }, attempt: { is: null } },
    data: { status: 'expired', activeDeviceId: null },
  });
}

export async function queueIbkrSyncRequest(userId: string, cashPositionId: string) {
  return navTransaction(async (tx) => {
    await ownedIbkrCash(tx, userId, cashPositionId);
    const device = await tx.ibkrSyncDevice.findFirst({
      where: { userId, cashPositionId, activeCashPositionId: cashPositionId, revokedAt: null },
      select: { id: true, supportsOnDemand: true, connectorFingerprint: true },
    });
    if (!device) return null;
    await requireIbkrConnector(tx, userId, device.connectorFingerprint);
    if (!device.supportsOnDemand)
      throw new AppError('Update the connected Mac to start an IBKR sync from this device.', 409);
    const now = new Date();
    await expireIdle(tx, device.id, now);
    const active = await tx.ibkrSyncRequest.findUnique({
      where: { activeDeviceId: device.id },
      select: viewFields,
    });
    if (active) return dto(active, now);
    if (await tx.ibkrSyncAttempt.findUnique({ where: { activeCashPositionId: cashPositionId } }))
      throw new AppError('Review the unfinished run in IBKR Daily Sync before syncing again.', 409);
    if (
      (await tx.ibkrSyncRequest.count({
        where: { deviceId: device.id, createdAt: { gte: new Date(now.getTime() - dayMs) } },
      })) >= maxRequestsPerDay
    )
      throw new AppError('The connected Mac has reached its on-demand sync limit for today.', 429);
    await tx.ibkrSyncRequest.deleteMany({
      where: {
        deviceId: device.id,
        activeDeviceId: null,
        createdAt: { lt: new Date(now.getTime() - 7 * dayMs) },
      },
    });
    const request = await tx.ibkrSyncRequest.create({
      data: {
        deviceId: device.id,
        activeDeviceId: device.id,
        expiresAt: new Date(now.getTime() + queueLifetimeMs),
      },
      select: viewFields,
    });
    return dto(request, now);
  });
}

export async function getIbkrSyncRequest(userId: string, id: string) {
  const request = await prisma.ibkrSyncRequest.findFirst({
    where: { id, device: { userId } },
    select: viewFields,
  });
  if (!request) throw new AppError('The IBKR sync request is unavailable.', 404);
  return dto(request, new Date());
}

// Called only inside the signed device transaction, after the grant is checked.
export async function claimIbkrSyncRequest(tx: IbkrTransaction, deviceId: string) {
  const now = new Date();
  await expireIdle(tx, deviceId, now);
  const queued = await tx.ibkrSyncRequest.findUnique({ where: { activeDeviceId: deviceId } });
  if (queued?.status !== 'queued') return null;
  await tx.ibkrSyncRequest.update({
    where: { id: queued.id },
    data: { status: 'running', expiresAt: new Date(now.getTime() + runLifetimeMs) },
  });
  return queued.id;
}

export async function requireClaimedIbkrSyncRequest(
  tx: IbkrTransaction,
  deviceId: string,
  id: string
) {
  const request = await tx.ibkrSyncRequest.findFirst({
    where: {
      id,
      activeDeviceId: deviceId,
      status: 'running',
      expiresAt: { gt: new Date() },
      attempt: { is: null },
    },
    select: { id: true },
  });
  if (!request) throw new AppError('The IBKR sync request expired or was already used.', 409);
}

export async function finishIbkrSyncRequest(
  tx: IbkrTransaction,
  deviceId: string,
  id: string,
  status: Extract<IbkrSyncRequestStatus, 'verified' | 'blocked' | 'failed'>,
  error: string | null = null,
  beforePreview = false
) {
  await tx.ibkrSyncRequest.updateMany({
    where: {
      id,
      activeDeviceId: deviceId,
      status: 'running',
      ...(beforePreview && { expiresAt: { gt: new Date() }, attempt: { is: null } }),
    },
    data: { status, error, activeDeviceId: null },
  });
}

export async function cancelRevokedIbkrSyncRequest(
  tx: IbkrTransaction,
  deviceId: string,
  blocked: boolean
) {
  await tx.ibkrSyncRequest.updateMany({
    where: { activeDeviceId: deviceId },
    data: {
      status: blocked ? 'blocked' : 'failed',
      activeDeviceId: null,
      error: blocked ? unverifiedRun : 'The connected Mac was disconnected before it finished.',
    },
  });
}
