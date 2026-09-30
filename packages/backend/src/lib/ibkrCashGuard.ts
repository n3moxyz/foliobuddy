import { AppError } from '../middleware/errorHandler.js';

/** The aggregate balance cannot be changed as if it were a single USD pile. */
export function requireUnmanagedCash(position: { ibkrCash?: unknown }) {
  if (position.ibkrCash)
    throw new AppError('Edit IBKR currency balances or sync the broker account instead', 409);
}

export function isActiveIbkrPosition(position: {
  quantity: number;
  ibkrContractId?: number | null;
}) {
  return !(position.ibkrContractId != null && position.quantity === 0);
}
