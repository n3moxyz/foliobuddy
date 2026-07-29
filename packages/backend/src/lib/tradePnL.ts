/**
 * Calculate net trade P&L after deducting any funding cost.
 */
export function calculateTradePnL(
  direction: 'LONG' | 'SHORT',
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  fundingCost = 0
): { pnl: number; pnlPct: number } {
  let pricePnL: number;

  if (direction === 'LONG') {
    pricePnL = (exitPrice - entryPrice) * quantity;
  } else {
    pricePnL = (entryPrice - exitPrice) * quantity;
  }

  const pnl = pricePnL - fundingCost;
  const positionSize = entryPrice * quantity;
  const pnlPct = positionSize > 0 ? (pnl / positionSize) * 100 : 0;

  return { pnl, pnlPct };
}
