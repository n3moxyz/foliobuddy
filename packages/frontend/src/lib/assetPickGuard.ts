import { CategoryGroup, categoryGroup, type Asset, type AssetCategory } from '@/lib/types';

// CoinGecko coins can be catalogued as crypto or cash (a stablecoin added from
// the crypto picker), so either group is the same coin, not a different asset.
const COIN_GROUPS: CategoryGroup[] = [CategoryGroup.CRYPTO, CategoryGroup.STABLES];

const GROUP_LABELS: Record<CategoryGroup, string> = {
  [CategoryGroup.CRYPTO]: 'Crypto',
  [CategoryGroup.STABLES]: 'Cash',
  [CategoryGroup.EQUITIES]: 'Equities',
  // Unit trusts have no section of their own; they sit inside Equities.
  [CategoryGroup.UNIT_TRUSTS]: 'Equities, unit trust',
};

/**
 * Whether the catalog asset the server returned for a picked search result is
 * the kind of asset that was picked. A mismatch means the server bound the pick
 * to a different asset sharing its ticker, as the backend once did by filing
 * StablecoinX (a USDE stock) under the Ethena USDe stablecoin. Using that asset
 * would silently save the position under the wrong asset, so callers refuse it.
 */
export function resolvedAssetMatchesPick(
  asset: Pick<Asset, 'category'>,
  requestedCategory: AssetCategory
): boolean {
  const resolved = categoryGroup(asset.category);
  const requested = categoryGroup(requestedCategory);
  return (
    resolved === requested || (COIN_GROUPS.includes(resolved) && COIN_GROUPS.includes(requested))
  );
}

/** Toast copy for a pick the server resolved to a different asset. */
export function mismatchedPickToast(pickedName: string, asset: Pick<Asset, 'name' | 'category'>) {
  return {
    title: `Couldn't select ${pickedName}`,
    description: `The server returned ${asset.name} (${GROUP_LABELS[categoryGroup(asset.category)]}), a different asset, so nothing was selected. If this keeps happening, the server is mixing up assets that share a ticker.`,
  };
}
