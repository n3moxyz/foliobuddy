import { clerkMiddleware, getAuth, requireAuth } from '@clerk/express';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

// Extend Express Request to include auth
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Clerk middleware - validates JWT tokens
 */
export { clerkMiddleware, requireAuth };

let localBypassWarningLogged = false;

function getLocalAuthBypassUserId(): string | null {
  if (process.env.NODE_ENV === 'production') return null;
  if (process.env.ALLOW_LOCAL_AUTH_BYPASS !== 'true') return null;

  const userId = process.env.LOCAL_AUTH_USER_ID?.trim() || 'local-scale-user';
  if (!localBypassWarningLogged) {
    logger.warn(`Local auth bypass enabled for ${userId}; never enable this in production.`);
    localBypassWarningLogged = true;
  }
  return userId;
}

/**
 * Middleware to ensure user exists in database and attach userId to request
 */
export async function ensureUser(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req);
    const userId = auth.userId ?? getLocalAuthBypassUserId();

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: userId,
          email: `${userId}@clerk.user`, // Placeholder, will be updated
          name: null,
        },
      });
      // Visible marker for first sign-ins. After a Clerk instance migration an
      // unexpected auto-create means an id was not remapped (see
      // scripts/remap-clerk-user-ids.ts).
      logger.warn(`Auto-created User row for ${userId} on first sign-in`);
    }

    // Attach userId to request for use in routes
    req.userId = userId;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}
