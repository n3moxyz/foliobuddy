import type { Asset, ProviderSearchResult } from '@/lib/types';

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
