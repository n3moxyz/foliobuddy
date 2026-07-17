import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(),
    investor: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    investorStake: { findMany: vi.fn(), create: vi.fn() },
    snapshot: { findMany: vi.fn() },
  };
  return { prisma, getSummary: vi.fn() };
});

vi.mock('../../lib/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../../services/portfolioService.js', () => ({
  portfolioService: { getSummary: mocks.getSummary },
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));

const { default: investorsRouter } = await import('../../routes/investors.js');
const app = createTestApp(investorsRouter, '/api/investors');

describe('investor mutation atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.getSummary.mockResolvedValue({ totalValueUsd: 1_000 });
    mocks.prisma.investor.findMany.mockResolvedValue([]);
    mocks.prisma.investor.create.mockResolvedValue({ id: 'investor-new', name: 'New' });
    mocks.prisma.investorStake.create.mockResolvedValue({});
  });

  it('validates stake capacity before clearing an existing owner', async () => {
    mocks.prisma.investor.findMany.mockResolvedValue([{ stakePercentage: 90 }]);

    const response = await request(app).post('/api/investors').send({
      name: 'New owner',
      stakePercentage: 20,
      isOwner: true,
    });

    expect(response.status).toBe(400);
    expect(mocks.prisma.investor.updateMany).not.toHaveBeenCalled();
    expect(mocks.prisma.investor.create).not.toHaveBeenCalled();
  });

  it('creates the investor and initial stake inside one serializable transaction', async () => {
    const response = await request(app).post('/api/investors').send({
      name: '  Alice  ',
      stakePercentage: 25,
      initialCapital: 200,
    });

    expect(response.status).toBe(201);
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(mocks.prisma.investor.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Alice', stakePercentage: 25, currentValue: 250 }),
    });
    expect(mocks.prisma.investorStake.create).toHaveBeenCalledWith({
      data: { investorId: 'investor-new', stakePercentage: 25, valueAtTime: 250 },
    });
  });

  it.each([
    [{ name: '   ' }, 'blank name'],
    [{ name: 'Alice', joinDate: '2026-02-31' }, 'impossible date'],
  ])('rejects %s (%s) before opening a transaction', async (body, _description) => {
    const response = await request(app).post('/api/investors').send(body);
    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects repeated reassignment IDs before any mutation', async () => {
    const response = await request(app).delete(
      '/api/investors/investor-1?reassignTo=investor-2&reassignTo=investor-3'
    );

    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.prisma.investor.delete).not.toHaveBeenCalled();
  });

  it('reassigns stake, records history, and deletes inside one transaction', async () => {
    mocks.prisma.investor.findFirst
      .mockResolvedValueOnce({ id: 'investor-1', stakePercentage: 25 })
      .mockResolvedValueOnce({ id: 'investor-2', stakePercentage: 50 });
    mocks.prisma.investor.update.mockResolvedValue({});
    mocks.prisma.investor.delete.mockResolvedValue({});

    const response = await request(app).delete('/api/investors/investor-1?reassignTo=investor-2');

    expect(response.status).toBe(204);
    expect(mocks.prisma.investor.update).toHaveBeenCalledWith({
      where: { id: 'investor-2' },
      data: { stakePercentage: 75 },
    });
    expect(mocks.prisma.investorStake.create).toHaveBeenCalledWith({
      data: { investorId: 'investor-2', stakePercentage: 75, valueAtTime: 750 },
    });
    expect(mocks.prisma.investor.delete).toHaveBeenCalledWith({ where: { id: 'investor-1' } });
  });
});
