import YahooFinance from 'yahoo-finance2';
import { prisma } from '../../lib/prisma.js';
import { TTLCache } from '../../lib/TTLCache.js';
import { logger } from '../../lib/logger.js';
import { USD_SGD_FALLBACK_RATE } from '../../lib/constants.js';
import type {
  AssetPriceProvider,
  ProviderHistoricalPoint,
  ProviderNewsItem,
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
const NEWS_CACHE_DURATION_MS = 15 * 60 * 1000;
const NEWS_CACHE_MAX_ENTRIES = 300;
const BATCH_SIZE = 50;
const REQUEST_TIMEOUT_MS = 8000;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_REGIONS = ['US', 'JP', 'TW', 'KR', 'NO'] as const;
const SUPPORTED_NATIVE_CURRENCIES = new Set(['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK']);
const USD_FX_SYMBOLS: Record<string, string> = {
  SGD: 'SGD=X',
  JPY: 'JPY=X',
  TWD: 'TWD=X',
  KRW: 'KRW=X',
  NOK: 'NOK=X',
};
const ASIA_DIRECT_QUOTE_SUFFIXES = ['.T', '.TW', '.TWO', '.KS', '.KQ'];
const NAME_DIRECT_QUOTE_CANDIDATES: Record<string, string[]> = {
  kioxia: ['285A.T'],
};

// Lower rank = higher in results. Exact match first, then primary listings
// (no exchange suffix), then cross-listings like EWY.SN or AAPL.BA.
function rankSymbol(query: string, symbol: string): number {
  const upper = symbol.toUpperCase();
  if (upper === query) return 0;
  const hasSuffix = upper.includes('.');
  if (!hasSuffix) return 1;
  if (upper.startsWith(`${query}.`)) return 2;
  return 3;
}

function exchangeRank(symbol: string, exchange?: string | null): number {
  const upperSymbol = symbol.toUpperCase();
  const upperExchange = (exchange ?? '').toUpperCase();

  if (
    upperSymbol.endsWith('.T') ||
    upperSymbol.endsWith('.TW') ||
    upperSymbol.endsWith('.TWO') ||
    upperSymbol.endsWith('.KS') ||
    upperSymbol.endsWith('.KQ') ||
    upperSymbol.endsWith('.SI') ||
    upperSymbol.endsWith('.OL') ||
    upperExchange.includes('TOKYO') ||
    upperExchange.includes('TAIWAN') ||
    upperExchange.includes('KOREA') ||
    upperExchange.includes('KOSDAQ') ||
    upperExchange.includes('SINGAPORE') ||
    upperExchange.includes('OSLO') ||
    upperExchange.includes('NASDAQ') ||
    upperExchange.includes('NYSE')
  ) {
    return 0;
  }

  if (upperExchange.includes('OTC')) return 50;
  if (
    upperSymbol.endsWith('.F') ||
    upperSymbol.endsWith('.SG') ||
    upperSymbol.endsWith('.MU') ||
    upperSymbol.endsWith('.HM') ||
    upperExchange.includes('FRANKFURT') ||
    upperExchange.includes('STUTTGART') ||
    upperExchange.includes('MUNICH') ||
    upperExchange.includes('HAMBURG')
  ) {
    return 40;
  }

  return 20;
}

function rankSearchResult(query: string, result: ProviderSearchResult): number {
  return rankSymbol(query, result.symbol) * 10 + exchangeRank(result.symbol, result.exchange);
}

type YahooSearchItem = {
  symbol: string;
  shortname?: string;
  longname?: string;
  quoteType?: string;
  exchange?: string;
  exchDisp?: string;
};

type RawYahooChartResponse = {
  chart: {
    result?: Array<{
      meta: { currency?: string; regularMarketPrice?: number };
      timestamp?: number[];
      indicators: { quote: Array<{ close: (number | null)[] }> };
    }>;
    error: unknown;
  };
};

type YahooFinanceChartResult = {
  meta?: { currency?: string };
  quotes?: Array<{
    date: Date | string | number;
    close: number | null;
    adjclose?: number | null;
  }>;
};

type YahooSearchNewsItem = {
  uuid?: string;
  title?: string;
  publisher?: string;
  link?: string;
  providerPublishTime?: Date | string | number;
};

// yahoo-finance2 parses providerPublishTime into a Date, but the raw API
// returns unix seconds — accept both so a lib change can't corrupt timestamps.
function newsTimestampToIso(value: Date | string | number | undefined): string | null {
  if (value === undefined || value === null) return null;
  const date =
    value instanceof Date
      ? value
      : typeof value === 'number'
        ? new Date(value > 1e12 ? value : value * 1000)
        : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type YahooQuoteLike = {
  symbol?: string;
  quoteType?: string;
  regularMarketPrice?: number;
  currency?: string;
  longName?: string;
  shortName?: string;
  fullExchangeName?: string;
  exchange?: string;
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
  private readonly usdFxCache = new TTLCache<string, number>(PRICE_CACHE_DURATION_MS, 20);
  private readonly newsCache = new TTLCache<string, ProviderNewsItem[]>(
    NEWS_CACHE_DURATION_MS,
    NEWS_CACHE_MAX_ENTRIES
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

  private async getStoredUsdRateToCurrency(currency: string): Promise<number | null> {
    if (currency === 'USD') return 1;
    const row = await prisma.fxRate.findUnique({
      where: { fromCcy_toCcy: { fromCcy: 'USD', toCcy: currency } },
    });
    if (row?.rate) return row.rate;
    return currency === 'SGD' ? USD_SGD_FALLBACK_RATE : null;
  }

  private async getYahooUsdRateToCurrency(currency: string): Promise<number | null> {
    const symbol = USD_FX_SYMBOLS[currency];
    if (!symbol) return null;

    try {
      const q = (await yahooFinance.quote(symbol)) as YahooQuoteLike | null;
      const rate = q?.regularMarketPrice;
      if (rate && rate > 0) return rate;
    } catch (err) {
      logger.warn(
        `[Yahoo] FX quote lookup for USD/${currency} failed:`,
        err instanceof Error ? err.message : err
      );
    }

    return null;
  }

  async getUsdExchangeRates(currencies: string[]): Promise<Map<string, number>> {
    const rates = new Map<string, number>();

    for (const rawCurrency of currencies) {
      const currency = rawCurrency.toUpperCase();
      if (currency === 'USD') {
        rates.set(currency, 1);
        continue;
      }
      if (!this.isSupportedCurrency(currency)) continue;

      const cached = this.usdFxCache.get(currency);
      if (cached !== undefined) {
        rates.set(currency, cached);
        continue;
      }

      const stored = await this.getStoredUsdRateToCurrency(currency);
      const rate = stored ?? (await this.getYahooUsdRateToCurrency(currency));
      if (rate !== null) {
        rates.set(currency, rate);
        this.usdFxCache.set(currency, rate);
      }
    }

    return rates;
  }

  private toUsd(
    nativePrice: number,
    currency: string,
    usdRates: Map<string, number>
  ): number | null {
    const ccy = currency.toUpperCase();
    if (ccy === 'USD') return nativePrice;
    const usdToNative = usdRates.get(ccy);
    return usdToNative && usdToNative > 0 ? nativePrice / usdToNative : null;
  }

  private isSupportedCurrency(currency: string | null | undefined): boolean {
    return !!currency && SUPPORTED_NATIVE_CURRENCIES.has(currency.toUpperCase());
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

    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE);
      let quotes: YahooQuoteLike[] = [];
      try {
        // yahoo-finance2 handles the crumb+cookie consent flow that Yahoo now
        // requires for /v7/finance/quote from datacenter IPs. Raw fetch against
        // that endpoint silently returns 401/empty from Coolify droplet.
        const res = await yahooFinance.quote(batch);
        const arr = (Array.isArray(res) ? res : [res]) as unknown as YahooQuoteLike[];
        quotes = arr.filter((q) => !!q && typeof q.symbol === 'string');
      } catch (err) {
        logger.warn(
          `[Yahoo] quote batch failed (${batch.length} symbols):`,
          err instanceof Error ? err.message : err
        );
        continue;
      }

      const usdRates = await this.getUsdExchangeRates(
        Array.from(new Set(quotes.map((item) => item.currency?.toUpperCase() ?? 'USD')))
      );

      for (const item of quotes) {
        const symbol = item.symbol;
        if (!symbol || item.regularMarketPrice === undefined) continue;
        const currency = item.currency?.toUpperCase() ?? 'USD';
        const nativePrice = item.regularMarketPrice;
        const priceUsd = this.toUsd(nativePrice, currency, usdRates);
        if (priceUsd === null) {
          logger.warn(`[Yahoo] Skipping ${symbol}: unsupported currency ${currency}`);
          continue;
        }
        const fxRateToUsd = currency === 'USD' ? 1 : priceUsd / nativePrice;
        const entry: ProviderPrice = {
          priceUsd,
          nativePrice,
          nativeCurrency: currency,
          fxRateToUsd,
        };
        prices.set(symbol, entry);
        this.priceCache.set(symbol, entry);
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
      const res = await yahooFinance.search(trimmed, {
        quotesCount: 5,
        newsCount: 0,
        lang: 'en-US',
        region: 'US',
      });
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
    // Force region=US/lang=en-US: our DO droplet is in Singapore and Yahoo
    // otherwise geolocates and returns region-weighted results (e.g. EWY
    // search returns only Santiago cross-listings, not the primary NYSE ETF).
    let quotes: YahooSearchItem[] = [];
    const regionsToSearch = query.trim().length >= 2 ? SEARCH_REGIONS : ['US'];
    for (const region of regionsToSearch) {
      try {
        const res = await yahooFinance.search(query, {
          quotesCount: 20,
          newsCount: 0,
          lang: 'en-US',
          region,
        });
        quotes = this.mergeQuotes(quotes, (res.quotes ?? []) as YahooSearchItem[]);
      } catch (err) {
        logger.warn(
          `[Yahoo] search lib error (${region}):`,
          err instanceof Error ? err.message : err
        );
      }
    }
    logger.info(
      `[Yahoo] search via lib for "${query}": ${quotes.length} quotes (types: ${quotes.map((q) => q.quoteType).join(',')})`
    );

    const allowedTypes = new Set(['EQUITY', 'ETF', 'INDEX']);
    const upperQuery = query.toUpperCase();
    const toResults = (items: YahooSearchItem[]): ProviderSearchResult[] =>
      items
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

    let results = toResults(quotes);

    // Fall back to the lookup endpoint when nothing survives type/currency
    // filtering — not just when the regions returned zero raw quotes. A region
    // returning only mutual funds or currencies would otherwise leave `quotes`
    // non-empty and suppress the fallback, yielding no result for a valid ticker.
    if (results.length === 0) {
      const lookupQuotes = await this.searchViaLookup(query);
      logger.info(`[Yahoo] search via lookup for "${query}": ${lookupQuotes.length} quotes`);
      results = toResults(lookupQuotes);
    }

    // Rank primary listings above cross-listings. Yahoo often returns
    // exchange-suffixed variants (e.g. EWY.SN on Santiago) before the canonical
    // NYSE ticker, so searches for "EWY" lose the ETF the user actually wants.
    // Heuristic: exact symbol match > no-suffix > has-suffix.
    results.sort((a, b) => rankSearchResult(upperQuery, a) - rankSearchResult(upperQuery, b));

    // Direct ticker lookups (base symbol + Asian suffixes) for anything the
    // region fan-out didn't already surface. Run concurrently rather than
    // serially so a numeric query doesn't fan out into many sequential round-trips.
    const directSymbols = this.directQuoteSymbolsForQuery(query).filter(
      (symbol) => !results.some((r) => r.symbol.toUpperCase() === symbol.toUpperCase())
    );
    const directMatches = await Promise.all(
      directSymbols.map((symbol) => this.quoteAsSearchResult(symbol))
    );
    for (const directMatch of directMatches) {
      if (directMatch) results.push(directMatch);
    }

    const sortedResults = results.sort(
      (a, b) => rankSearchResult(upperQuery, a) - rankSearchResult(upperQuery, b)
    );

    this.searchCache.set(cacheKey, sortedResults);
    return sortedResults;
  }

  async getNews(query: string, count: number): Promise<ProviderNewsItem[]> {
    const cacheKey = `${query.toLowerCase()}:${count}`;
    const cached = this.newsCache.get(cacheKey);
    if (cached) return cached;

    try {
      const res = await yahooFinance.search(query, {
        quotesCount: 0,
        newsCount: count,
        lang: 'en-US',
        region: 'US',
      });
      const rawItems = (res.news ?? []) as YahooSearchNewsItem[];
      const items: ProviderNewsItem[] = [];
      for (const raw of rawItems) {
        if (!raw.title || !raw.link) continue;
        items.push({
          id: raw.uuid || raw.link,
          title: raw.title,
          publisher: raw.publisher || 'Yahoo Finance',
          url: raw.link,
          publishedAt: newsTimestampToIso(raw.providerPublishTime),
        });
      }
      // Empty-but-successful responses are cached; failures are not, so a
      // transient Yahoo outage doesn't pin an empty feed for the full TTL.
      this.newsCache.set(cacheKey, items);
      return items;
    } catch (err) {
      logger.warn(
        `[Yahoo] news search failed for "${query}":`,
        err instanceof Error ? err.message : err
      );
      throw err;
    }
  }

  private async quoteAsSearchResult(symbol: string): Promise<ProviderSearchResult | null> {
    try {
      const q = (await yahooFinance.quote(symbol)) as YahooQuoteLike | null;
      if (!q || !q.symbol || !q.quoteType) return null;
      const type = q.quoteType.toUpperCase();
      if (type !== 'EQUITY' && type !== 'ETF' && type !== 'INDEX') return null;
      const currency = (q.currency ?? this.inferCurrencyFromSymbol(q.symbol)).toUpperCase();
      if (!this.isSupportedCurrency(currency)) return null;
      return {
        providerAssetId: q.symbol,
        symbol: q.symbol,
        name: q.longName || q.shortName || q.symbol,
        exchange: q.fullExchangeName || q.exchange || null,
        nativeCurrency: currency,
        rank: null,
      };
    } catch (err) {
      logger.warn(
        `[Yahoo] direct quote lookup for "${symbol}" failed:`,
        err instanceof Error ? err.message : err
      );
      return null;
    }
  }

  private mergeQuotes(base: YahooSearchItem[], next: YahooSearchItem[]): YahooSearchItem[] {
    const bySymbol = new Map(base.map((quote) => [quote.symbol.toUpperCase(), quote]));
    for (const quote of next) {
      if (!quote.symbol) continue;
      const key = quote.symbol.toUpperCase();
      if (!bySymbol.has(key)) bySymbol.set(key, quote);
    }
    return Array.from(bySymbol.values());
  }

  private directQuoteSymbolsForQuery(query: string): string[] {
    const trimmed = query.trim();
    const upperQuery = trimmed.toUpperCase();
    const symbols: string[] = [];

    if (/^[A-Z0-9.\-]{1,10}$/.test(upperQuery)) {
      symbols.push(upperQuery);
      if (!upperQuery.includes('.') && /\d/.test(upperQuery)) {
        symbols.push(...ASIA_DIRECT_QUOTE_SUFFIXES.map((suffix) => `${upperQuery}${suffix}`));
      }
      if (!upperQuery.includes('.') && /^[A-Z]{1,5}$/.test(upperQuery)) {
        symbols.push(`${upperQuery}.OL`);
      }
    }

    const lowerQuery = trimmed.toLowerCase();
    for (const [name, candidates] of Object.entries(NAME_DIRECT_QUOTE_CANDIDATES)) {
      if (lowerQuery.includes(name)) symbols.push(...candidates);
    }

    return Array.from(new Set(symbols));
  }

  private async searchViaLookup(query: string): Promise<YahooSearchItem[]> {
    // /v7/finance/lookup is the older endpoint — same host as /v7/quote
    // which we know works from the droplet. Returns paginated lookup results
    // including symbol, shortName, longName, quoteType, exchange.
    // type=all returns EQUITY + ETF + MUTUALFUND + more; we filter to EQUITY/ETF
    // in search() via allowedTypes. Using equity alone drops NYSE-listed ETFs.
    const url = `https://query2.finance.yahoo.com/v1/finance/lookup?query=${encodeURIComponent(
      query
    )}&type=all&count=15&lang=en-US&region=US`;
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
    if (symbol.endsWith('.T')) return 'JPY';
    if (symbol.endsWith('.TW') || symbol.endsWith('.TWO')) return 'TWD';
    if (symbol.endsWith('.KS') || symbol.endsWith('.KQ')) return 'KRW';
    if (symbol.endsWith('.OL')) return 'NOK';
    if (symbol.endsWith('.HK')) return 'HKD';
    if (symbol.endsWith('.L')) return 'GBP';
    if (symbol.endsWith('.TO')) return 'CAD';
    return 'USD';
  }

  async getHistoricalPrices(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const cacheKey = `${providerAssetId}-${days}`;
    const cached = this.historicalCache.get(cacheKey);
    if (cached) return cached;

    const libPoints = await this.getHistoricalPricesViaLibrary(providerAssetId, days);
    if (libPoints.length > 0) {
      this.historicalCache.set(cacheKey, libPoints);
      return libPoints;
    }

    const rawPoints = await this.getHistoricalPricesViaRawChart(providerAssetId, days);
    this.historicalCache.set(cacheKey, rawPoints);
    return rawPoints;
  }

  private async getHistoricalPricesViaLibrary(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const period2 = new Date();
    const period1 = new Date(period2.getTime() - Math.max(days, 1) * DAY_MS);

    try {
      const result = (await yahooFinance.chart(providerAssetId, {
        period1,
        period2,
        interval: '1d',
        includePrePost: false,
        return: 'array',
      })) as YahooFinanceChartResult;

      const currency = result.meta?.currency?.toUpperCase() ?? 'USD';
      const usdRates = await this.getUsdExchangeRates([currency]);
      return this.chartQuotesToHistoricalPoints(
        providerAssetId,
        result.quotes ?? [],
        currency,
        usdRates
      );
    } catch (err) {
      logger.warn(
        `[Yahoo] chart() history failed for ${providerAssetId}:`,
        err instanceof Error ? err.message : err
      );
      return [];
    }
  }

  private async getHistoricalPricesViaRawChart(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const range = this.daysToRange(days);
    const url = `${YAHOO_CHART_URL}/${encodeURIComponent(providerAssetId)}?range=${range}&interval=1d&includePrePost=false`;
    const data = await this.fetchJson<RawYahooChartResponse>(url);
    const result = data?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      logger.warn(`[Yahoo] No chart data for ${providerAssetId}`);
      return [];
    }

    const currency = result.meta.currency?.toUpperCase() ?? 'USD';
    if (!this.isSupportedCurrency(currency)) {
      logger.warn(`[Yahoo] No USD conversion support for ${providerAssetId} currency ${currency}`);
      return [];
    }
    const usdRates = await this.getUsdExchangeRates([currency]);
    const closes = result.indicators.quote[0].close;
    const timestamps = result.timestamp;

    const points: ProviderHistoricalPoint[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const nativePrice = closes[i];
      if (nativePrice === null || nativePrice === undefined) continue;
      const priceUsd = this.toUsd(nativePrice, currency, usdRates);
      if (priceUsd === null) continue;
      points.push({ timestamp: timestamps[i] * 1000, priceUsd, nativePrice });
    }

    return points;
  }

  private chartQuotesToHistoricalPoints(
    providerAssetId: string,
    quotes: NonNullable<YahooFinanceChartResult['quotes']>,
    currency: string,
    usdRates: Map<string, number>
  ): ProviderHistoricalPoint[] {
    if (!this.isSupportedCurrency(currency)) {
      logger.warn(`[Yahoo] No USD conversion support for ${providerAssetId} currency ${currency}`);
      return [];
    }

    const points: ProviderHistoricalPoint[] = [];
    for (const quote of quotes) {
      const nativePrice = quote.close ?? quote.adjclose;
      if (nativePrice === null || nativePrice === undefined) continue;

      const date = quote.date instanceof Date ? quote.date : new Date(quote.date);
      const timestamp = date.getTime();
      if (Number.isNaN(timestamp)) continue;

      const priceUsd = this.toUsd(nativePrice, currency, usdRates);
      if (priceUsd === null) continue;
      points.push({ timestamp, priceUsd, nativePrice });
    }

    return points.sort((a, b) => a.timestamp - b.timestamp);
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
    this.usdFxCache.clear();
    this.newsCache.clear();
  }
}
