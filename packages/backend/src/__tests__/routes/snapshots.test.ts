import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { mockSnapshot } from '../helpers/fixtures.js';
import { Prisma } from '@prisma/client';
import { createTestApp } from '../helpers/createTestApp.js';
import { ETHENA_USDE, STABLECOINX, findManyIn } from '../helpers/catalog.js';

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
  asset: { findMany: vi.fn() },
  position: { findMany: vi.fn() },
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

describe('GET /api/snapshots/:id/positions', () => {
  const row = (overrides: Record<string, unknown>) => ({
    id: 'sp-1',
    snapshotId: 'snapshot-1',
    assetId: null,
    assetSymbol: 'USDE',
    quantity: 10,
    priceUsd: 1,
    valueUsd: 10,
    allocation: 5,
    ...overrides,
  });

  // mockSnapshot is taken on 2024-01-01; positions default to owned and older.
  const held = (assetId: string, overrides: Record<string, unknown> = {}) => ({
    userId: 'test-user-id',
    assetId,
    custodyOf: null,
    createdAt: new Date('2023-06-01'),
    ...overrides,
  });

  function useSnapshot(
    positions: Array<Record<string, unknown>>,
    catalog: Array<Record<string, unknown>>,
    heldPositions: Array<Record<string, unknown>> = []
  ) {
    mockPrisma.snapshot.findUnique.mockResolvedValue(mockSnapshot({ positions }));
    mockPrisma.asset.findMany.mockImplementation(findManyIn(catalog));
    mockPrisma.position.findMany.mockImplementation(findManyIn(heldPositions));
  }

  const categories = async () =>
    (await request(app).get('/api/snapshots/snapshot-1/positions')).body.map(
      (pos: { asset: { category: string | null } }) => pos.asset.category
    );

  it('labels a row by its stored asset id when another class shares the ticker', async () => {
    for (const catalog of [
      [ETHENA_USDE, STABLECOINX],
      [STABLECOINX, ETHENA_USDE],
    ]) {
      useSnapshot([row({ assetId: STABLECOINX.id })], catalog);

      const res = await request(app).get('/api/snapshots/snapshot-1/positions');

      expect(res.status).toBe(200);
      expect(res.body[0].asset).toEqual({
        coingeckoId: null,
        symbol: 'USDE',
        name: 'StablecoinX Inc.',
        category: 'EQUITY',
      });
    }
  });

  it('resolves an older ticker-only row when one asset has that ticker', async () => {
    useSnapshot([row({})], [ETHENA_USDE]);

    expect(await categories()).toEqual(['STABLECOIN']);
  });

  it('resolves a shared ticker on an older row to the asset the user still holds', async () => {
    for (const catalog of [
      [ETHENA_USDE, STABLECOINX],
      [STABLECOINX, ETHENA_USDE],
    ]) {
      useSnapshot([row({})], catalog, [held(STABLECOINX.id)]);

      expect(await categories()).toEqual(['EQUITY']);
    }
  });

  it('ignores holdings the snapshot could not have included', async () => {
    // Held for someone else (snapshots record owned rows only), or opened after the snapshot.
    for (const position of [
      held(STABLECOINX.id, { custodyOf: 'Mum' }),
      held(STABLECOINX.id, { createdAt: new Date('2024-06-01') }),
    ]) {
      useSnapshot([row({})], [ETHENA_USDE, STABLECOINX], [position]);

      expect(await categories()).toEqual([null]);
    }
  });

  it('leaves the class unknown rather than guessing an unresolvable shared ticker', async () => {
    useSnapshot([row({})], [ETHENA_USDE, STABLECOINX]);

    const res = await request(app).get('/api/snapshots/snapshot-1/positions');

    expect(res.body[0].asset).toEqual({
      coingeckoId: null,
      symbol: 'USDE',
      name: 'USDE',
      category: null,
    });
  });

  it('does not fall back to the ticker when a stored asset id no longer exists', async () => {
    useSnapshot([row({ assetId: 'deleted-row' })], [ETHENA_USDE]);

    expect(await categories()).toEqual([null]);
  });

  it('returns 404 for another user’s snapshot without touching the catalog', async () => {
    mockPrisma.snapshot.findUnique.mockResolvedValue(mockSnapshot({ userId: 'someone-else' }));

    const res = await request(app).get('/api/snapshots/snapshot-1/positions');

    expect(res.status).toBe(404);
    expect(mockPrisma.asset.findMany).not.toHaveBeenCalled();
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

describe('POST /api/snapshots/bulk row errors', () => {
  it('reports a database failure on a row without leaking the raw Prisma message', async () => {
    mockPrisma.snapshot.findFirst.mockResolvedValue(null);
    mockPrisma.snapshot.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`userId`,`snapshotType`,`scheduledLocalDate`)',
        { code: 'P2002', clientVersion: 'test' }
      )
    );

    const res = await request(app)
      .post('/api/snapshots/bulk')
      .send({ snapshots: [{ timestamp: '2026-01-15T00:00:00.000Z', totalValueUsd: 100 }] });

    expect(res.body.results).toEqual([
      {
        success: false,
        timestamp: '2026-01-15T00:00:00.000Z',
        error: 'A record with this value already exists',
      },
    ]);
  });
});
