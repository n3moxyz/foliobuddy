import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Unlike YahooFinanceProvider.test.ts, yahoo-finance2 is NOT mocked here: only
// the network is. That runs the library's own schema validation against a real
// Yahoo payload, which is what broke every name search.
vi.mock('../lib/prisma.js', () => ({ prisma: { fxRate: { findUnique: vi.fn() } } }));
vi.mock('../lib/logger.js', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const { YahooFinanceProvider } = await import('../services/providers/YahooFinanceProvider.js');

// Yahoo's /v1/finance/search response for "StablecoinX", captured 2026-09-26.
// typeDisp is "Equity" while yahoo-finance2 3.14 expects "equity", so strict
// validation rejected the whole response and the provider returned nothing.
const STABLECOINX_SEARCH_RESPONSE = {
  explains: [],
  count: 2,
  quotes: [
    {
      exchange: 'NCM',
      shortname: 'StablecoinX Inc.',
      quoteType: 'EQUITY',
      symbol: 'USDE',
      index: 'quotes',
      score: 26469,
      typeDisp: 'Equity',
      longname: 'StablecoinX Inc.',
      exchDisp: 'NASDAQ',
      sector: 'Financial Services',
      sectorDisp: 'Financial Services',
      industry: 'Capital Markets',
      industryDisp: 'Capital Markets',
      dispSecIndFlag: true,
      isYahooFinance: true,
    },
    {
      exchange: 'NCM',
      quoteType: 'EQUITY',
      symbol: 'USDEW',
      index: 'quotes',
      score: 20138,
      typeDisp: 'Equity',
      longname: 'StablecoinX Inc.',
      exchDisp: 'NASDAQ',
      isYahooFinance: true,
    },
  ],
  news: [],
  nav: [],
  lists: [],
  researchReports: [],
  screenerFieldResults: [],
  totalTime: 19,
  timeTakenForQuotes: 414,
  timeTakenForNews: 0,
  timeTakenForAlgowatchlist: 400,
  timeTakenForPredefinedScreener: 400,
  timeTakenForCrunchbase: 400,
  timeTakenForNav: 400,
  timeTakenForResearchReports: 0,
  timeTakenForQuestions: 0,
  timeTakenForScreenerField: 0,
  timeTakenForCulturalAssets: 0,
  timeTakenForSearchLists: 0,
};

function requestUrl(input: unknown): string {
  return input instanceof Request ? input.url : String(input);
}

describe('YahooFinanceProvider search through the real yahoo-finance2 library', () => {
  const fetchMock = vi.fn(async (input: unknown) =>
    requestUrl(input).includes('/v1/finance/search')
      ? Response.json(STABLECOINX_SEARCH_RESPONSE)
      : Response.json({}, { status: 404 })
  );

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('finds StablecoinX by company name even though the payload fails the library schema', async () => {
    const results = await new YahooFinanceProvider().search('StablecoinX');

    expect(
      fetchMock.mock.calls.some(([input]) => requestUrl(input).includes('q=StablecoinX'))
    ).toBe(true);
    expect(results).toEqual([
      {
        providerAssetId: 'USDE',
        symbol: 'USDE',
        name: 'StablecoinX Inc.',
        exchange: 'NASDAQ',
        nativeCurrency: 'USD',
        rank: null,
      },
      {
        providerAssetId: 'USDEW',
        symbol: 'USDEW',
        name: 'StablecoinX Inc.',
        exchange: 'NASDAQ',
        nativeCurrency: 'USD',
        rank: null,
      },
    ]);
  });
});
