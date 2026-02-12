/**
 * Calculate trade P&L based on direction, entry/exit prices, and quantity.
 */
export function calculateTradePnL(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  quantity: number
): { pnl: number; pnlPct: number } {
  let pnl: number;

  if (direction === 'LONG') {
    pnl = (exitPrice - entryPrice) * quantity;
  } else {
    pnl = (entryPrice - exitPrice) * quantity;
  }

  const positionSize = entryPrice * quantity;
  const pnlPct = positionSize > 0 ? (pnl / positionSize) * 100 : 0;

  return { pnl, pnlPct };
}
