import { prisma } from './prisma.js';
import { AppError } from '../middleware/errorHandler.js';

function configuredAdminUserIds(): Set<string> {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isAdminUser(userId: string | undefined): boolean {
  return !!userId && configuredAdminUserIds().has(userId);
}

export function requireAdminUser(userId: string | undefined): void {
  if (!isAdminUser(userId)) {
    throw new AppError('Admin access required', 403);
  }
}

export async function requireUserHoldsAsset(userId: string, assetId: string): Promise<void> {
  const position = await prisma.position.findFirst({
    where: { userId, assetId },
    select: { id: true },
  });

  if (!position) {
    throw new AppError('Asset not found', 404);
  }
}
