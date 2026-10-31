import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Prisma } from '@prisma/client';

// Use vi.hoisted so the mock fns are available at hoist time
const { mockQueryRawUnsafe, mockLogger } = vi.hoisted(() => ({
  mockQueryRawUnsafe: vi.fn(),
  mockLogger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    $queryRawUnsafe: mockQueryRawUnsafe,
  },
}));

vi.mock('../../lib/logger.js', () => ({ logger: mockLogger }));

import healthRouter from '../health.js';

// Prisma's P1001 text names the database host and port.
const PRIVATE_DB_HOST = 'postgres.internal.example';
const connectionError = () =>
  new Prisma.PrismaClientInitializationError(
    `Can't reach database server at \`${PRIVATE_DB_HOST}\`:\`5432\`\n\n` +
      `Please make sure your database server is running at \`${PRIVATE_DB_HOST}\`:\`5432\`.`,
    'test',
    'P1001'
  );

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

  it('returns 503 with a fixed message and logs the raw error when DB is unreachable', async () => {
    const error = connectionError();
    mockQueryRawUnsafe.mockRejectedValue(error);

    const app = createApp();
    const res = await request(app).get('/api/health/db');

    expect(res.status).toBe(503);
    // Exact shape, so no extra field can carry the raw error text.
    expect(res.body).toEqual({
      status: 'error',
      latency_ms: expect.any(Number),
      message: 'Database unavailable',
    });
    expect(res.body.latency_ms).toBeGreaterThanOrEqual(0);
    expect(res.text).not.toContain(PRIVATE_DB_HOST);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.any(String), error);
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
