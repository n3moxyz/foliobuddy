import { createHash } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { planNativeReconciliation, reconciliationInputSchema } from './nativeCostReconciliation.js';
import { projectNativeCosts } from './nativeCostService.js';

const finite = z.number().finite();
const nativeKeys = [
  'costCurrency',
  'costBasisNative',
  'previousAvgCostNative',
  'nextAvgCostNative',
  'proceedsNative',
  'fxRateToUsd',
  'executionPriceNative',
  'feesNative',
  'brokerOrderId',
] as const;
const historySchema = z.object({
  id: z.string(),
  userId: z.string(),
  positionId: z.string(),
  assetId: z.string(),
  mode: z.string(),
  quantity: finite,
  costBasisUsd: finite,
  previousQuantity: finite,
  previousAvgCostUsd: finite,
  previousTotalCostUsd: finite,
  nextQuantity: finite,
  nextAvgCostUsd: finite,
  nextTotalCostUsd: finite,
  proceedsUsd: finite.nullable(),
  operationId: z.string().nullable(),
  createdAt: z.string().datetime(),
  costCurrency: z.string().nullable(),
  costBasisNative: finite.nullable(),
  previousAvgCostNative: finite.nullable(),
  nextAvgCostNative: finite.nullable(),
  proceedsNative: finite.nullable(),
  fxRateToUsd: finite.nullable(),
  executionPriceNative: finite.nullable(),
  feesNative: finite.nullable(),
  brokerOrderId: z.string().nullable(),
});
const beforeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  assetId: z.string(),
  quantity: finite,
  avgCostUsd: finite,
  avgCostNative: finite.nullable(),
  costCurrency: z.string().nullable(),
  custodyOf: z.string().nullable(),
  storageType: z.string(),
  storageLocation: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().datetime(),
  history: z.array(historySchema).max(500),
  asset: z.object({
    id: z.string(),
    symbol: z.string(),
    category: z.string(),
    nativeCurrency: z.string(),
    priceProvider: z.string(),
    providerAssetId: z.string().nullable(),
  }),
});
const backupSchema = z
  .object({
    version: z.literal(2),
    userId: z.string(),
    input: reconciliationInputSchema,
    before: z.array(beforeSchema).min(1).max(50),
  })
  .strict();
type Backup = z.infer<typeof backupSchema>;
type Before = Backup['before'][number];
type Row = Awaited<
  ReturnType<typeof prisma.position.findMany<{ include: { asset: true; history: true } }>>
>[number];
type Plan = ReturnType<typeof planNativeReconciliation>;

