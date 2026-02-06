import { prisma } from '../index.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_DELAY = 2100; // 2.1 seconds between calls (30 calls/min limit)
const BATCH_SIZE = 50; // Max coins per request
const CACHE_DURATION_MS = 30000; // 30 seconds cache
const MAX_CACHE_ENTRIES = 500; // Prevent unbounded memory growth
const HISTORICAL_CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes cache for historical data

interface PriceCacheEntry {
  price: number;
  timestamp: number;
}

interface PriceCache {
  [coingeckoId: string]: PriceCacheEntry;
}

interface CoinGeckoPriceResponse {
  [id: string]: {
    usd: number;
    usd_24h_change?: number;
  };
}

interface CoinGeckoSearchResult {
  coins: Array<{
    id: string;
    symbol: string;
    name: string;
    market_cap_rank: number | null;
  }>;
}

interface CoinListItem {
  id: string;
  symbol: string;
  name: string;
}

interface CoinGeckoExchangeRates {
  rates: {
    [currency: string]: {
      name: string;
      unit: string;
      value: number;
      type: string;
    };
  };
}

interface CoinGeckoMarketChartResponse {
  prices: [number, number][]; // [timestamp, price][]
}

interface HistoricalPricePoint {
  timestamp: number;
  price: number;
}

interface HistoricalPriceCacheEntry {
  data: HistoricalPricePoint[];
  fetchedAt: number;
}

class PriceService {
  private priceCache: PriceCache = {};
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

  // Cached coin list for fast local filtering
  private coinList: CoinListItem[] = [];
  private coinListLastFetch = 0;
  private coinListCacheDuration = 24 * 60 * 60 * 1000; // 24 hours

