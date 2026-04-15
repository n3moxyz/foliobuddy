import { prisma } from '../lib/prisma.js';
import { TTLCache } from '../lib/TTLCache.js';
import { logger } from '../lib/logger.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_DELAY = 2100;
const BATCH_SIZE = 50;
const PRICE_CACHE_DURATION_MS = 30000;
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
type HistoricalPricePoint = { timestamp: number; price: number };

class PriceService {
  private readonly priceCache = new TTLCache<string, number>(
    PRICE_CACHE_DURATION_MS,
    PRICE_CACHE_MAX_ENTRIES
  );
  private readonly coinListCache = new TTLCache<string, CoinListItem[]>(
    COIN_LIST_CACHE_DURATION_MS
  );
  private readonly historicalCache = new TTLCache<string, HistoricalPricePoint[]>(
    HISTORICAL_CACHE_DURATION_MS,
    HISTORICAL_CACHE_MAX_ENTRIES
  );
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;
  private staleCoinList: CoinListItem[] = [];
  private staleHistoricalData = new Map<string, HistoricalPricePoint[]>();

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
              await this.sleep(60000);
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
      if (request) {
        await request();
      }
    }
    this.isProcessingQueue = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async getPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const idsToFetch: string[] = [];
    for (const id of coingeckoIds) {
      const cachedPrice = this.priceCache.get(id);
      if (cachedPrice !== undefined) {
        prices.set(id, cachedPrice);
      } else {
        idsToFetch.push(id);
      }
    }
    for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
      const batch = idsToFetch.slice(i, i + BATCH_SIZE);
      const batchPrices = await this.fetchBatchPrices(batch);
      for (const [id, price] of batchPrices) {
        prices.set(id, price);
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
        if (priceData.usd !== undefined) {
          prices.set(id, priceData.usd);
        }
      }
    } catch (error) {
      logger.error('Error fetching prices:', error);
    }
    return prices;
  }

  async getPrice(coingeckoId: string): Promise<number | null> {
    const prices = await this.getPrices([coingeckoId]);
    return prices.get(coingeckoId) ?? null;
  }

  async getDirectPrice(coingeckoId: string): Promise<number | null> {
    const cachedPrice = this.priceCache.get(coingeckoId);
    if (cachedPrice !== undefined) return cachedPrice;
    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!response.ok) return null;
      const data = (await response.json()) as CoinGeckoPriceResponse;
      const price = data[coingeckoId]?.usd ?? null;
      if (price !== null) this.priceCache.set(coingeckoId, price);
      return price;
    } catch {
      return null;
    }
  }

  private async getCoinList(): Promise<CoinListItem[]> {
    const cachedCoinList = this.coinListCache.get(COIN_LIST_KEY);
    if (cachedCoinList) return cachedCoinList;
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

  async searchCoins(
    query: string
  ): Promise<Array<{ id: string; symbol: string; name: string; rank: number | null }>> {
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
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      rank: null,
    }));
  }

  async getExchangeRates(): Promise<{ usdSgd: number } | null> {
    const url = `${COINGECKO_BASE_URL}/exchange_rates`;
    try {
      const data = await this.rateLimitedFetch<CoinGeckoExchangeRates>(url);
      const btcUsd = data.rates.usd?.value;
      const btcSgd = data.rates.sgd?.value;
      if (btcUsd && btcSgd) return { usdSgd: btcSgd / btcUsd };
      return null;
    } catch (error) {
      logger.error('Error fetching exchange rates:', error);
      return null;
    }
  }

  async refreshAllPrices(): Promise<{
    updated: number;
    errors: number;
    changedAssetIds: string[];
  }> {
    const assets = await prisma.asset.findMany({
      where: {
        coingeckoId: { not: null },
      },
      select: {
        id: true,
        coingeckoId: true,
        currentPriceUsd: true,
      },
    });

    const coingeckoIds = assets.map((a) => a.coingeckoId).filter((id): id is string => id !== null);
    if (coingeckoIds.length === 0) {
      return { updated: 0, errors: 0, changedAssetIds: [] };
    }

    const prices = await this.getPrices(coingeckoIds);
    let updated = 0;
    let errors = 0;
    const changedAssetIds: string[] = [];

    for (const asset of assets) {
      if (!asset.coingeckoId) continue;
      const price = prices.get(asset.coingeckoId);
      if (price === undefined) {
        errors++;
        continue;
      }
      try {
        await prisma.asset.update({
          where: { id: asset.id },
          data: {
            currentPriceUsd: price,
            priceUpdatedAt: new Date(),
          },
        });
        await prisma.priceHistory.create({
          data: {
            assetId: asset.id,
            priceUsd: price,
          },
        });
        if (asset.currentPriceUsd !== price) changedAssetIds.push(asset.id);
        updated++;
      } catch (error) {
        logger.error(`Error updating price for ${asset.coingeckoId}:`, error);
        errors++;
      }
    }

    return { updated, errors, changedAssetIds };
  }

  async updatePositionValues(changedAssetIds?: string[]): Promise<void> {
    if (changedAssetIds && changedAssetIds.length === 0) return;
    const positions = await prisma.position.findMany({
      ...(changedAssetIds ? { where: { assetId: { in: changedAssetIds } } } : {}),
      include: {
        asset: true,
      },
    });
    for (const position of positions) {
      if (!position.asset.currentPriceUsd) continue;
      const marketValue = position.quantity * position.asset.currentPriceUsd;
      const costBasis = position.quantity * position.avgCostUsd;
      const unrealizedPnL = marketValue - costBasis;
      const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
      await prisma.position.update({
        where: { id: position.id },
        data: {
          marketValueUsd: marketValue,
          unrealizedPnL,
          unrealizedPnLPct,
        },
      });
    }
  }

  async getHistoricalPrices(coingeckoId: string, days: number): Promise<HistoricalPricePoint[]> {
    const cacheKey = `${coingeckoId}-${days}`;
    const cached = this.historicalCache.get(cacheKey);
    if (cached) return cached;
    const url = `${COINGECKO_BASE_URL}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`;
    try {
      const response = await this.rateLimitedFetch<CoinGeckoMarketChartResponse>(url);
      const data = response.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
      }));
      this.historicalCache.set(cacheKey, data);
      this.setStaleHistoricalData(cacheKey, data);
      return data;
    } catch (error) {
      logger.error(`Error fetching historical prices for ${coingeckoId}:`, error);
      const staleData = this.staleHistoricalData.get(cacheKey);
      if (staleData) {
        return staleData;
      }
      throw error;
    }
  }

  clearCache(): void {
    this.priceCache.clear();
    this.historicalCache.clear();
    this.staleHistoricalData.clear();
  }

  private setStaleHistoricalData(cacheKey: string, data: HistoricalPricePoint[]): void {
    if (this.staleHistoricalData.has(cacheKey)) {
      this.staleHistoricalData.delete(cacheKey);
    }
    this.staleHistoricalData.set(cacheKey, data);
    while (this.staleHistoricalData.size > HISTORICAL_CACHE_MAX_ENTRIES) {
      const oldestKey = this.staleHistoricalData.keys().next().value;
      if (!oldestKey) break;
      this.staleHistoricalData.delete(oldestKey);
    }
  }
}

export const priceService = new PriceService();
