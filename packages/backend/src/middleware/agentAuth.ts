import { Request, Response, NextFunction } from 'express';
import { logger } from '../lib/logger.js';

/**
 * Middleware for agent API access (OpenClaw bots).
 * Checks x-api-key header against AGENT_API_KEY env var.
 * Sets req.userId to AGENT_USER_ID so downstream queries work identically to Clerk auth.
 */
export function agentAuth(req: Request, res: Response, next: NextFunction) {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.AGENT_API_KEY) {
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
