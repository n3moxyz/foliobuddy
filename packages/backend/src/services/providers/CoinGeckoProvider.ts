import { TTLCache } from '../../lib/TTLCache.js';
import { logger } from '../../lib/logger.js';
import type {
  AssetPriceProvider,
  ProviderHistoricalPoint,
  ProviderPrice,
  ProviderSearchResult,
} from './types.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_DELAY = 2100;
const BATCH_SIZE = 50;
const PRICE_CACHE_DURATION_MS = 30_000;
const PRICE_CACHE_MAX_ENTRIES = 500;
const COIN_LIST_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const HISTORICAL_CACHE_DURATION_MS = 5 * 60 * 1000;
const HISTORICAL_CACHE_MAX_ENTRIES = 50;
const COIN_LIST_KEY = 'coin-list';

type CoinGeckoPriceResponse = Record<string, { usd: number; usd_24h_change?: number }>;
type CoinListItem = { id: string; symbol: string; name: string };
type CoinGeckoExchangeRates = {
  rates: Record<string, { name: string; unit: string; value: number; type: string }>;
};
type CoinGeckoMarketChartResponse = { prices: [number, number][] };
export type ExchangeRates = {
  usdSgd: number;
  usdJpy?: number;
  usdTwd?: number;
  usdKrw?: number;
};

export class CoinGeckoProvider implements AssetPriceProvider {
  readonly name = 'coingecko' as const;
  readonly refreshIntervalMinutes = 1;

