import YahooFinance from 'yahoo-finance2';
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

const yahooFinance = new YahooFinance();

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

type YahooSearchItem = {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
};

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

  private toUsd(nativePrice: number, currency: string, usdSgd: number): number | null {
    const ccy = currency.toUpperCase();
    if (ccy === 'USD') return nativePrice;
    if (ccy === 'SGD') return nativePrice / usdSgd;
    return null;
  }

  private isSupportedCurrency(currency: string | null | undefined): boolean {
    return currency === 'USD' || currency === 'SGD';
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
      type QuoteLike = {
        symbol: string;
        regularMarketPrice?: number;
        currency?: string;
      };
      let quotes: QuoteLike[] = [];
      try {
        // yahoo-finance2 handles the crumb+cookie consent flow that Yahoo now
        // requires for /v7/finance/quote from datacenter IPs. Raw fetch against
        // that endpoint silently returns 401/empty from Coolify droplet.
        const res = await yahooFinance.quote(batch);
        const arr = (Array.isArray(res) ? res : [res]) as unknown as QuoteLike[];
        quotes = arr.filter((q) => !!q && typeof q.symbol === 'string');
      } catch (err) {
        logger.warn(
          `[Yahoo] quote batch failed (${batch.length} symbols):`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      for (const item of quotes) {
        if (item.regularMarketPrice === undefined) continue;
        const currency = item.currency?.toUpperCase() ?? 'USD';
        const nativePrice = item.regularMarketPrice;
        const priceUsd = this.toUsd(nativePrice, currency, usdSgd);
        if (priceUsd === null) {
          logger.warn(`[Yahoo] Skipping ${item.symbol}: unsupported currency ${currency}`);
          continue;
        }
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

  async searchByIsin(isin: string): Promise<ProviderSearchResult | null> {
    const trimmed = isin.trim();
    if (!trimmed) return null;
    const cacheKey = `isin:${trimmed.toUpperCase()}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached && cached.length > 0) return cached[0];

    let quotes: YahooSearchItem[];
    try {
      const res = await yahooFinance.search(trimmed, { quotesCount: 5, newsCount: 0 });
      quotes = (res.quotes ?? []) as YahooSearchItem[];
    } catch (err) {
      logger.warn('[Yahoo] searchByIsin error:', err instanceof Error ? err.message : err);
      return null;
    }
    if (quotes.length === 0) return null;

    const preferredTypes = new Set(['MUTUALFUND', 'ETF', 'EQUITY']);
    const best = quotes.find(
      (q) =>
        q.quoteType &&
        preferredTypes.has(q.quoteType) &&
        this.isSupportedCurrency(this.inferCurrencyFromSymbol(q.symbol))
    );
    if (!best) return null;

    const result: ProviderSearchResult = {
      providerAssetId: best.symbol,
      symbol: best.symbol,
      name: best.longname || best.shortname || best.symbol,
      exchange: best.exchDisp || best.exchange || null,
      nativeCurrency: this.inferCurrencyFromSymbol(best.symbol),
      rank: null,
    };
    this.searchCache.set(cacheKey, [result]);
    return result;
  }

  async search(query: string): Promise<ProviderSearchResult[]> {
    const cacheKey = query.toLowerCase();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;

    // Yahoo rate-limits /v1/finance/search aggressively from datacenter IPs.
    // Try yahoo-finance2 (handles crumb+cookie) first, then fall back to
    // /v7/finance/lookup which has different rate limits.
    let quotes: YahooSearchItem[] = [];
    try {
      const res = await yahooFinance.search(query, { quotesCount: 15, newsCount: 0 });
      quotes = (res.quotes ?? []) as YahooSearchItem[];
      logger.info(`[Yahoo] search via lib for "${query}": ${quotes.length} quotes`);
    } catch (err) {
      logger.warn('[Yahoo] search lib error:', err instanceof Error ? err.message : err);
    }

    if (quotes.length === 0) {
      quotes = await this.searchViaLookup(query);
      logger.info(`[Yahoo] search via lookup for "${query}": ${quotes.length} quotes`);
    }

    const allowedTypes = new Set(['EQUITY']);
    const results: ProviderSearchResult[] = quotes
      .filter((q) => {
        if (!q.quoteType || !allowedTypes.has(q.quoteType)) return false;
        return this.isSupportedCurrency(this.inferCurrencyFromSymbol(q.symbol));
      })
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

  private async searchViaLookup(query: string): Promise<YahooSearchItem[]> {
    // /v7/finance/lookup is the older endpoint — same host as /v7/quote
    // which we know works from the droplet. Returns paginated lookup results
    // including symbol, shortName, longName, quoteType, exchange.
    const url = `https://query2.finance.yahoo.com/v1/finance/lookup?query=${encodeURIComponent(
      query
    )}&type=equity&count=15&lang=en-US&region=US`;
    type LookupResponse = {
      finance?: {
        result?: Array<{
          documents?: Array<{
            symbol: string;
            shortName?: string;
            longName?: string;
            quoteType?: string;
            exchange?: string;
            exchangeDisplay?: string;
          }>;
        }>;
      };
    };
    const data = await this.fetchJson<LookupResponse>(url);
    const docs = data?.finance?.result?.[0]?.documents ?? [];
    return docs.map((d) => ({
      symbol: d.symbol,
      shortname: d.shortName,
      longname: d.longName,
      quoteType: d.quoteType?.toUpperCase(),
      exchange: d.exchange,
      exchDisp: d.exchangeDisplay,
    }));
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
    if (!this.isSupportedCurrency(currency)) {
      logger.warn(`[Yahoo] No USD conversion support for ${providerAssetId} currency ${currency}`);
      return [];
    }
    const closes = result.indicators.quote[0].close;
    const timestamps = result.timestamp;

    const points: ProviderHistoricalPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const nativePrice = closes[i];
      if (nativePrice === null || nativePrice === undefined) continue;
      const priceUsd = this.toUsd(nativePrice, currency, usdSgd);
      if (priceUsd === null) continue;
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
