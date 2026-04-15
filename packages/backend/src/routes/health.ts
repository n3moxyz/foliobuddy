import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

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
    const message = error instanceof Error ? error.message : 'Unknown database error';
    res.status(503).json({ status: 'error', latency_ms, message });
  }
});

export default router;
