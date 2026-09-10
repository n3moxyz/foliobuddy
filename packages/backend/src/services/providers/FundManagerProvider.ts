import { fetchManagerNav, FUND_MANAGER_SOURCES } from './fundManagerSources.js';
import { navToUsd } from '../unitTrustNavService.js';
import { logger } from '../../lib/logger.js';
import type { AssetPriceProvider, ProviderPrice } from './types.js';

export class FundManagerProvider implements AssetPriceProvider {
  readonly name = 'fund-manager' as const;
  readonly refreshIntervalMinutes = 60;

  async getPrices(ids: string[]): Promise<Map<string, ProviderPrice>> {
    const prices = new Map<string, ProviderPrice>();
    for (const id of new Set(ids)) {
      try {
        const nav = await fetchManagerNav(id);
        prices.set(id, { ...nav, ...(await navToUsd(nav.nativePrice, nav.nativeCurrency)) });
      } catch (error) {
        logger.warn(`[Fund Manager] ${id} could not be checked`, error);
      }
    }
    return prices;
  }

  async search(query: string) {
    return FUND_MANAGER_SOURCES.filter((fund) =>
      `${fund.name} ${fund.isin}`.toLowerCase().includes(query.toLowerCase())
    ).map((fund) => ({
      providerAssetId: fund.isin,
      symbol: fund.isin,
      name: fund.name,
      nativeCurrency: fund.currency,
    }));
  }

  async getHistoricalPrices() {
    return [];
  }
}
