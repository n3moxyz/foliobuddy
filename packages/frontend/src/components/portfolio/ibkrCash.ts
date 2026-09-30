import type { Position } from '@/lib/types';

export function isIbkrCashPosition(position: Position) {
  return (
    position.asset.category === 'CASH' &&
    position.storageType === 'BROKERAGE' &&
    position.storageLocation === 'IBKR' &&
    !position.custodyOf
  );
}
