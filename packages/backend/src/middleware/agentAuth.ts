import { Request, Response, NextFunction } from 'express';
import { timingSafeEqual } from 'crypto';
import { logger } from '../lib/logger.js';

/**
 * Middleware for agent API access (OpenClaw bots).
 * Checks x-api-key header against AGENT_API_KEY env var using a
 * timing-safe comparison to prevent key-enumeration via timing attacks.
 * Sets req.userId to AGENT_USER_ID so downstream queries work identically to Clerk auth.
 */
export function agentAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];
  const expectedKey = process.env.AGENT_API_KEY;

  if (!apiKey || !expectedKey) {
    logger.warn('Agent auth failed: invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Use timing-safe comparison to prevent key-enumeration via timing attacks
  const provided = Buffer.from(Array.isArray(apiKey) ? apiKey[0] : apiKey);
  const expected = Buffer.from(expectedKey);

  const keyMatch = provided.length === expected.length && timingSafeEqual(provided, expected);

  if (!keyMatch) {
    logger.warn('Agent auth failed: invalid or missing API key');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = process.env.AGENT_USER_ID;
  if (!userId) {
    logger.error('AGENT_USER_ID not configured');
    return res.status(500).json({ error: 'Server misconfigured' });
  }

  req.userId = userId;
  next();
}
