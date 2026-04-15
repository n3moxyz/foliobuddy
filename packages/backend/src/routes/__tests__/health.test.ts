import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

// Use vi.hoisted so the mock fn is available at hoist time
const { mockQueryRawUnsafe } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

import healthRouter from '../health.js';

function createApp() {
  const app = express();
  app.use('/api/health', healthRouter);
  return app;
}

describe('GET /api/health/db', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with status ok and latency_ms when DB is reachable', async () => {
    mockQueryRawUnsafe.mockResolvedValue([{ '?column?': 1 }]);

    const app = createApp();
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(typeof res.body.latency_ms).toBe('number');
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns 503 with status error and message when DB is unreachable', async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error('Connection refused'));

    const app = createApp();
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(res.body.status).toBe('error');
    expect(res.body.message).toBe('Connection refused');
    expect(typeof res.body.latency_ms).toBe('number');
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('includes latency_ms as a non-negative number in error responses', async () => {
    mockQueryRawUnsafe.mockRejectedValue(new Error('timeout'));

    const app = createApp();
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    expect(typeof res.body.latency_ms).toBe('number');
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
  });
});
