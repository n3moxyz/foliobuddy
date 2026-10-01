import type { Position } from '@/lib/types';

export function isOwnedIbkrPosition(position: Position) {
  return (
    position.storageType === 'BROKERAGE' &&
    position.storageLocation === 'IBKR' &&
    !position.custodyOf &&
    ['EQUITY', 'UNIT_TRUST', 'CASH'].includes(position.asset.category)
  );
}
