import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mockPrisma = {
  asset: { findMany: vi.fn() },
  priceHistory: { findMany: vi.fn() },
};

const mockPriceService = {
  getAssetHistory: vi.fn(),
  refreshAllPrices: vi.fn(),
  updatePositionValues: vi.fn(),
};

vi.mock('../../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../../services/priceService.js', () => ({ priceService: mockPriceService }));
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

const { default: pricesRouter } = await import('../../routes/prices.js');
const app = createTestApp(pricesRouter, '/api/prices');

describe('GET /api/prices/historical/:providerAssetId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes encoded Yahoo index symbols to Yahoo historical lookup', async () => {
    mockPriceService.getAssetHistory.mockResolvedValue([
      { timestamp: 1767225600000, priceUsd: 5000 },
      { timestamp: 1767312000000, priceUsd: 5050 },
    ]);

    const res = await request(app).get('/api/prices/historical/%5EGSPC?provider=yahoo&days=365');

    expect(res.status).toBe(200);
    expect(mockPriceService.getAssetHistory).toHaveBeenCalledWith('yahoo', '^GSPC', 365);
    expect(res.body).toEqual({
      provider: 'yahoo',
      providerAssetId: '^GSPC',
      days: 365,
      data: [
        { timestamp: 1767225600000, price: 5000 },
        { timestamp: 1767312000000, price: 5050 },
      ],
    });
  });
});
