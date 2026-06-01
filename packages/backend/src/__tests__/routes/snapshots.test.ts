import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockSnapshot } from '../helpers/fixtures.js';
import { createTestApp } from '../helpers/createTestApp.js';

// Mock Prisma
const mockPrisma = {
  snapshot: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));
vi.mock('@clerk/express', () => ({
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  getAuth: () => ({ userId: 'test-clerk-id' }),
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/auth.js', () => ({
  ensureUser: (_req: any, _res: any, next: any) => next(),
  clerkMiddleware: () => (_req: any, _res: any, next: any) => next(),
  requireAuth: () => (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/snapshotService.js', () => ({
  snapshotService: {
    createSnapshot: vi.fn(),
    getPerformanceHistory: vi.fn(),
    getPerformanceHistoryByRange: vi.fn(),
    getMonthlyReturns: vi.fn(),
  },
}));

// Import route after mocks
const { snapshotService } = await import('../../services/snapshotService.js');
const { default: snapshotsRouter } = await import('../../routes/snapshots.js');
const app = createTestApp(snapshotsRouter, '/api/snapshots');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/snapshots', () => {
  it('creates a manual snapshot with provided values', async () => {
    const snapshot = mockSnapshot({
      totalValueUsd: 150000,
      totalCostBasis: 100000,
      source: 'MANUAL',
    });
    mockPrisma.snapshot.create.mockResolvedValue(snapshot);

    const res = await request(app).post('/api/snapshots').send({
      manual: true,
      timestamp: '2024-06-01T00:00:00Z',
      totalValueUsd: 150000,
      totalCostBasis: 100000,
    });

    expect(res.status).toBe(201);
    const createCall = mockPrisma.snapshot.create.mock.calls[0][0];
    expect(createCall.data.source).toBe('MANUAL');
    expect(createCall.data.totalValueUsd).toBe(150000);
    expect(createCall.data.userId).toBe('test-user-id');
  });
});

describe('GET /api/snapshots', () => {
  it('returns snapshots array', async () => {
    const snapshots = [mockSnapshot(), mockSnapshot({ id: 'snapshot-2' })];
    mockPrisma.snapshot.findMany.mockResolvedValue(snapshots);

    const res = await request(app).get('/api/snapshots');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe('GET /api/snapshots/performance', () => {
  it('defaults to the last 30 days when no range is provided', async () => {
    vi.mocked(snapshotService.getPerformanceHistory).mockResolvedValue([]);

    const res = await request(app).get('/api/snapshots/performance');

    expect(res.status).toBe(200);
    expect(snapshotService.getPerformanceHistory).toHaveBeenCalledWith('test-user-id', 30);
    expect(snapshotService.getPerformanceHistoryByRange).not.toHaveBeenCalled();
  });

  it('returns all performance history when all=true is provided', async () => {
    vi.mocked(snapshotService.getPerformanceHistoryByRange).mockResolvedValue([]);

    const res = await request(app).get('/api/snapshots/performance?all=true');

    expect(res.status).toBe(200);
    expect(snapshotService.getPerformanceHistoryByRange).toHaveBeenCalledWith('test-user-id');
    expect(snapshotService.getPerformanceHistory).not.toHaveBeenCalled();
  });
});

describe('GET /api/snapshots/:id', () => {
  it('returns snapshot with positions', async () => {
    const snapshot = mockSnapshot({ positions: [{ id: 'sp-1', assetSymbol: 'BTC' }] });
    mockPrisma.snapshot.findUnique.mockResolvedValue(snapshot);

    const res = await request(app).get('/api/snapshots/snapshot-1');

    expect(res.status).toBe(200);
    expect(res.body.positions).toHaveLength(1);
  });
});

describe('DELETE /api/snapshots/:id', () => {
  it('returns 204 on success with ownership check', async () => {
    mockPrisma.snapshot.findFirst.mockResolvedValue(mockSnapshot());
    mockPrisma.snapshot.delete.mockResolvedValue({});

    const res = await request(app).delete('/api/snapshots/snapshot-1');

    expect(res.status).toBe(204);
    // Verify ownership check used userId
    expect(mockPrisma.snapshot.findFirst).toHaveBeenCalledWith({
      where: { id: 'snapshot-1', userId: 'test-user-id' },
    });
  });

  it('returns 404 when snapshot not owned by user', async () => {
    mockPrisma.snapshot.findFirst.mockResolvedValue(null);

    const res = await request(app).delete('/api/snapshots/someone-elses');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Snapshot not found');
  });
});
