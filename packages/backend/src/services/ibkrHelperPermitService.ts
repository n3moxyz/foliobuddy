import { createHash, randomBytes } from 'node:crypto';
import { AppError } from '../middleware/errorHandler.js';
import { navTransaction } from './unitTrustNavService.js';
import {
  bindIbkrConnector,
  ownedIbkrCash,
  requireIbkrConnector,
} from './ibkrConnectorOwnership.js';
import {
  ibkrHelperConsumeSchema,
  ibkrHelperPermitSchema,
  type IbkrHelperScope,
} from './ibkrHelperAuth.js';

const ttlMs = 60_000;
const permitsPerMinute = 30;
const unavailable = 'IBKR helper authorization is unavailable';
const digest = (permit: string) => createHash('sha256').update(permit).digest('hex');

export async function issueIbkrHelperPermit(userId: string, raw: unknown) {
  const scope = ibkrHelperPermitSchema.parse(raw);
  const permit = randomBytes(32).toString('base64url');
  const tokenHash = digest(permit);
  const expiresAt = await navTransaction(async (tx) => {
    try {
      await ownedIbkrCash(tx, userId, scope.cashPositionId);
      if (scope.operation === 'pair')
        await bindIbkrConnector(tx, userId, scope.connectorFingerprint);
      else await requireIbkrConnector(tx, userId, scope.connectorFingerprint);
    } catch (error) {
      if (error instanceof AppError) throw new AppError(unavailable, 403);
      throw error;
    }
    const now = new Date();
    await tx.ibkrHelperPermit.deleteMany({ where: { userId, expiresAt: { lte: now } } });
    const recent = await tx.ibkrHelperPermit.count({
      where: { userId, createdAt: { gte: new Date(now.getTime() - ttlMs) } },
    });
    if (recent >= permitsPerMinute) throw new AppError(unavailable, 429);
    const expiresAt = new Date(now.getTime() + ttlMs);
    await tx.ibkrHelperPermit.create({
      data: { tokenHash, userId, ...scope, createdAt: now, expiresAt },
    });
    return expiresAt;
  });
  return { permit, expiresAt: expiresAt.toISOString() };
}

export async function consumeIbkrHelperPermit(
  raw: unknown
): Promise<{ userId: string } & IbkrHelperScope> {
  const { permit, ...scope } = ibkrHelperConsumeSchema.parse(raw);
  const tokenHash = digest(permit);
  return navTransaction(async (tx) => {
    const now = new Date();
    const saved = await tx.ibkrHelperPermit.findUnique({ where: { tokenHash } });
    if (
      !saved ||
      saved.consumedAt ||
      saved.expiresAt <= now ||
      saved.cashPositionId !== scope.cashPositionId ||
      saved.connectorFingerprint !== scope.connectorFingerprint ||
      saved.challenge !== scope.challenge ||
      saved.operation !== scope.operation ||
      saved.jobId !== scope.jobId
    )
      throw new AppError(unavailable, 401);
    try {
      await ownedIbkrCash(tx, saved.userId, saved.cashPositionId);
      await requireIbkrConnector(tx, saved.userId, saved.connectorFingerprint);
    } catch (error) {
      if (error instanceof AppError) throw new AppError(unavailable, 401);
      throw error;
    }
    // Prisma stores DateTime as UTC in timestamp-without-time-zone columns;
    // compare using UTC even when the PostgreSQL session has a local timezone.
    const accepted = await tx.$executeRaw`
      UPDATE "IbkrHelperPermit" SET "consumedAt" = clock_timestamp() AT TIME ZONE 'UTC'
      WHERE "tokenHash" = ${tokenHash} AND "consumedAt" IS NULL
        AND "expiresAt" > clock_timestamp() AT TIME ZONE 'UTC'
    `;
    if (accepted !== 1) throw new AppError(unavailable, 401);
    return { userId: saved.userId, ...scope };
  });
}