function requireMatch(value: boolean, message: string) {
  if (!value) throw new AppError(message, 409);
}
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => [key, canonical(v)])
    );
  return value;
}
function hash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function snapshot(row: Row): Before {
  const {
    id,
    userId,
    assetId,
    quantity,
    avgCostUsd,
    avgCostNative,
    costCurrency,
    custodyOf,
    storageType,
    storageLocation,
    notes,
    createdAt,
  } = row;
  return beforeSchema.parse({
    id,
    userId,
    assetId,
    quantity,
    avgCostUsd,
    avgCostNative,
    costCurrency,
    custodyOf,
    storageType,
    storageLocation,
    notes,
    createdAt: createdAt.toISOString(),
    asset: row.asset,
    history: [...row.history]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((h) => ({ ...h, createdAt: h.createdAt.toISOString() })),
  });
}
function plansFor(backup: Backup) {
  requireMatch(
    backup.before.length === backup.input.positions.length,
    'Backup position count differs'
  );
  requireMatch(
    new Set(backup.before.map((p) => p.id)).size === backup.before.length,
    'Duplicate backup positions'
  );
  return backup.input.positions.map((input) => {
    const matches = backup.before.filter((p) => p.asset.symbol === input.symbol);
    requireMatch(matches.length === 1, `${input.symbol}: require exactly one owned IBKR position`);
    const before = matches[0];
    requireMatch(
      before.userId === backup.userId &&
        before.custodyOf === null &&
        before.storageType === 'BROKERAGE' &&
        before.storageLocation === 'IBKR' &&
        before.asset.nativeCurrency === input.currency &&
        ['EQUITY', 'ETF'].includes(before.asset.category),
      'Broker, instrument, currency or ownership differs'
    );
    requireMatch(
      before.history.every(
        (h) =>
          h.userId === backup.userId && h.positionId === before.id && h.assetId === before.assetId
      ),
      'Historical ownership or instrument identity differs'
    );
    try {
      return {
        before,
        plan: planNativeReconciliation(
          { ...before, createdAt: new Date(before.createdAt) },
          before.history.map((h) => ({ ...h, createdAt: new Date(h.createdAt) })),
          input
        ),
      };
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : 'Reconciliation requires review',
        409
      );
    }
  });
}
function initialId(before: Before, plan: Plan) {
  return `native-${hash([before.userId, before.id, plan.initialHistory?.brokerOrderId]).slice(0, 40)}`;
}
function expectedAfter(before: Before, plan: Plan): Before {
  const initial = plan.initialHistory
    ? {
        ...plan.initialHistory,
        id: initialId(before, plan),
        createdAt: plan.initialHistory.createdAt.toISOString(),
        userId: before.userId,
        positionId: before.id,
        assetId: before.assetId,
        operationId: null,
        proceedsUsd: null,
      }
    : null;
  return {
    ...before,
    ...plan.positionPatch,
    history: [
      ...before.history.map((h) => ({
        ...h,
        ...plan.historyPatches.find((p) => p.id === h.id)?.patch,
      })),
      ...(initial ? [initial] : []),
    ].sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** Authenticated UI transport for the same native-only plan as the private CLI. */
export async function reconcileNativeCosts(
  userId: string,
  rawInput: unknown,
  expectedState?: string
) {
  const input = reconciliationInputSchema.parse(rawInput);
  const age = Date.now() - new Date(input.capturedAt).getTime();
  requireMatch(
    age >= -300000 && age <= 24 * 3600000,
    'Refresh the broker capture; it must be less than 24 hours old'
  );
  requireMatch(
    new Set(input.positions.map((p) => p.symbol)).size === input.positions.length,
    'Duplicate input symbols'
  );
  const rows = await prisma.position.findMany({
    where: {
      userId,
      custodyOf: null,
      storageType: 'BROKERAGE',
      storageLocation: 'IBKR',
      asset: { symbol: { in: input.positions.map((p) => p.symbol) } },
    },
    include: { asset: true, history: true },
  });
  const backup: Backup = { version: 2, userId, input, before: rows.map(snapshot) };
  const plans = plansFor(backup);
  const state = hash(backup);
  if (expectedState)
    requireMatch(
      state === expectedState,
      'Positions or history changed since preview; download a fresh backup'
    );
  const projected = await projectNativeCosts(
    plans.map(({ before, plan }) => {
      const row = rows.find((p) => p.id === before.id)!;
      return { ...row, ...plan.positionPatch };
    })
  );
  const review = plans.map(({ before, plan }, i) => ({
    symbol: before.asset.symbol,
    quantity: before.quantity,
    recordedAvgCostUsd: before.avgCostUsd,
    avgCostNative: plan.positionPatch.avgCostNative,
    costCurrency: plan.positionPatch.costCurrency,
    avgCostUsd: projected[i].avgCostUsd,
    costFxAsOf: projected[i].costFxAsOf,
    nativeHistoryRows: plan.historyPatches.length,
    initialRowAdded: !!plan.initialHistory,
  }));
  if (expectedState) {
    await prisma.$transaction(
      async (tx) => {
        for (const { before } of plans) {
          const current = await tx.position.findFirst({
            where: { id: before.id, userId },
            include: { asset: true, history: true },
          });
          requireMatch(
            !!current && hash(snapshot(current)) === hash(before),
            'Position changed while applying; nothing was applied'
          );
        }
        for (const { before, plan } of plans) {
          const updated = await tx.position.updateMany({
            where: { id: before.id, userId },
            data: plan.positionPatch,
          });
          requireMatch(updated.count === 1, 'Position no longer available');
          for (const { id, patch } of plan.historyPatches) {
            const changed = await tx.positionHistory.updateMany({
              where: { id, positionId: before.id, userId },
              data: patch,
            });
            requireMatch(changed.count === 1, 'History no longer available');
          }
          if (plan.initialHistory)
            await tx.positionHistory.create({
              data: {
                ...plan.initialHistory,
                id: initialId(before, plan),
                userId,
                positionId: before.id,
                assetId: before.assetId,
              },
            });
          const after = await tx.position.findFirstOrThrow({
            where: { id: before.id, userId },
            include: { asset: true, history: true },
          });
          requireMatch(
            hash(snapshot(after)) === hash(expectedAfter(before, plan)),
            'Readback differs; transaction rolled back'
          );
        }
      },
      { isolationLevel: 'Serializable' }
    );
  }
  return { state, backup, review, applied: !!expectedState };
}

export async function restoreNativeCosts(userId: string, rawBackup: unknown, apply: boolean) {
  const backup = backupSchema.parse(rawBackup);
  requireMatch(backup.userId === userId, 'Backup belongs to another owner');
  const plans = plansFor(backup);
  await prisma.$transaction(
    async (tx) => {
      for (const { before, plan } of plans) {
        const current = await tx.position.findFirst({
          where: { id: before.id, userId },
          include: { asset: true, history: true },
        });
        requireMatch(
          !!current && hash(snapshot(current)) === hash(expectedAfter(before, plan)),
          'Position or history changed after reconciliation; restoring requires review'
        );
      }
      if (!apply) return;
      for (const { before, plan } of plans) {
        await tx.position.updateMany({
          where: { id: before.id, userId },
          data: { avgCostNative: before.avgCostNative, costCurrency: before.costCurrency },
        });
        for (const { id } of plan.historyPatches) {
          const original = before.history.find((h) => h.id === id)!;
          await tx.positionHistory.updateMany({
            where: { id, positionId: before.id, userId },
            data: Object.fromEntries(nativeKeys.map((key) => [key, original[key]])),
          });
        }
        if (plan.initialHistory)
          await tx.positionHistory.deleteMany({
            where: { id: initialId(before, plan), positionId: before.id, userId },
          });
        const after = await tx.position.findFirstOrThrow({
          where: { id: before.id, userId },
          include: { asset: true, history: true },
        });
        requireMatch(
          hash(snapshot(after)) === hash(before),
          'Restore readback differs; transaction rolled back'
        );
      }
    },
    { isolationLevel: 'Serializable' }
  );
  return {
    applied: apply,
    review: plans.map(({ before }) => ({
      symbol: before.asset.symbol,
      quantity: before.quantity,
      recordedAvgCostUsd: before.avgCostUsd,
      avgCostNative: before.avgCostNative,
      costCurrency: before.costCurrency,
    })),
  };
}
