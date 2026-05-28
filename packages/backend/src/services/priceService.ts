import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { CoinGeckoProvider } from './providers/CoinGeckoProvider.js';
import { YahooFinanceProvider } from './providers/YahooFinanceProvider.js';
import { ManualProvider } from './providers/ManualProvider.js';
import type {
  AssetPriceProvider,
  ProviderHistoricalPoint,
  ProviderName,
  ProviderSearchResult,
} from './providers/types.js';

type RefreshResult = {
  updated: number;
  errors: number;
  changedAssetIds: string[];
};

class PriceService {
  private readonly coingecko = new CoinGeckoProvider();
  private readonly yahoo = new YahooFinanceProvider();
  private readonly manual = new ManualProvider();

  private readonly providers: Record<ProviderName, AssetPriceProvider> = {
    coingecko: this.coingecko,
    yahoo: this.yahoo,
    manual: this.manual,
  };

  getProvider(name: ProviderName): AssetPriceProvider {
    return this.providers[name];
  }

  // ── CoinGecko-only legacy surface (kept for existing callers) ──────────

  async getPrices(coingeckoIds: string[]): Promise<Map<string, number>> {
    const prices = await this.coingecko.getPrices(coingeckoIds);
    const simple = new Map<string, number>();
    for (const [id, p] of prices) simple.set(id, p.priceUsd);
    return simple;
  }

  async getPrice(coingeckoId: string): Promise<number | null> {
    const prices = await this.coingecko.getPrices([coingeckoId]);
    return prices.get(coingeckoId)?.priceUsd ?? null;
  }

  async getDirectPrice(coingeckoId: string): Promise<number | null> {
    return this.coingecko.getDirectPrice(coingeckoId);
  }

  async searchCoins(
    query: string
  ): Promise<Array<{ id: string; symbol: string; name: string; rank: number | null }>> {
    const results = await this.coingecko.search(query);
    return results.map((r) => ({
      id: r.providerAssetId,
      symbol: r.symbol,
      name: r.name,
      rank: r.rank ?? null,
    }));
  }

  async getExchangeRates(): Promise<{ usdSgd: number } | null> {
    return this.coingecko.getExchangeRates();
  }

  async getHistoricalPrices(
    coingeckoId: string,
    days: number
  ): Promise<Array<{ timestamp: number; price: number }>> {
    const points = await this.coingecko.getHistoricalPrices(coingeckoId, days);
    return points.map((p) => ({ timestamp: p.timestamp, price: p.priceUsd }));
  }

  // ── Multi-provider surface ─────────────────────────────────────────────

  async searchAssets(query: string, provider: ProviderName): Promise<ProviderSearchResult[]> {
    return this.providers[provider].search(query);
  }

  async getAssetHistory(
    providerName: ProviderName,
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    return this.providers[providerName].getHistoricalPrices(providerAssetId, days);
  }

  async refreshAllPrices(providerFilter?: ProviderName): Promise<RefreshResult> {
    const whereClause = providerFilter ? { priceProvider: providerFilter } : {};
    const assets = await prisma.asset.findMany({
      where: {
        ...whereClause,
        providerAssetId: { not: null },
      },
      select: {
        id: true,
        priceProvider: true,
        providerAssetId: true,
        currentPriceUsd: true,
      },
    });

    if (assets.length === 0) {
      return { updated: 0, errors: 0, changedAssetIds: [] };
    }

    const byProvider = new Map<ProviderName, typeof assets>();
    for (const asset of assets) {
      const name = asset.priceProvider as ProviderName;
      if (!this.providers[name]) continue;
      if (!byProvider.has(name)) byProvider.set(name, []);
      byProvider.get(name)!.push(asset);
    }

    let updated = 0;
    let errors = 0;
    const changedAssetIds: string[] = [];

    const now = new Date();

    for (const [providerName, providerAssets] of byProvider) {
      const provider = this.providers[providerName];
      const ids = providerAssets
        .map((a) => a.providerAssetId)
        .filter((id): id is string => id !== null);

      let priceMap;
      try {
        priceMap = await provider.getPrices(ids);
      } catch (error) {
        logger.error(`[Price Refresh] ${providerName} batch failed:`, error);
        errors += providerAssets.length;
        continue;
      }

      const assetUpdates: Array<ReturnType<typeof prisma.asset.update>> = [];
      const historyRows: Array<{
        assetId: string;
        priceUsd: number;
        nativePrice: number | null;
        nativeCurrency: string | null;
        fxRateToUsd: number | null;
        source: ProviderName;
      }> = [];

      for (const asset of providerAssets) {
        if (!asset.providerAssetId) continue;
        const price = priceMap.get(asset.providerAssetId);
        if (!price) {
          errors++;
          continue;
        }
        assetUpdates.push(
          prisma.asset.update({
            where: { id: asset.id },
            data: { currentPriceUsd: price.priceUsd, priceUpdatedAt: now },
          })
        );
        // Manual assets get PriceHistory rows only from explicit NAV updates
        if (providerName !== 'manual') {
          historyRows.push({
            assetId: asset.id,
            priceUsd: price.priceUsd,
            nativePrice: price.nativePrice ?? null,
            nativeCurrency: price.nativeCurrency ?? null,
            fxRateToUsd: price.fxRateToUsd ?? null,
            source: providerName,
          });
        }
        if (asset.currentPriceUsd !== price.priceUsd) changedAssetIds.push(asset.id);
        updated++;
      }

      if (assetUpdates.length > 0) {
        try {
          await prisma.$transaction(assetUpdates);
        } catch (error) {
          logger.error(`[Price Refresh] ${providerName} asset update batch failed:`, error);
          errors += assetUpdates.length;
          updated -= assetUpdates.length;
        }
      }

      if (historyRows.length > 0) {
        try {
          // skipDuplicates handles (assetId, timestamp) collisions on sub-second re-runs
          await prisma.priceHistory.createMany({ data: historyRows, skipDuplicates: true });
        } catch (error) {
          logger.error(`[Price Refresh] ${providerName} history insert batch failed:`, error);
        }
      }
    }

    return { updated, errors, changedAssetIds };
  }

  async updatePositionValues(changedAssetIds?: string[]): Promise<void> {
    if (changedAssetIds && changedAssetIds.length === 0) return;
    const positions = await prisma.position.findMany({
      ...(changedAssetIds ? { where: { assetId: { in: changedAssetIds } } } : {}),
      select: {
        id: true,
        quantity: true,
        avgCostUsd: true,
        asset: { select: { currentPriceUsd: true } },
      },
    });
    const updates = positions
      .filter((p) => p.asset.currentPriceUsd != null)
      .map((p) => {
        const marketValue = p.quantity * (p.asset.currentPriceUsd as number);
        const costBasis = p.quantity * p.avgCostUsd;
        const unrealizedPnL = marketValue - costBasis;
        const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0;
        return prisma.position.update({
          where: { id: p.id },
          data: { marketValueUsd: marketValue, unrealizedPnL, unrealizedPnLPct },
        });
      });
    if (updates.length === 0) return;
    await prisma.$transaction(updates);
  }

  clearCache(): void {
    this.coingecko.clearCache();
    this.yahoo.clearCache();
  }
}

export const priceService = new PriceService();
