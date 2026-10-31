import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

const router = Router();

// GET /api/health/db - Database health check (no auth)
router.get('/db', async (req, res) => {
  const start = Date.now();
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    const latency_ms = Date.now() - start;
    res.json({ status: 'ok', latency_ms });
  } catch (error) {
    const latency_ms = Date.now() - start;
    // Anyone can call this route, and Prisma connection errors name the private
    // database host and port. Keep the cause in the server log only.
    logger.error('[Health] Database check failed:', error);
    res.status(503).json({ status: 'error', latency_ms, message: 'Database unavailable' });
  }
});

export default router;
