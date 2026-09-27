import {
  AssetCategory,
  CATEGORIES_IN_GROUP,
  CategoryGroup,
  PriceProvider,
  categoryGroup,
  type PriceProvider as PriceProviderType,
  type AssetCategory as AssetCategoryType,
} from './constants.js';

export interface PositionValueInput {
  quantity: number;
  avgCostUsd: number;
  currentPriceUsd: number | null | undefined;
}

export interface PositionValueFields {
  marketValueUsd: number | null;
  unrealizedPnL: number | null;
  unrealizedPnLPct: number | null;
}

export function calculatePositionValue({
  quantity,
  avgCostUsd,
  currentPriceUsd,
}: PositionValueInput): PositionValueFields {
  if (currentPriceUsd === null || currentPriceUsd === undefined) {
    return {
      marketValueUsd: null,
      unrealizedPnL: null,
      unrealizedPnLPct: null,
    };
  }

  const marketValueUsd = quantity * currentPriceUsd;
  const costBasis = quantity * avgCostUsd;
  const unrealizedPnL = marketValueUsd - costBasis;

  return {
    marketValueUsd,
    unrealizedPnL,
    unrealizedPnLPct: costBasis > 0 ? (unrealizedPnL / costBasis) * 100 : 0,
  };
}

export type PositionDeltaMode = 'add' | 'reduce';

export interface PositionDeltaInput {
  currentQuantity: number;
  currentAvgCostUsd: number;
  deltaQuantity: number;
  mode: PositionDeltaMode;
  /**
   * Required for add mode. Ignored for reduce mode because reductions remove
   * cost basis at the current average cost.
   */
  deltaTotalCostUsd?: number;
}

export interface PositionDeltaResult {
  currentTotalCostUsd: number;
  deltaCostUsd: number;
  nextQuantity: number;
  nextTotalCostUsd: number;
  nextAvgCostUsd: number;
}

export function applyPositionDelta({
  currentQuantity,
  currentAvgCostUsd,
  deltaQuantity,
  mode,
  deltaTotalCostUsd,
}: PositionDeltaInput): PositionDeltaResult {
  if (
    !Number.isFinite(currentQuantity) ||
    !Number.isFinite(currentAvgCostUsd) ||
    !(currentQuantity >= 0) ||
    !(currentAvgCostUsd >= 0)
  ) {
    throw new Error('Current position values must be non-negative');
  }
  if (!Number.isFinite(deltaQuantity) || !(deltaQuantity > 0)) {
    throw new Error('Delta quantity must be positive');
  }
  if (
    mode === 'add' &&
    !(
      deltaTotalCostUsd !== undefined &&
      Number.isFinite(deltaTotalCostUsd) &&
      deltaTotalCostUsd >= 0
    )
  ) {
    throw new Error('Add cost must be non-negative');
  }

  const currentTotalCostUsd = currentQuantity * currentAvgCostUsd;
  const deltaCostUsd =
    mode === 'reduce' ? deltaQuantity * currentAvgCostUsd : (deltaTotalCostUsd as number);
  const multiplier = mode === 'add' ? 1 : -1;
  const nextQuantity = currentQuantity + deltaQuantity * multiplier;
  const nextTotalCostUsd = currentTotalCostUsd + deltaCostUsd * multiplier;

  if (![currentTotalCostUsd, deltaCostUsd, nextQuantity, nextTotalCostUsd].every(Number.isFinite)) {
    throw new Error('Position values exceed the supported numeric range');
  }

  if (nextQuantity < 0) {
    throw new Error('You cannot reduce below zero quantity');
  }
  if (nextTotalCostUsd < -Number.EPSILON) {
    throw new Error('You cannot reduce more cost basis than the position has');
  }

  const normalizedTotalCostUsd = Math.max(0, nextTotalCostUsd);

  return {
    currentTotalCostUsd,
    deltaCostUsd,
    nextQuantity,
    nextTotalCostUsd: normalizedTotalCostUsd,
    nextAvgCostUsd: nextQuantity > 0 ? normalizedTotalCostUsd / nextQuantity : 0,
  };
}

export function isExternalProviderCategoryCompatible(
  provider: PriceProviderType,
  category: AssetCategoryType
): boolean {
  const group = categoryGroup(category);
  if (provider === PriceProvider.YAHOO) {
    return group === CategoryGroup.EQUITIES || group === CategoryGroup.UNIT_TRUSTS;
  }
  if (provider === PriceProvider.MANUAL) {
    return group === CategoryGroup.UNIT_TRUSTS;
  }
  return true;
}

