import { prisma } from '../index.js';

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';
const RATE_LIMIT_DELAY = 2100; // 2.1 seconds between calls (30 calls/min limit)
const BATCH_SIZE = 50; // Max coins per request
const CACHE_DURATION_MS = 30000; // 30 seconds cache

interface PriceCache {
  [coingeckoId: string]: {
    price: number;
    timestamp: number;
  };
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

class PriceService {
  private priceCache: PriceCache = {};
  private lastRequestTime = 0;
  private requestQueue: Array<() => Promise<void>> = [];
  private isProcessingQueue = false;

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
   * Get price for a single coin
   */
  async getPrice(coingeckoId: string): Promise<number | null> {
    const prices = await this.getPrices([coingeckoId]);
    return prices.get(coingeckoId) ?? null;
  }

  /**
   * Search for coins by name or symbol
   */
  async searchCoins(query: string): Promise<Array<{ id: string; symbol: string; name: string; rank: number | null }>> {
    const url = `${COINGECKO_BASE_URL}/search?query=${encodeURIComponent(query)}`;

    try {
      const data = await this.rateLimitedFetch<CoinGeckoSearchResult>(url);

      return data.coins.slice(0, 20).map(coin => ({
        id: coin.id,
        symbol: coin.symbol.toUpperCase(),
        name: coin.name,
        rank: coin.market_cap_rank,
      }));
    } catch (error) {
      console.error('Error searching coins:', error);
      return [];
    }
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
   * Clear the price cache
   */
  clearCache(): void {
    this.priceCache = {};
  }
}

export const priceService = new PriceService();
