import { z } from 'zod';
import { applyPositionDelta } from '../lib/domain.js';
import { costCurrencySchema } from '../lib/nativeCost.js';

export const reconciliationInputSchema = z
  .object({
    capturedAt: z.string().datetime({ offset: true }),
    positions: z
      .array(
        z.object({
          symbol: z.string().min(1).max(40),
          quantity: z.number().finite().positive(),
          recordedAvgCostUsd: z.number().finite().nonnegative(),
          currency: costCurrencySchema,
          avgCostNative: z.number().finite().nonnegative(),
          orders: z
            .array(
              z.object({
                orderId: z.string().min(1).max(80),
                timestamp: z.string().datetime({ offset: true }),
                side: z.enum(['BUY', 'SELL']),
                quantity: z.number().finite().positive(),
                price: z.number().finite().nonnegative(),
                portfolioFees: z.number().finite().nonnegative(),
                statementFees: z.number().finite().nonnegative(),
              })
            )
            .max(500)
            .optional(),
        })
      )
      .min(1)
      .max(50),
  })
  .strict();

type PositionInput = z.infer<typeof reconciliationInputSchema>['positions'][number];
export type ReconciliationPosition = {
  id: string;
  assetId: string;
  quantity: number;
  avgCostUsd: number;
  avgCostNative?: number | null;
  costCurrency?: string | null;
  createdAt: Date;
};
export type ReconciliationHistory = {
  id: string;
  mode: string;
  quantity: number;
  previousQuantity: number;
  previousAvgCostUsd: number;
  previousTotalCostUsd: number;
  nextQuantity: number;
  nextAvgCostUsd: number;
  nextTotalCostUsd: number;
  createdAt: Date;
};

function close(a: number, b: number) {
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b))
  );
}
function demand(test: boolean, message: string) {
  if (!test) throw new Error(message);
}
function singaporeDate(date: Date) {
  return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10);
}

/** Build a native-only repair. No existing USD field is included in a write patch. */
export function planNativeReconciliation(
  position: ReconciliationPosition,
  history: ReconciliationHistory[],
  input: PositionInput
) {
  demand(close(position.quantity, input.quantity), `${input.symbol}: quantity changed`);
  demand(
    close(position.avgCostUsd, input.recordedAvgCostUsd),
    `${input.symbol}: recorded USD cost changed`
  );
  demand(
    position.avgCostNative == null && !position.costCurrency,
    `${input.symbol}: native baseline already exists`
  );
  const positionPatch = { avgCostNative: input.avgCostNative, costCurrency: input.currency };
  const orders = input.orders ?? [];
  if (!orders.length) return { positionPatch, historyPatches: [], initialHistory: null };
  demand(
    new Set(orders.map((o) => o.orderId)).size === orders.length,
    'Duplicate broker order IDs'
  );
  let quantity = 0;
  let average = 0;
  const nativeEntries = orders.map((order, index) => {
    demand(
      index === 0 || new Date(order.timestamp) >= new Date(orders[index - 1].timestamp),
      'Broker orders must be chronological'
    );
    const previousQuantity = quantity;
    const previousAvgCostNative = average;
    const delta = applyPositionDelta({
      currentQuantity: quantity,
      currentAvgCostUsd: average,
      deltaQuantity: order.quantity,
      mode: order.side === 'BUY' ? 'add' : 'reduce',
      deltaTotalCostUsd: order.quantity * order.price + order.portfolioFees,
    });
    quantity = delta.nextQuantity;
    average = delta.nextAvgCostUsd;
    const proceedsNative =
      order.side === 'SELL' ? order.quantity * order.price - order.statementFees : null;
    demand(proceedsNative == null || proceedsNative >= 0, 'Broker fees exceed sale proceeds');
    return {
      previousQuantity,
      nextQuantity: quantity,
      patch: {
        costCurrency: input.currency,
        costBasisNative: delta.deltaCostUsd,
        previousAvgCostNative,
        nextAvgCostNative: average,
        proceedsNative,
        executionPriceNative: order.price,
        feesNative: order.statementFees,
        brokerOrderId: order.orderId,
        // Historical app conversion was not recorded. Do not invent it.
        fxRateToUsd: null,
      },
    };
  });
  demand(
    close(quantity, input.quantity) && close(average, input.avgCostNative),
    'Broker orders do not reproduce the current native average'
  );
  const sorted = [...history].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id)
  );
  demand(
    sorted.every((h) => h.mode === 'add' || h.mode === 'reduce'),
    'Reset history requires individual review'
  );
  const missingInitial = sorted.length === orders.length - 1;
  demand(
    missingInitial || sorted.length === orders.length,
    'App history count does not match the broker order ledger'
  );
  const offset = missingInitial ? 1 : 0;
  let recordedAverage = missingInitial ? (sorted[0]?.previousAvgCostUsd ?? position.avgCostUsd) : 0;
  let recordedQuantity = missingInitial ? orders[0].quantity : 0;
  const historyPatches = sorted.map((entry, index) => {
    const order = orders[index + offset];
    const native = nativeEntries[index + offset];
    demand(
      entry.mode === (order.side === 'BUY' ? 'add' : 'reduce') &&
        close(entry.quantity, order.quantity),
      'App history order or quantity differs'
    );
    demand(
      singaporeDate(entry.createdAt) === singaporeDate(new Date(order.timestamp)),
      'App activity date differs from the broker trade date'
    );
    demand(
      close(entry.previousQuantity, native.previousQuantity) &&
        close(entry.nextQuantity, native.nextQuantity),
      'App share history is discontinuous'
    );
    demand(
      close(entry.previousQuantity, recordedQuantity) &&
        close(entry.previousAvgCostUsd, recordedAverage) &&
        close(entry.previousTotalCostUsd, entry.previousQuantity * entry.previousAvgCostUsd) &&
        close(entry.nextTotalCostUsd, entry.nextQuantity * entry.nextAvgCostUsd),
      'App USD ledger requires individual review'
    );
    recordedQuantity = entry.nextQuantity;
    recordedAverage = entry.nextAvgCostUsd;
    return { id: entry.id, patch: native.patch };
  });
  demand(
    close(recordedQuantity, position.quantity) && close(recordedAverage, position.avgCostUsd),
    'App history does not reproduce recorded position totals'
  );
  const first = orders[0];
  demand(!missingInitial || first.side === 'BUY', 'The initial broker order must be a buy');
  const firstUsdAverage = sorted[0]?.previousAvgCostUsd ?? position.avgCostUsd;
  const initialHistory = missingInitial
    ? {
        mode: 'add',
        quantity: first.quantity,
        previousQuantity: 0,
        previousAvgCostUsd: 0,
        previousTotalCostUsd: 0,
        costBasisUsd: first.quantity * firstUsdAverage,
        nextQuantity: first.quantity,
        nextAvgCostUsd: firstUsdAverage,
        nextTotalCostUsd: first.quantity * firstUsdAverage,
        createdAt: new Date(first.timestamp),
        ...nativeEntries[0].patch,
      }
    : null;
  demand(
    !initialHistory || !sorted[0] || initialHistory.createdAt < sorted[0].createdAt,
    'Initial order timing overlaps app history; review required'
  );
  return { positionPatch, historyPatches, initialHistory };
}