export function externalProviderCategoryError(
  provider: PriceProviderType,
  category: AssetCategoryType
): string | null {
  if (isExternalProviderCategoryCompatible(provider, category)) return null;
  if (provider === PriceProvider.YAHOO) {
    return 'Yahoo provider only supports EQUITY and UNIT_TRUST categories';
  }
  if (provider === PriceProvider.MANUAL) {
    return 'Manual provider only supports UNIT_TRUST category';
  }
  if (!Object.values(AssetCategory).includes(category)) {
    return `Unsupported asset category ${category}`;
  }
  return null;
}

const NON_CRYPTO_CATEGORIES = Object.entries(CATEGORIES_IN_GROUP)
  .filter(([group]) => group !== CategoryGroup.CRYPTO)
  .flatMap(([, categories]) => categories);

/**
 * Prisma filter for reusing a catalog asset by ticker when no provider identity
 * matched. Tickers are not unique across asset classes — StablecoinX (a Nasdaq
 * equity) and the Ethena USDe stablecoin are both USDE, and BTC is a coin and a
 * spot ETF — so a symbol match may only reuse an asset in the same category
 * group. Anything looser binds an equity position to a stablecoin row.
 */
export function sameClassSymbolWhere(symbol: string, category: string) {
  const group = categoryGroup(category);
  return {
    symbol: symbol.toUpperCase(),
    // categoryGroup() files unrecognised categories under crypto, so the crypto
    // group is "every category outside the other groups", not its listed three.
    category:
      group === CategoryGroup.CRYPTO
        ? { notIn: NON_CRYPTO_CATEGORIES }
        : { in: [...CATEGORIES_IN_GROUP[group]] },
  };
}

/** In-memory key with the same same-class rule as sameClassSymbolWhere. */
export function sameClassSymbolKey(symbol: string, category: string): string {
  return `${categoryGroup(category)}:${symbol.toUpperCase()}`;
}

/**
 * The Yahoo id a listed ticker implies, if any. Yahoo lists non-US shares with an
 * exchange suffix (D05.SI), so a bare ticker names only the US listing: on a
 * non-USD row it would price the holding from the wrong instrument.
 */
export function impliedYahooTicker(symbol: string, nativeCurrency?: string | null): string | null {
  const ticker = symbol.trim().toUpperCase();
  const currency = nativeCurrency?.trim().toUpperCase() || 'USD';
  return ticker && (currency === 'USD' || ticker.includes('.')) ? ticker : null;
}

export interface ImportPriceFeed {
  priceProvider: string;
  providerAssetId: string | null;
}

/**
 * Price feed for a catalog row an import creates, filling what the row left out.
 * The refresh job skips rows without a provider id, so a missing id falls back to
 * an equity's ticker (Yahoo, see impliedYahooTicker) or the CoinGecko id; a fund
 * code is not a Yahoo symbol, so a unit trust gets none. A dead EQUITY row also counts as "listed" in
 * equity search, hiding the real Yahoo listing for that ticker.
 */
export function importPriceFeed(asset: {
  category: string;
  symbol: string;
  coingeckoId?: string | null;
  nativeCurrency?: string | null;
  priceProvider?: string | null;
  providerAssetId?: string | null;
}): ImportPriceFeed {
  const priceProvider =
    asset.priceProvider ||
    (asset.category === AssetCategory.EQUITY
      ? PriceProvider.YAHOO
      : asset.category === AssetCategory.UNIT_TRUST
        ? PriceProvider.MANUAL
        : PriceProvider.COINGECKO);
  const fallbackId =
    priceProvider === PriceProvider.YAHOO && asset.category === AssetCategory.EQUITY
      ? impliedYahooTicker(asset.symbol, asset.nativeCurrency)
      : priceProvider === PriceProvider.COINGECKO
        ? asset.coingeckoId || null
        : null;
  return { priceProvider, providerAssetId: asset.providerAssetId || fallbackId };
}

/**
 * A catalog row the price refresh job can never price: an automatic feed with no
 * provider id (older imports wrote these, e.g. trade-imported equities left on the
 * `coingecko` default). Manual rows are priced by hand, so they never count.
 */
export function isUnpricedAsset(asset: {
  priceProvider: string;
  providerAssetId: string | null;
}): boolean {
  return !asset.providerAssetId && asset.priceProvider !== PriceProvider.MANUAL;
}
