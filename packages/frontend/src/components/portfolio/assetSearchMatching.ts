import type {
  Asset,
  CoinSearchResult,
  CreateAssetFromProviderData,
  ProviderSearchResult,
} from '@/lib/types';
import { CategoryGroup, categoryGroup } from '@/lib/utils';

/**
 * Whether a Yahoo equity search hit is already offered as an existing asset in
 * the equity picker, and so should not be listed twice. The picker lists only
 * EQUITY assets, so a same-ticker asset of another class must not hide the hit:
 * StablecoinX trades as USDE, the same symbol the Ethena USDe stablecoin uses.
 */
export function isListedEquityCandidate(
  assets: Asset[] | undefined,
  candidate: ProviderSearchResult
): boolean {
  const symbol = candidate.symbol.toLowerCase();
  return (assets ?? []).some(
    (asset) =>
      (asset.priceProvider === 'yahoo' && asset.providerAssetId === candidate.providerAssetId) ||
      (asset.category === 'EQUITY' && asset.symbol.toLowerCase() === symbol)
  );
}

/**
 * Whether a CoinGecko search hit is already in the catalog as a crypto picker
 * would offer it. The coin's own id always counts: picking it returns that row,
 * which the picker either lists already or leaves out on purpose (stablecoins in
 * the trade picker). A ticker counts only on a crypto asset, since picking the
 * coin reuses a same-class ticker and nothing else: a BTC spot ETF or the
 * StablecoinX equity must not hide the coin that shares its symbol.
 */
export function isListedCoinCandidate(
  assets: Asset[] | undefined,
  coin: CoinSearchResult
): boolean {
  const symbol = coin.symbol.toLowerCase();
  // An unpriced row never hides the coin: picking the hit is what heals it
  // (from-coingecko adopts the identity or backfills the provider id).
  return (assets ?? []).some(
    (asset) =>
      !isUnpricedAsset(asset) &&
      (asset.coingeckoId === coin.id ||
        (asset.priceProvider === 'coingecko' && asset.providerAssetId === coin.id) ||
        (categoryGroup(asset.category) === CategoryGroup.CRYPTO &&
          asset.symbol.toLowerCase() === symbol))
  );
}

/**
 * Whether an EQUITY catalog row can never be priced: an automatic feed with no
 * provider id (older trade-JSON imports left these on the `coingecko` default).
 * The equity picker must repair one of these on selection instead of handing
 * back a position that the price refresh job will skip forever.
 */
/**
 * The Yahoo id a listed ticker implies, if any (backend impliedYahooTicker): Yahoo
 * lists non-US shares with an exchange suffix (D05.SI), so a bare ticker names only
 * the US listing and must not price a non-USD holding.
 */
export function impliedYahooTicker(
  symbol: string,
  nativeCurrency: string | null | undefined
): string | null {
  const ticker = symbol.trim().toUpperCase();
  const currency = nativeCurrency?.trim().toUpperCase() || 'USD';
  return ticker && (currency === 'USD' || ticker.includes('.')) ? ticker : null;
}

/** An automatic feed with no provider id, which the price job never refreshes (backend isUnpricedAsset). */
export function isUnpricedAsset(asset: Pick<Asset, 'priceProvider' | 'providerAssetId'>): boolean {
  return !asset.providerAssetId && asset.priceProvider !== 'manual';
}

export function isUnpricedEquity(asset: Asset): boolean {
  return asset.category === 'EQUITY' && isUnpricedAsset(asset);
}

/**
 * The from-provider request that heals an unpriced equity when it is picked, or
 * null when its ticker implies no Yahoo id. Identity only: the backend adopts it
 * onto this row, or returns the live row already holding that ticker, and sending
 * this row's stale exchange or currency would overwrite that shared live row.
 */
export function unpricedEquityRepairRequest(
  asset: Asset,
  nativeCurrency: string
): CreateAssetFromProviderData | null {
  const ticker = isUnpricedEquity(asset) ? impliedYahooTicker(asset.symbol, nativeCurrency) : null;
  if (!ticker) return null;
  return {
    provider: 'yahoo',
    providerAssetId: ticker,
    symbol: asset.symbol,
    name: asset.name,
    category: 'EQUITY',
  };
}

/**
 * Whether a repair response may replace the picked row. A metadata repair must
 * return the same catalog row; an unpriced equity's repair may instead return the
 * live equity already holding its implied Yahoo ticker, which is the same listing.
 */
export function acceptsRepairedAsset(
  picked: Asset,
  returned: Asset,
  nativeCurrency: string
): boolean {
  if (returned.id === picked.id) return true;
  const request = unpricedEquityRepairRequest(picked, nativeCurrency);
  return (
    !!request &&
    returned.category === 'EQUITY' &&
    returned.priceProvider === request.provider &&
    returned.providerAssetId === request.providerAssetId
  );
}
