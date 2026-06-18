import type { Trade } from '@/lib/types';

export function formatTradeForClipboard(trade: Trade) {
  return {
    asset: {
      coingeckoId: trade.asset.coingeckoId,
      symbol: trade.asset.symbol,
      name: trade.asset.name,
      category: trade.asset.category,
    },
    direction: trade.direction,
    entryPrice: trade.entryPrice,
    exitPrice: trade.exitPrice,
    quantity: trade.quantity,
    entryDate: trade.entryDate,
    exitDate: trade.exitDate,
    status: trade.status,
    notes: trade.notes,
    tags: trade.tags,
  };
}

export async function copyTradesToClipboard(trades: Trade[]): Promise<boolean> {
  try {
    const text = JSON.stringify(trades.map(formatTradeForClipboard), null, 2);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export async function copyTradeToClipboard(trade: Trade): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(JSON.stringify(formatTradeForClipboard(trade), null, 2));
    return true;
  } catch {
    return false;
  }
}
