import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type {
  AssetPriceProvider,
  ProviderHistoricalPoint,
  ProviderPrice,
  ProviderSearchResult,
} from './types.js';

/**
 * Manual provider for assets without a live feed (e.g., unit trusts).
 * Prices come from user-entered NAV updates written directly to PriceHistory.
 * `getPrices()` reads the latest PriceHistory row per asset so the scheduler
 * can refresh Asset.currentPriceUsd without hitting an external API.
 */
export class ManualProvider implements AssetPriceProvider {
  readonly name = 'manual' as const;
  readonly refreshIntervalMinutes = Infinity;

  async getPrices(providerAssetIds: string[]): Promise<Map<string, ProviderPrice>> {
    const prices = new Map<string, ProviderPrice>();
    if (providerAssetIds.length === 0) return prices;

    const assets = await prisma.asset.findMany({
      where: {
        priceProvider: this.name,
        providerAssetId: { in: providerAssetIds },
      },
      select: {
        providerAssetId: true,
        priceHistory: {
          orderBy: { timestamp: 'desc' },
          take: 1,
          select: { priceUsd: true, nativePrice: true, nativeCurrency: true, fxRateToUsd: true },
        },
      },
    });

    for (const asset of assets) {
      const latest = asset.priceHistory[0];
      if (!latest || !asset.providerAssetId) continue;
      prices.set(asset.providerAssetId, {
        priceUsd: latest.priceUsd,
        nativePrice: latest.nativePrice,
        nativeCurrency: latest.nativeCurrency,
        fxRateToUsd: latest.fxRateToUsd,
      });
    }
    return prices;
  }

  async search(_query: string): Promise<ProviderSearchResult[]> {
    return [];
  }

  async getHistoricalPrices(
    providerAssetId: string,
    days: number
  ): Promise<ProviderHistoricalPoint[]> {
    const asset = await prisma.asset.findFirst({
      where: { priceProvider: this.name, providerAssetId },
      select: { id: true },
    });
    if (!asset) return [];

    const since = new Date();
    since.setDate(since.getDate() - days);

    const rows = await prisma.priceHistory.findMany({
      where: { assetId: asset.id, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, priceUsd: true, nativePrice: true },
    });

    if (rows.length === 0) {
      logger.info(`[Manual] No NAV history in last ${days}d for ${providerAssetId}`);
      return [];
    }

    return rows.map((r) => ({
      timestamp: r.timestamp.getTime(),
      priceUsd: r.priceUsd,
      nativePrice: r.nativePrice,
    }));
  }
}
