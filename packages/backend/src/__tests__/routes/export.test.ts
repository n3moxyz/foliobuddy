import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { createTestApp } from '../helpers/createTestApp.js';
import { mockPosition, mockSnapshot, mockTrade } from '../helpers/fixtures.js';

const mockPrisma = {
  position: { findMany: vi.fn() },
  trade: { findMany: vi.fn() },
  investor: { findMany: vi.fn() },
  snapshot: { findMany: vi.fn() },
};

const mockPortfolioService = {
  getSummary: vi.fn(),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/portfolioService.js', () => ({
  portfolioService: mockPortfolioService,
}));
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

const { default: exportRouter } = await import('../../routes/export.js');
const app = createTestApp(exportRouter, '/api/export');

function parseBinaryResponse(res: unknown, callback: (error: Error | null, body?: Buffer) => void) {
  const stream = res as NodeJS.ReadableStream & { setEncoding: (encoding: BufferEncoding) => void };
  stream.setEncoding('binary');
  const chunks: string[] = [];
  stream.on('data', (chunk) => chunks.push(chunk));
  stream.on('end', () => callback(null, Buffer.from(chunks.join(''), 'binary')));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.position.findMany.mockResolvedValue([mockPosition()]);
  mockPrisma.trade.findMany.mockResolvedValue([mockTrade()]);
  mockPrisma.investor.findMany.mockResolvedValue([
    {
      id: 'investor-1',
      userId: 'test-user-id',
      name: 'Owner',
      stakePercentage: 100,
      initialCapital: 80000,
      currentValue: 100000,
      totalReturn: 20000,
      totalReturnPct: 25,
      joinDate: new Date('2024-01-01'),
      isOwner: true,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ]);
  mockPrisma.snapshot.findMany.mockResolvedValue([mockSnapshot()]);
  mockPortfolioService.getSummary.mockResolvedValue({
    totalValueUsd: 100000,
    totalValueSgd: 135000,
    totalCostBasis: 80000,
    unrealizedPnL: 20000,
    unrealizedPnLPct: 25,
    dailyReturn: null,
    weeklyReturn: null,
    monthlyReturn: null,
    ytdReturn: null,
    btcOutperform: null,
    ethOutperform: null,
    positionCount: 1,
    lastUpdated: new Date('2024-01-02T00:00:00.000Z'),
  });
});

describe('GET /api/export/excel', () => {
  it('exports a workbook with supported worksheet names', async () => {
    const res = await request(app).get('/api/export/excel').buffer(true).parse(parseBinaryResponse);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    expect(res.headers['content-disposition']).toContain('portfolio_');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      'Summary',
      'Positions',
      'Trades',
      'Investors',
      'Snapshots',
    ]);
  });
});
