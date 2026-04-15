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

/**
 * Middleware to ensure user exists in database and attach userId to request
 */
export async function ensureUser(req: Request, res: Response, next: NextFunction) {
  try {
    const auth = getAuth(req);

    if (!auth.userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    let user = await prisma.user.findUnique({
      where: { id: auth.userId },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          id: auth.userId,
          email: `${auth.userId}@clerk.user`, // Placeholder, will be updated
          name: null,
        },
      });
    }

    // Attach userId to request for use in routes
    req.userId = auth.userId;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Authentication error' });
  }
}