  // Historical price cache
  private historicalCache: Map<string, HistoricalPriceCacheEntry> = new Map();

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Accept': 'application/json',
    };

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
              // Rate limited - wait and retry
              console.warn('Rate limited by CoinGecko, waiting...');
              await this.sleep(60000); // Wait 1 minute
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
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isCacheValid(coingeckoId: string): boolean {
    const cached = this.priceCache[coingeckoId];
    if (!cached) return false;
    return Date.now() - cached.timestamp < CACHE_DURATION_MS;
  }

  /**
   * Evict expired entries and enforce max cache size (LRU-style)
   */
  private evictStaleEntries(): void {
    const now = Date.now();
    const entries = Object.entries(this.priceCache);

    // First, remove all expired entries
    for (const [id, entry] of entries) {
      if (now - entry.timestamp >= CACHE_DURATION_MS) {
        delete this.priceCache[id];
      }
    }

    // If still over limit, remove oldest entries
    const remainingEntries = Object.entries(this.priceCache);
    if (remainingEntries.length > MAX_CACHE_ENTRIES) {
      // Sort by timestamp (oldest first) and remove excess
      remainingEntries
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, remainingEntries.length - MAX_CACHE_ENTRIES)
        .forEach(([id]) => delete this.priceCache[id]);
    }
  }

  /**
   * Get current prices for multiple coins
   */
  async getPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();
    const idsToFetch: string[] = [];

    // Check cache first
    for (const id of coingeckoIds) {
      if (this.isCacheValid(id)) {
        prices.set(id, this.priceCache[id].price);
      } else {
        idsToFetch.push(id);
      }
    }

    // Fetch missing prices in batches
    if (idsToFetch.length > 0) {
      // Evict stale entries before adding new ones to prevent unbounded growth
      this.evictStaleEntries();

      for (let i = 0; i < idsToFetch.length; i += BATCH_SIZE) {
        const batch = idsToFetch.slice(i, i + BATCH_SIZE);
        const batchPrices = await this.fetchBatchPrices(batch);

        for (const [id, price] of batchPrices) {
          prices.set(id, price);
          this.priceCache[id] = { price, timestamp: Date.now() };
        }
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
      console.error('Error fetching prices:', error);
    }

    return prices;
  }

  /**
   * Get price for a single coin (uses rate-limited queue — for scheduler use)
   */
  async getPrice(coingeckoId: string): Promise<number | null> {
    const prices = await this.getPrices([coingeckoId]);
    return prices.get(coingeckoId) ?? null;
  }

  /**
   * Get price directly, bypassing the queue. Uses cache first, then a direct
   * fetch with a short timeout. Meant for user-initiated requests that
   * shouldn't wait behind the scheduler's batch.
   */
  async getDirectPrice(coingeckoId: string): Promise<number | null> {
    // Check cache first — instant if scheduler already fetched it
    if (this.isCacheValid(coingeckoId)) {
      return this.priceCache[coingeckoId].price;
    }

    const url = `${COINGECKO_BASE_URL}/simple/price?ids=${coingeckoId}&vs_currencies=usd`;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

      const response = await fetch(url, {
        headers: this.getHeaders(),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) return null;

      const data = await response.json() as CoinGeckoPriceResponse;
      const price = data[coingeckoId]?.usd ?? null;

      if (price !== null) {
        this.priceCache[coingeckoId] = { price, timestamp: Date.now() };
      }

      return price;
    } catch {
      return null; // Non-blocking — scheduler will fill it in within 60s
    }
  }

  /**
   * Get full coin list from CoinGecko (cached for 24 hours)
   */
  private async getCoinList(): Promise<CoinListItem[]> {
    const now = Date.now();

    // Return cached list if still valid
    if (this.coinList.length > 0 && (now - this.coinListLastFetch) < this.coinListCacheDuration) {
      return this.coinList;
    }

    const url = `${COINGECKO_BASE_URL}/coins/list`;

    try {
      console.log('[CoinGecko] Fetching full coin list...');
      const response = await fetch(url, { headers: this.getHeaders() });

      if (!response.ok) {
        if (response.status === 429) {
          console.warn('Coin list rate limited by CoinGecko');
          return this.coinList; // Return stale cache if available
        }
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data: CoinListItem[] = await response.json();
      this.coinList = data;
      this.coinListLastFetch = now;
      console.log(`[CoinGecko] Cached ${data.length} coins`);
      return data;
    } catch (error) {
      console.error('Error fetching coin list:', error);
      return this.coinList; // Return stale cache if available
    }
  }

  /**
   * Search for coins by name or symbol
   * Uses cached coin list for instant local filtering
   */
  async searchCoins(query: string): Promise<Array<{ id: string; symbol: string; name: string; rank: number | null }>> {
    const coins = await this.getCoinList();
    const lowerQuery = query.toLowerCase();

    // Filter locally - instant results
    const matches = coins.filter(coin =>
      coin.symbol.toLowerCase().includes(lowerQuery) ||
      coin.name.toLowerCase().includes(lowerQuery)
    );

    // Sort: exact symbol matches first, then by name length (shorter = more relevant)
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

    return matches.slice(0, 20).map(coin => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      rank: null, // Coin list doesn't include rank
    }));
  }

  /**
   * Get exchange rates (for USD/SGD conversion)
   */
  async getExchangeRates(): Promise<{ usdSgd: number } | null> {
    const url = `${COINGECKO_BASE_URL}/exchange_rates`;

    try {
      const data = await this.rateLimitedFetch<CoinGeckoExchangeRates>(url);

      // CoinGecko returns rates relative to BTC, so we need to calculate USD/SGD
      const btcUsd = data.rates.usd?.value;
      const btcSgd = data.rates.sgd?.value;

      if (btcUsd && btcSgd) {
        const usdSgd = btcSgd / btcUsd;
        return { usdSgd };
      }

      return null;
    } catch (error) {
      console.error('Error fetching exchange rates:', error);
      return null;
    }
  }

  /**
   * Update all asset prices in database
   */
  async refreshAllPrices(): Promise<{ updated: number; errors: number }> {
    const assets = await prisma.asset.findMany({
      where: {
        coingeckoId: { not: null },
      },
      select: {
        id: true,
        coingeckoId: true,
      },
    });

    const coingeckoIds = assets
      .map(a => a.coingeckoId)
      .filter((id): id is string => id !== null);

    if (coingeckoIds.length === 0) {
      return { updated: 0, errors: 0 };
    }

    const prices = await this.getPrices(coingeckoIds);
    let updated = 0;
    let errors = 0;

    for (const asset of assets) {
      if (!asset.coingeckoId) continue;

      const price = prices.get(asset.coingeckoId);

      if (price !== undefined) {
        try {
          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              currentPriceUsd: price,
              priceUpdatedAt: new Date(),
            },
          });

          // Store price history
          await prisma.priceHistory.create({
            data: {
              assetId: asset.id,
              priceUsd: price,
            },
          });

          updated++;
        } catch (error) {
          console.error(`Error updating price for ${asset.coingeckoId}:`, error);
          errors++;
        }
      } else {
        errors++;
      }
    }

    return { updated, errors };
  }

  /**
   * Update position market values based on current prices
   */
  async updatePositionValues(): Promise<void> {
    const positions = await prisma.position.findMany({
      include: {
        asset: true,
      },
    });

    for (const position of positions) {
      if (position.asset.currentPriceUsd) {
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
  }

  /**
   * Get historical prices for a coin from CoinGecko
   * Uses /coins/{id}/market_chart endpoint
   */
  async getHistoricalPrices(coingeckoId: string, days: number): Promise<HistoricalPricePoint[]> {
    const cacheKey = `${coingeckoId}-${days}`;
    const cached = this.historicalCache.get(cacheKey);

    // Return cached data if still valid
    if (cached && Date.now() - cached.fetchedAt < HISTORICAL_CACHE_DURATION_MS) {
      return cached.data;
    }

    const url = `${COINGECKO_BASE_URL}/coins/${coingeckoId}/market_chart?vs_currency=usd&days=${days}`;

    try {
      const response = await this.rateLimitedFetch<CoinGeckoMarketChartResponse>(url);

      const data: HistoricalPricePoint[] = response.prices.map(([timestamp, price]) => ({
        timestamp,
        price,
      }));

      // Cache the result
      this.historicalCache.set(cacheKey, {
        data,
        fetchedAt: Date.now(),
      });

      // Clean old cache entries (keep max 50)
      if (this.historicalCache.size > 50) {
        const entries = Array.from(this.historicalCache.entries());
        entries.sort((a, b) => a[1].fetchedAt - b[1].fetchedAt);
        const toRemove = entries.slice(0, entries.length - 50);
        toRemove.forEach(([key]) => this.historicalCache.delete(key));
      }

      return data;
    } catch (error) {
      console.error(`Error fetching historical prices for ${coingeckoId}:`, error);
      // Return cached data even if stale, better than nothing
      if (cached) {
        return cached.data;
      }
      throw error;
    }
  }

  /**
   * Clear the price cache
   */
  clearCache(): void {
    this.priceCache = {};
    this.historicalCache.clear();
  }
}

export const priceService = new PriceService();
