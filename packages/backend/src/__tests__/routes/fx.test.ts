import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createTestApp } from '../helpers/createTestApp.js';

const mocks = vi.hoisted(() => ({
  fxRateFindMany: vi.fn(),
  fxRateFindUnique: vi.fn(),
  fxRateUpsert: vi.fn(),
  getExchangeRates: vi.fn(),
}));

vi.mock('../../lib/prisma.js', () => ({
  prisma: {
    fxRate: {
      findMany: mocks.fxRateFindMany,
      findUnique: mocks.fxRateFindUnique,
      upsert: mocks.fxRateUpsert,
    },
  },
}));
vi.mock('../../services/priceService.js', () => ({
  priceService: { getExchangeRates: mocks.getExchangeRates },
}));
vi.mock('../../middleware/auth.js', () => ({
  ensureUser: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock('../../lib/sentry.js', () => ({
  Sentry: { captureException: vi.fn() },
  initSentry: vi.fn(),
}));
vi.mock('../../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { default: fxRouter } = await import('../../routes/fx.js');
const app = createTestApp(fxRouter, '/api/fx');

describe('FX routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fxRateFindMany.mockResolvedValue([]);
    mocks.fxRateFindUnique.mockResolvedValue(null);
    mocks.fxRateUpsert.mockResolvedValue({});
    mocks.getExchangeRates.mockResolvedValue(null);
  });

  it('short-circuits same-currency conversion without touching rate storage', async () => {
    const response = await request(app).get('/api/fx/convert?amount=10.5&from=usd&to=USD');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      amount: 10.5,
      from: 'USD',
      to: 'USD',
      converted: 10.5,
      rate: 1,
    });
    expect(mocks.fxRateFindUnique).not.toHaveBeenCalled();
  });

  it.each(['1usd', 'Infinity', 'NaN', '1.2.3'])(
    'rejects malformed amount %s instead of partially parsing it',
    async (amount) => {
      const response = await request(app).get(`/api/fx/convert?amount=${amount}&from=USD&to=SGD`);
      expect(response.status).toBe(400);
      expect(mocks.fxRateFindUnique).not.toHaveBeenCalled();
    }
  );

  it('rejects repeated and malformed currency parameters', async () => {
    const repeated = await request(app).get('/api/fx/convert?amount=1&from=USD&from=SGD&to=JPY');
    const malformed = await request(app).get('/api/fx/convert?amount=1&from=US&to=JPY');

    expect(repeated.status).toBe(400);
    expect(malformed.status).toBe(400);
  });

  it('inverts a valid stored pair and rejects a zero-rate corrupted row', async () => {
    mocks.fxRateFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'rate-1',
      fromCcy: 'USD',
      toCcy: 'SGD',
      rate: 1.25,
      timestamp: new Date('2026-01-01T00:00:00.000Z'),
    });

    const valid = await request(app).get('/api/fx/convert?amount=125&from=SGD&to=USD');
    expect(valid.status).toBe(200);
    expect(valid.body.converted).toBe(100);
    expect(valid.body.rate).toBe(0.8);

    mocks.fxRateFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'rate-bad',
      fromCcy: 'USD',
      toCcy: 'SGD',
      rate: 0,
      timestamp: new Date(),
    });
    const corrupted = await request(app).get('/api/fx/convert?amount=1&from=SGD&to=USD');
    expect(corrupted.status).toBe(502);
    expect(corrupted.body.error).toBe('Stored exchange rate is invalid');
  });

  it('does not persist non-finite, zero, or negative provider rates', async () => {
    mocks.fxRateFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.getExchangeRates.mockResolvedValue({
      usdSgd: 1.3,
      usdJpy: -1,
      usdTwd: Number.POSITIVE_INFINITY,
      usdKrw: 0,
      usdNok: 10.5,
    });

    const response = await request(app).get('/api/fx/rates');

    expect(response.status).toBe(200);
    expect(mocks.fxRateUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.fxRateUpsert.mock.calls.map((call) => call[0].create.toCcy)).toEqual([
      'SGD',
      'NOK',
    ]);
  });
});
