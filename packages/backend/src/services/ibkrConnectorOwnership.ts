import { isIbkrCash, requireIbkr } from './ibkrCapture.js';
import type { IbkrTransaction } from './ibkrSyncService.js';

/** Recheck the current owner, broker, custody and exact USD cash identity. */
export async function ownedIbkrCash(tx: IbkrTransaction, userId: string, cashPositionId: string) {
  const rows = await tx.position.findMany({
    where: {
      userId,
      custodyOf: null,
      storageType: 'BROKERAGE',
      storageLocation: 'IBKR',
      asset: { category: 'CASH' },
    },
    include: { asset: true },
    take: 2,
  });
  const row = rows.find((candidate) => candidate.id === cashPositionId);
  requireIbkr(
    rows.length === 1 &&
      row &&
      isIbkrCash(row) &&
      row.asset.symbol === 'USD' &&
      row.asset.nativeCurrency === 'USD' &&
      row.asset.priceProvider === 'manual' &&
      row.asset.currentPriceUsd === 1,
    'Select exactly one owned IBKR USD cash position'
  );
  return row;
}

/** Only an authenticated enrollment/pair approval can establish this immutable binding. */
export async function bindIbkrConnector(
  tx: IbkrTransaction,
  userId: string,
  connectorFingerprint: string
) {
  const binding = await tx.ibkrConnectorBinding.findUnique({ where: { connectorFingerprint } });
  if (!binding) {
    await tx.ibkrConnectorBinding.create({ data: { connectorFingerprint, userId } });
    return;
  }
  requireIbkr(binding.userId === userId, 'This IBKR connection is unavailable for this owner');
}

export async function requireIbkrConnector(
  tx: IbkrTransaction,
  userId: string,
  connectorFingerprint: string
) {
  const binding = await tx.ibkrConnectorBinding.findUnique({ where: { connectorFingerprint } });
  requireIbkr(binding?.userId === userId, 'This IBKR connection is unavailable for this owner');
}