  private readonly priceCache = new TTLCache<string, number>(
    PRICE_CACHE_DURATION_MS,
    PRICE_CACHE_MAX_ENTRIES
  );
  private readonly coinListCache = new TTLCache<string, CoinListItem[]>(
    COIN_LIST_CACHE_DURATION_MS
  );
  private readonly historicalCache = new TTLCache<string, ProviderHistoricalPoint[]>(
    HISTORICAL_CACHE_DURATION_MS,
    HISTORICAL_CACHE_MAX_ENTRIES
  );
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private staleCoinList: CoinListItem[] = [];
  private staleHistoricalData = new Map<string, ProviderHistoricalPoint[]>();

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.COINGECKO_API_KEY) {
      headers['x-cg-demo-api-key'] = process.env.COINGECKO_API_KEY;
    }
    return headers;
  }

  private async rateLimitedFetch<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const executeRequest = async () => {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < RATE_LIMIT_DELAY) {
          await this.sleep(RATE_LIMIT_DELAY - timeSinceLastRequest);
        }
        try {
          this.lastRequestTime = Date.now();
          const response = await fetch(url, { headers: this.getHeaders() });
          if (!response.ok) {
            if (response.status === 429) {
              logger.warn('Rate limited by CoinGecko, waiting...');
              await this.sleep(60_000);
              return executeRequest();
            }
            throw new Error(`CoinGecko API error: ${response.status} ${response.statusText}`);
          }
          const data = await response.json();
          resolve(data as T);
        } catch (error) {
          reject(error);
        }
      };
      this.requestQueue.push(executeRequest);
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue.shift();
      if (request) await request();
    }
    this.isProcessingQueue = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getPrices(providerAssetIds: string[]): Promise<Map<string, ProviderPrice>> {
    const prices = new Map<string, ProviderPrice>();
    const idsToFetch: string[] = [];
    for (const id of providerAssetIds) {
      const cached = this.priceCache.get(id);
      if (cached !== undefined) {
        prices.set(id, { priceUsd: cached });
      } else {
        idsToFetch.push(id);
      }
    }
    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE);
      const batchPrices = await this.fetchBatchPrices(batch);
      for (const [id, price] of batchPrices) {
        prices.set(id, { priceUsd: price });
        this.priceCache.set(id, price);
      }
    }
    return prices;
  }

  private async fetchBatchPrices(ids: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    if (ids.length === 0) return prices;
    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${ids.join(',')}&vs_currencies=usd&include_24hr_change=true`;
    try {
      const data = await this.rateLimitedFetch<CoinGeckoPriceResponse>(url);
      for (const [id, priceData] of Object.entries(data)) {
        if (priceData.usd !== undefined) prices.set(id, priceData.usd);
      }
    } catch (error) {
      logger.error('Error fetching prices:', error);
    }
    return prices;
  }

  async getDirectPrice(providerAssetId: string): Promise<number | null> {
    const cached = this.priceCache.get(providerAssetId);
    if (cached !== undefined) return cached;
    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${providerAssetId}&vs_currencies=usd`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, { headers: this.getHeaders(), signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = (await response.json()) as CoinGeckoPriceResponse;
      const price = data[providerAssetId]?.usd ?? null;
      if (price !== null) this.priceCache.set(providerAssetId, price);
      return price;
    } catch {
      return null;
    }
  }

  private async getCoinList(): Promise<CoinListItem[]> {
    const cached = this.coinListCache.get(COIN_LIST_KEY);
    if (cached) return cached;
    const url = `${COINGECKO_BASE_URL}/coins/list`;
    try {
      logger.info('[CoinGecko] Fetching full coin list...');
      const response = await fetch(url, { headers: this.getHeaders() });
      if (!response.ok) {
        if (response.status === 429) {
          logger.warn('Coin list rate limited by CoinGecko');
          return this.staleCoinList;
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }
      const data: CoinListItem[] = await response.json();
      this.staleCoinList = data;
      this.coinListCache.set(COIN_LIST_KEY, data);
      logger.info(`[CoinGecko] Cached ${data.length} coins`);
      return data;
    } catch (error) {
      logger.error('Error fetching coin list:', error);
      return this.staleCoinList;
    }
  }

  async search(query: string): Promise<ProviderSearchResult[]> {
    const coins = await this.getCoinList();
    const lowerQuery = query.toLowerCase();
    const matches = coins.filter(
      (coin) =>
        coin.symbol.toLowerCase().includes(lowerQuery) ||
        coin.name.toLowerCase().includes(lowerQuery)
    );
    matches.sort((a, b) => {
      const aSymbolExact = a.symbol.toLowerCase() === lowerQuery;
      const bSymbolExact = b.symbol.toLowerCase() === lowerQuery;
      if (aSymbolExact && !bSymbolExact) return -1;
      if (bSymbolExact && !aSymbolExact) return 1;
      const aSymbolMatch = a.symbol.toLowerCase().includes(lowerQuery);
      const bSymbolMatch = b.symbol.toLowerCase().includes(lowerQuery);
      if (aSymbolMatch && !bSymbolMatch) return -1;
      if (bSymbolMatch && !aSymbolMatch) return 1;
      return a.name.length - b.name.length;
    });
    return matches.slice(0, 20).map((coin) => ({
      providerAssetId: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      nativeCurrency: 'USD',
      rank: null,
    }));
  }

  async getExchangeRates(): Promise<ExchangeRates | null> {
    const url = `${COINGECKO_BASE_URL}/exchange_rates`;
    try {
      const data = await this.rateLimitedFetch<CoinGeckoExchangeRates>(url);
      const btcUsd = data.rates.usd?.value;
      if (!btcUsd) return null;

      const usdTo = (currency: string) => {
        const btcCurrency = data.rates[currency]?.value;
        return btcCurrency ? btcCurrency / btcUsd : undefined;
      };

      const usdSgd = usdTo('sgd');
      if (!usdSgd) return null;

      return {
        usdSgd,
        usdJpy: usdTo('jpy'),
        usdTwd: usdTo('twd'),
        usdKrw: usdTo('krw'),
      };
    } catch (error) {
      logger.error('Error fetching exchange rates:', error);
      return null;
    }
  }

  async getHistoricalPrices(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const cacheKey = `${providerAssetId}-${days}`;
    const cached = this.historicalCache.get(cacheKey);
    if (cached) return cached;
    const url = `${COINGECKO_BASE_URL}/coins/${providerAssetId}/market_chart?vs_currency=usd&days=${days}`;
    try {
      const response = await this.rateLimitedFetch<CoinGeckoMarketChartResponse>(url);
      const data: ProviderHistoricalPoint[] = response.prices.map(([timestamp, priceUsd]) => ({
        timestamp,
        priceUsd,
      }));
      this.historicalCache.set(cacheKey, data);
      this.setStaleHistoricalData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Error fetching historical prices for ${providerAssetId}:`, error);
      const staleData = this.staleHistoricalData.get(cacheKey);
      if (staleData) return staleData;
      throw error;
    }
  }

  clearCache(): void {
    this.priceCache.clear();
    this.historicalCache.clear();
    this.staleHistoricalData.clear();
  }

  private setStaleHistoricalData(cacheKey: string, data: ProviderHistoricalPoint[]): void {
    if (this.staleHistoricalData.has(cacheKey)) this.staleHistoricalData.delete(cacheKey);
    this.staleHistoricalData.set(cacheKey, data);
    while (this.staleHistoricalData.size > HISTORICAL_CACHE_MAX_ENTRIES) {
      const oldestKey = this.staleHistoricalData.keys().next().value;
      if (!oldestKey) break;
      this.staleHistoricalData.delete(oldestKey);
    }
  }
}
