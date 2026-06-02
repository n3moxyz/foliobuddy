import { beforeEach, describe, expect, it, vi } from 'vitest';

const chartMock = vi.fn();
const quoteMock = vi.fn();
const searchMock = vi.fn();

vi.mock('yahoo-finance2', () => ({
  default: vi.fn(function YahooFinance() {
    return {
      chart: chartMock,
      quote: quoteMock,
      search: searchMock,
    };
  }),
}));

const mockPrisma = {
  fxRate: { findUnique: vi.fn() },
};

vi.mock('../lib/prisma.js', () => ({ prisma: mockPrisma }));
vi.mock('../lib/logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const { YahooFinanceProvider } = await import('../services/providers/YahooFinanceProvider.js');

describe('YahooFinanceProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.fxRate.findUnique.mockResolvedValue(null);
  });

  it('fetches index history through yahoo-finance2 chart for symbols like ^GSPC', async () => {
    chartMock.mockResolvedValue({
      meta: { currency: 'USD' },
      quotes: [
        { date: new Date('2026-01-02T00:00:00.000Z'), close: 5000 },
        { date: new Date('2026-01-03T00:00:00.000Z'), close: null },
        { date: new Date('2026-01-04T00:00:00.000Z'), close: 5100 },
      ],
    });

    const provider = new YahooFinanceProvider();
    const history = await provider.getHistoricalPrices('^GSPC', 30);

    expect(chartMock).toHaveBeenCalledWith(
      '^GSPC',
      expect.objectContaining({
        interval: '1d',
        includePrePost: false,
        return: 'array',
      })
    );
    expect(history).toEqual([
      {
        timestamp: new Date('2026-01-02T00:00:00.000Z').getTime(),
        priceUsd: 5000,
        nativePrice: 5000,
      },
      {
        timestamp: new Date('2026-01-04T00:00:00.000Z').getTime(),
        priceUsd: 5100,
        nativePrice: 5100,
      },
    ]);
  });
});
