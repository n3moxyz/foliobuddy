import { prisma } from '../../lib/prisma.js';
import { TTLCache } from '../../lib/TTLCache.js';
import { logger } from '../../lib/logger.js';
import { USD_SGD_FALLBACK_RATE } from '../../lib/constants.js';
import type {
  AssetPriceProvider,
  ProviderHistoricalPoint,
  ProviderPrice,
  ProviderSearchResult,
} from './types.js';

const YAHOO_SEARCH_URL = 'https://query1.finance.yahoo.com/v1/finance/search';
const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YAHOO_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

const PRICE_CACHE_DURATION_MS = 5 * 60 * 1000;
const PRICE_CACHE_MAX_ENTRIES = 200;
const HISTORICAL_CACHE_DURATION_MS = 30 * 60 * 1000;
const HISTORICAL_CACHE_MAX_ENTRIES = 50;
const SEARCH_CACHE_DURATION_MS = 10 * 60 * 1000;
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 8000;

type YahooQuoteItem = {
  symbol: string;
  regularMarketPrice?: number;
  currency?: string;
  exchange?: string;
  fullExchangeName?: string;
  longName?: string;
  shortName?: string;
  quoteType?: string;
};

type YahooQuoteResponse = {
  quoteResponse: { result: YahooQuoteItem[]; error: unknown };
};

type YahooSearchItem = {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
};

type YahooSearchResponse = { quotes: YahooSearchItem[] };

type YahooChartResponse = {
  chart: {
    result?: Array<{
      meta: { currency?: string; regularMarketPrice?: number };
      timestamp?: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }>;
    error: unknown;
  };
};

export class YahooFinanceProvider implements AssetPriceProvider {
  readonly name = 'yahoo' as const;
  readonly refreshIntervalMinutes = 15;

  private readonly priceCache = new TTLCache<string, ProviderPrice>(
    PRICE_CACHE_DURATION_MS,
    PRICE_CACHE_MAX_ENTRIES
  );
  private readonly historicalCache = new TTLCache<string, ProviderHistoricalPoint[]>(
    HISTORICAL_CACHE_DURATION_MS,
    HISTORICAL_CACHE_MAX_ENTRIES
  );
  private readonly searchCache = new TTLCache<string, ProviderSearchResult[]>(
    SEARCH_CACHE_DURATION_MS,
    100
  );

  private async fetchJson<T>(url: string): Promise<T | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (!response.ok) {
        logger.warn(`[Yahoo] HTTP ${response.status} for ${url}`);
        return null;
      }
      return (await response.json()) as T;
    } catch (error) {
      logger.error('[Yahoo] fetch error:', error instanceof Error ? error.message : error);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getUsdSgdRate(): Promise<number> {
    const row = await prisma.fxRate.findUnique({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: 'SGD' } },
    });
    return row?.rate ?? USD_SGD_FALLBACK_RATE;
  }

  private toUsd(nativePrice: number, currency: string, usdSgd: number): number {
    const ccy = currency.toUpperCase();
    if (ccy === 'USD') return nativePrice;
    if (ccy === 'SGD') return nativePrice / usdSgd;
    return nativePrice;
  }

  async getPrices(providerAssetIds: string[]): Promise<Map<string, ProviderPrice>> {
    const prices = new Map<string, ProviderPrice>();
    const idsToFetch: string[] = [];
    for (const id of providerAssetIds) {
      const cached = this.priceCache.get(id);
      if (cached) prices.set(id, cached);
      else idsToFetch.push(id);
    }
    if (idsToFetch.length === 0) return prices;

    const usdSgd = await this.getUsdSgdRate();

    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE);
      const url = `${YAHOO_QUOTE_URL}?symbols=${batch.map(encodeURIComponent).join(',')}`;
      const data = await this.fetchJson<YahooQuoteResponse>(url);
      if (!data?.quoteResponse?.result) continue;

      for (const item of data.quoteResponse.result) {
        if (item.regularMarketPrice === undefined) continue;
        const currency = item.currency?.toUpperCase() ?? 'USD';
        const nativePrice = item.regularMarketPrice;
        const priceUsd = this.toUsd(nativePrice, currency, usdSgd);
        const fxRateToUsd = currency === 'USD' ? 1 : priceUsd / nativePrice;
        const entry: ProviderPrice = {
          priceUsd,
          nativePrice,
          nativeCurrency: currency,
          fxRateToUsd,
        };
        prices.set(item.symbol, entry);
        this.priceCache.set(item.symbol, entry);
      }
    }
    return prices;
  }

  async search(query: string): Promise<ProviderSearchResult[]> {
    const cacheKey = query.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0`;
    const data = await this.fetchJson<YahooSearchResponse>(url);
    if (!data?.quotes) return [];

    const allowedTypes = new Set(['EQUITY', 'ETF', 'MUTUALFUND']);
    const results: ProviderSearchResult[] = data.quotes
      .filter((q) => q.quoteType && allowedTypes.has(q.quoteType))
      .map((q) => ({
        providerAssetId: q.symbol,
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchDisp || q.exchange || null,
        nativeCurrency: this.inferCurrencyFromSymbol(q.symbol),
        rank: null,
      }));

    this.searchCache.set(cacheKey, results);
    return results;
  }

  private inferCurrencyFromSymbol(symbol: string): string {
    if (symbol.endsWith('.SI')) return 'SGD';
    if (symbol.endsWith('.HK')) return 'HKD';
    if (symbol.endsWith('.L')) return 'GBP';
    if (symbol.endsWith('.T') || symbol.endsWith('.TO')) return 'CAD';
    return 'USD';
  }

  async getHistoricalPrices(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const cacheKey = `${providerAssetId}-${days}`;
    const cached = this.historicalCache.get(cacheKey);
    if (cached) return cached;

    const range = this.daysToRange(days);
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(providerAssetId)}?range=${range}&interval=1d&includePrePost=false`;
    const data = await this.fetchJson<YahooChartResponse>(url);
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      logger.warn(`[Yahoo] No chart data for ${providerAssetId}`);
      return [];
    }

    const currency = result.meta.currency?.toUpperCase() ?? 'USD';
    const usdSgd = await this.getUsdSgdRate();
    const closes = result.indicators.quote[0].close;
    const timestamps = result.timestamp;

    const points: ProviderHistoricalPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const nativePrice = closes[i];
      if (nativePrice === null || nativePrice === undefined) continue;
      const priceUsd = this.toUsd(nativePrice, currency, usdSgd);
      points.push({ timestamp: timestamps[i] * 1000, priceUsd, nativePrice });
    }

    this.historicalCache.set(cacheKey, points);
    return points;
  }

  private daysToRange(days: number): string {
    if (days <= 5) return '5d';
    if (days <= 30) return '1mo';
    if (days <= 90) return '3mo';
    if (days <= 180) return '6mo';
    if (days <= 365) return '1y';
    if (days <= 730) return '2y';
    return '5y';
  }

  clearCache(): void {
    this.priceCache.clear();
    this.historicalCache.clear();
    this.searchCache.clear();
  }
}
