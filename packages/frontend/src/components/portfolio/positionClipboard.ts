import type { Position } from '@/lib/types';

function formatPositionsForClipboard(positions: Position | Position[]) {
  const posArray = Array.isArray(positions) ? positions : [positions];

  const formatted = posArray.map((p) => ({
    asset: {
      coingeckoId: p.asset.coingeckoId,
      symbol: p.asset.symbol,
      name: p.asset.name,
      category: p.asset.category,
      // Provider wiring is carried for non-coingecko assets so re-imported equities keep pricing.
      ...(p.asset.priceProvider && p.asset.priceProvider !== 'coingecko'
        ? {
            priceProvider: p.asset.priceProvider,
            providerAssetId: p.asset.providerAssetId,
            nativeCurrency: p.asset.nativeCurrency,
            exchange: p.asset.exchange,
          }
        : {}),
    },
    quantity: p.quantity,
    avgCostUsd: p.avgCostUsd,
    storageType: p.storageType,
    storageLocation: p.storageLocation,
    notes: p.notes,
    ...(p.custodyOf ? { custodyOf: p.custodyOf } : {}),
  }));

  return JSON.stringify(formatted, null, 2);
}

export async function copyPositionsToClipboard(positions: Position | Position[]): Promise<boolean> {
  try {
    const text = formatPositionsForClipboard(positions);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
