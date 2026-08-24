export type ProviderName = 'coingecko' | 'yahoo' | 'manual';

export interface ProviderPrice {
  priceUsd: number;
  nativePrice?: number | null;
  nativeCurrency?: string | null;
  fxRateToUsd?: number | null;
}

export interface ProviderSearchResult {
  providerAssetId: string;
  symbol: string;
  name: string;
  exchange?: string | null;
  nativeCurrency?: string | null;
  rank?: number | null;
}

export interface ProviderHistoricalPoint {
  timestamp: number;
  priceUsd: number;
  nativePrice?: number | null;
}

export interface ProviderNewsItem {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
}

export interface AssetPriceProvider {
  readonly name: ProviderName;
  /** How often the scheduler should refresh prices from this provider, in minutes. `Infinity` means never auto-refresh. */
  readonly refreshIntervalMinutes: number;
  getPrices(providerAssetIds: string[]): Promise<Map<string, ProviderPrice>>;
  search(query: string): Promise<ProviderSearchResult[]>;
  getHistoricalPrices(providerAssetId: string, days: number): Promise<ProviderHistoricalPoint[]>;
}
