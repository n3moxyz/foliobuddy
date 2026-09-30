import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { calculatePositionValue } from '../lib/domain.js';
import { navTransaction } from './unitTrustNavService.js';
import { projectNativeCosts } from './nativeCostService.js';
import {
  ibkrYahooSymbol,
  isIbkrCash,
  requireIbkr,
  validateIbkrCapture,
  type IbkrCapture,
  type IbkrCashSnapshot,
} from './ibkrCapture.js';

type Tx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;
type Row = Awaited<
  ReturnType<
    typeof prisma.position.findMany<{
      include: { asset: true; history: true };
    }>
  >
>[number];
type Checkpoint = ReturnType<typeof checkpoint>;
type Patch = {
  id: string;
  quantity: number;
  avgCostNative: number | null;
  costCurrency: string | null;
  ibkrContractId: number | null;
  ibkrSyncedAt: string | null;
  ibkrCash: IbkrCashSnapshot | null;
  avgCostUsd: number;
};

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  return value;
}
function hash(value: unknown) {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function checkpoint(row: Row) {
  requireIbkr(row.history.length <= 500, 'Position history requires a larger reviewed checkpoint');
  return {
    id: row.id,
    assetId: row.assetId,
    userId: row.userId,
    quantity: row.quantity,
    avgCostUsd: row.avgCostUsd,
    avgCostNative: row.avgCostNative,
    costCurrency: row.costCurrency,
    ibkrContractId: row.ibkrContractId,
    ibkrSyncedAt: row.ibkrSyncedAt?.toISOString() ?? null,
    ibkrCash: row.ibkrCash,
    storageType: row.storageType,
    storageLocation: row.storageLocation,
    custodyOf: row.custodyOf,
    notes: row.notes,
    asset: {
      id: row.assetId,
      symbol: row.asset.symbol,
      category: row.asset.category,
      nativeCurrency: row.asset.nativeCurrency,
      priceProvider: row.asset.priceProvider,
      providerAssetId: row.asset.providerAssetId,
    },
    historyHash: hash([...row.history].sort((a, b) => a.id.localeCompare(b.id))),
  };
}
async function rowsFor(tx: Tx, userId: string) {
  return tx.position.findMany({
    where: { userId, storageType: 'BROKERAGE', storageLocation: 'IBKR', custodyOf: null },
    include: { asset: true, history: { take: 501 } },
    orderBy: { id: 'asc' },
  });
}
function cashRow(rows: Row[], id: string) {
  const row = rows.find((p) => p.id === id);
  requireIbkr(row && isIbkrCash(row), 'Select an owned IBKR fiat cash position');
  requireIbkr(
    row.asset.symbol === 'USD' &&
      row.asset.nativeCurrency === 'USD' &&
      row.asset.priceProvider === 'manual' &&
      row.asset.currentPriceUsd === 1,
    'IBKR cash needs its existing USD cash record with a unit price of 1'
  );
  requireIbkr(
    rows.filter(isIbkrCash).length === 1,
    'Multiple IBKR cash records need review before consolidation'
  );
  return row;
}
function cashPatch(row: Row, cash: IbkrCashSnapshot): Patch {
  return {
    id: row.id,
    quantity: cash.netCashUsd,
    avgCostUsd: 1,
    avgCostNative: null,
    costCurrency: null,
    ibkrContractId: null,
    ibkrSyncedAt: new Date(cash.capturedAt).toISOString(),
    ibkrCash: cash,
  };
}
function afterCheckpoint(before: Checkpoint, patch?: Patch): Checkpoint {
  return patch
    ? { ...before, ...patch, ibkrCash: json(patch.ibkrCash) as Prisma.JsonValue }
    : before;
}

// Permit machine-level transport rounding only in fields this sync writes.
// Before-state guards and stored audit checkpoints still compare exactly.
function sameWrittenState(actual: Checkpoint[], expected: Checkpoint[], patches: Patch[]) {
  const numeric = (a: unknown, b: unknown): boolean =>
    typeof a === 'number' &&
    typeof b === 'number' &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    Math.abs(a - b) <= 2 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), Number.MIN_VALUE);
  const normalize = (a: unknown, b: unknown): unknown => {
    if (numeric(a, b)) return b;
    if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => normalize(v, b[i]));
    if (a && b && typeof a === 'object' && typeof b === 'object')
      return Object.fromEntries(
        Object.entries(a).map(([key, value]) => [
          key,
          normalize(value, (b as Record<string, unknown>)[key]),
        ])
      );
    return a;
  };
  return (
    hash(
      actual.map((row) => {
        if (!patches.some((p) => p.id === row.id)) return row;
        const target = expected.find((p) => p.id === row.id);
        if (!target) return row;
        return {
          ...row,
          quantity: numeric(row.quantity, target.quantity) ? target.quantity : row.quantity,
          avgCostNative: numeric(row.avgCostNative, target.avgCostNative)
            ? target.avgCostNative
            : row.avgCostNative,
          ibkrCash: normalize(row.ibkrCash, target.ibkrCash),
        };
      })
    ) === hash(expected)
  );
}

function syncPatches(rows: Row[], cashId: string, capture: IbkrCapture, cash: IbkrCashSnapshot) {
  const anchor = cashRow(rows, cashId);
  const securities = rows.filter((p) => ['EQUITY', 'ETF'].includes(p.asset.category));
  requireIbkr(
    rows.every((p) => p.id === anchor.id || securities.includes(p)),
    'An unsupported IBKR holding needs review'
  );
  const matched = new Set<string>();
  const patches: Patch[] = [];
  for (const holding of capture.second.positions) {
    const symbol = ibkrYahooSymbol(holding);
    const matches = securities.filter((p) =>
      p.ibkrContractId != null
        ? p.ibkrContractId === holding.contract_id
        : p.asset.symbol.toUpperCase() === symbol &&
          p.asset.providerAssetId?.toUpperCase() === symbol
    );
    requireIbkr(
      matches.length === 1,
      `${symbol}: add or resolve exactly one IBKR holding before syncing`
    );
    const row = matches[0];
    requireIbkr(
      Number.isFinite(holding.position * row.avgCostUsd) &&
        Number.isFinite(holding.position * (row.asset.currentPriceUsd ?? 0)),
      `${symbol}: position value exceeds the supported numeric range`
    );
    requireIbkr(
      !matched.has(row.id) &&
        row.asset.nativeCurrency === holding.currency &&
        row.asset.priceProvider === 'yahoo' &&
        row.asset.symbol.toUpperCase() === symbol &&
        row.asset.providerAssetId?.toUpperCase() === symbol,
      `${symbol}: contract, ticker or native currency differs`
    );
    requireIbkr(
      ['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK', 'GBP'].includes(holding.currency),
      `${symbol}: native cost currency is not supported`
    );
    matched.add(row.id);
    patches.push({
      id: row.id,
      quantity: holding.position,
      avgCostUsd: row.avgCostUsd,
      avgCostNative: holding.average_price,
      costCurrency: holding.currency,
      ibkrContractId: holding.contract_id,
      ibkrSyncedAt: new Date(capture.second.capturedAt).toISOString(),
      ibkrCash: null,
    });
  }
  for (const row of securities.filter((p) => !matched.has(p.id))) {
    requireIbkr(
      row.ibkrContractId && row.ibkrSyncedAt,
      `${row.asset.symbol}: an unlinked holding is absent from IBKR; review required`
    );
    if (row.quantity === 0) continue;
    // A missing contract can be closed only with identified executions after the last sync.
    const code = row.asset.symbol.replace(/\.(KS|KQ|T|OL|SI|TW)$/, '');
    const sold = capture.executions
      .filter(
        (e) =>
          e.symbol === code &&
          e.currency === row.asset.nativeCurrency &&
          Date.parse(e.date) > row.ibkrSyncedAt!.getTime() &&
          Date.parse(e.date) <= Date.parse(capture.second.capturedAt)
      )
      .reduce((net, e) => net + (e.side === 'SELL' ? e.quantity : -e.quantity), 0);
    requireIbkr(
      Math.abs(sold - row.quantity) < 0.000001,
      `${row.asset.symbol}: missing holding needs complete closing-sale evidence`
    );
    patches.push({
      id: row.id,
      quantity: 0,
      avgCostUsd: row.avgCostUsd,
      avgCostNative: row.avgCostNative,
      costCurrency: row.costCurrency,
      ibkrContractId: row.ibkrContractId,
      ibkrSyncedAt: new Date(capture.second.capturedAt).toISOString(),
      ibkrCash: null,
    });
  }
  return [...patches, cashPatch(anchor, cash)];
}

export const manualIbkrCashSchema = z.object({
  capturedAt: z.string().datetime(),
  balances: z
    .array(
      z.object({
        currency: z.enum(['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK', 'GBP']),
        cashBalance: z.number().finite(),
      })
    )
    .min(1)
    .max(20),
});
async function manualCash(tx: Tx, raw: unknown): Promise<IbkrCashSnapshot> {
  const input = manualIbkrCashSchema.parse(raw);
  requireIbkr(
    Date.now() - Date.parse(input.capturedAt) < 900000 &&
      Date.parse(input.capturedAt) <= Date.now() + 30000,
    'Cash edit preview expired'
  );
  requireIbkr(
    new Set(input.balances.map((b) => b.currency)).size === input.balances.length,
    'Use one balance per currency'
  );
  const rates = await tx.fxRate.findMany({
    where: {
      fromCcy: 'USD',
      toCcy: { in: input.balances.filter((b) => b.currency !== 'USD').map((b) => b.currency) },
    },
  });
  const balances = input.balances.map((b) => {
    const fx = rates.find((r) => r.toCcy === b.currency);
    requireIbkr(
      b.currency === 'USD' ||
        (fx &&
          Number.isFinite(fx.rate) &&
          fx.rate > 0 &&
          Date.now() - fx.timestamp.getTime() < 48 * 3600000 &&
          fx.timestamp.getTime() <= Date.now() + 300000),
      `A recent USD/${b.currency} rate is required for this cash edit`
    );
    return { ...b, fxRateToUsd: b.currency === 'USD' ? 1 : 1 / fx!.rate };
  });
  const netCashUsd = balances.reduce((sum, b) => sum + b.cashBalance * b.fxRateToUsd, 0);
  requireIbkr(Number.isFinite(netCashUsd), 'Cash conversion exceeds the supported numeric range');
  return {
    capturedAt: input.capturedAt,
    source: 'manual',
    balances,
    baseCurrency: 'USD',
    baseCash: netCashUsd,
    baseToUsd: 1,
    netCashUsd,
  };
}

export async function reconcileIbkr(
  userId: string,
  options: {
    kind: 'sync' | 'cash';
    cashPositionId: string;
    input: unknown;
    expectedState?: string;
  }
) {
  const source =
    options.kind === 'sync'
      ? validateIbkrCapture(options.input).capture
      : manualIbkrCashSchema.parse(options.input);
  const captureHash = hash({ kind: options.kind, cashPositionId: options.cashPositionId, source });
  return navTransaction(async (tx) => {
    const prior = await tx.ibkrSyncRun.findUnique({
      where: { userId_captureHash: { userId, captureHash } },
    });
    const rows = await rowsFor(tx, userId);
    const before = rows.map(checkpoint);
    if (prior) {
      requireIbkr(
        !prior.restoredAt && hash(before) === hash(prior.after),
        'This capture was restored or superseded; read IBKR again'
      );
      return {
        applied: true,
        unchanged: true,
        runId: prior.id,
        review: [],
        cash: rows.find((p) => p.id === options.cashPositionId)?.ibkrCash,
        backup: { version: 1, runId: prior.id, before: prior.before, after: prior.after },
      };
    }
    const cash =
      options.kind === 'sync' ? validateIbkrCapture(source).cash : await manualCash(tx, source);
    const patches =
      options.kind === 'sync'
        ? syncPatches(rows, options.cashPositionId, source as IbkrCapture, cash)
        : [cashPatch(cashRow(rows, options.cashPositionId), cash)];
    const after = before.map((p) =>
      afterCheckpoint(
        p,
        patches.find((patch) => patch.id === p.id)
      )
    );
    const state = hash({ before, after });
    const projected = await projectNativeCosts(
      rows.map((p) => ({ ...p, ...patches.find((patch) => patch.id === p.id), asset: p.asset }))
    );
    const review = patches.map((patch) => {
      const old = rows.find((p) => p.id === patch.id)!;
      const next = projected.find((p) => p.id === patch.id)!;
      return {
        id: patch.id,
        symbol: old.asset.symbol,
        cash: isIbkrCash(old),
        previousQuantity: old.quantity,
        quantity: patch.quantity,
        previousAvgCostNative: old.avgCostNative,
        avgCostNative: patch.avgCostNative,
        costCurrency: patch.costCurrency,
        avgCostUsd: next.avgCostUsd,
        recordedAvgCostUsd: old.avgCostUsd,
      };
    });
    const backup = { version: 1, captureHash, before, after, source };
    const financial = (list: Checkpoint[]) =>
      list.map(({ ibkrSyncedAt: _time, ibkrCash, quantity, avgCostNative, ...p }) => ({
        ...p,
        quantity: ibkrCash ? null : quantity,
        avgCostNative: avgCostNative == null ? null : Number(avgCostNative.toPrecision(15)),
        ibkrCash: ibkrCash
          ? (ibkrCash as unknown as IbkrCashSnapshot).balances
              .map(({ currency, cashBalance }) => ({ currency, cashBalance }))
              .sort((a, b) => a.currency.localeCompare(b.currency))
          : null,
      }));
    const unchanged = hash(financial(before)) === hash(financial(after));
    if (!options.expectedState) return { applied: false, unchanged, state, backup, review, cash };
    requireIbkr(
      options.expectedState === state,
      'IBKR records or FX changed after preview; preview again'
    );
    for (const patch of patches) {
      const row = rows.find((p) => p.id === patch.id)!;
      const { id, ibkrCash, ibkrSyncedAt, ...data } = patch;
      await tx.position.update({
        where: { id, userId },
        data: {
          ...data,
          ibkrSyncedAt: ibkrSyncedAt ? new Date(ibkrSyncedAt) : null,
          ibkrCash: ibkrCash ? json(ibkrCash) : Prisma.DbNull,
          ...calculatePositionValue({
            quantity: data.quantity,
            avgCostUsd: data.avgCostUsd,
            currentPriceUsd: row.asset.currentPriceUsd,
          }),
        },
      });
    }
    const readback = (await rowsFor(tx, userId)).map(checkpoint);
    requireIbkr(sameWrittenState(readback, after, patches), 'IBKR reconciliation readback differs');
    const run = await tx.ibkrSyncRun.create({
      data: {
        userId,
        captureHash,
        kind: options.kind,
        source: json(source),
        before: json(before),
        after: json(readback),
      },
    });
    return {
      applied: true,
      unchanged,
      state,
      runId: run.id,
      backup: { ...backup, runId: run.id },
      review,
      cash,
    };
  });
}

/** Restore server-held checkpoints; a downloaded backup never grants mutation authority. */
export async function restoreIbkr(userId: string, runId: string, apply: boolean) {
  return navTransaction(async (tx) => {
    const run = await tx.ibkrSyncRun.findFirst({ where: { id: runId, userId } });
    requireIbkr(run && !run.restoredAt, 'IBKR checkpoint is unavailable or already restored');
    const rows = await rowsFor(tx, userId);
    requireIbkr(
      hash(rows.map(checkpoint)) === hash(run.after),
      'IBKR records changed after this checkpoint; restoration needs review'
    );
    const before = run.before as unknown as Checkpoint[];
    if (apply) {
      for (const saved of before) {
        const row = rows.find((p) => p.id === saved.id)!;
        await tx.position.update({
          where: { id: saved.id, userId },
          data: {
            quantity: saved.quantity,
            avgCostUsd: saved.avgCostUsd,
            avgCostNative: saved.avgCostNative,
            costCurrency: saved.costCurrency,
            ibkrContractId: saved.ibkrContractId,
            ibkrSyncedAt: saved.ibkrSyncedAt ? new Date(saved.ibkrSyncedAt) : null,
            ibkrCash: saved.ibkrCash === null ? Prisma.DbNull : json(saved.ibkrCash),
            ...calculatePositionValue({
              quantity: saved.quantity,
              avgCostUsd: saved.avgCostUsd,
              currentPriceUsd: row.asset.currentPriceUsd,
            }),
          },
        });
      }
      requireIbkr(
        hash((await rowsFor(tx, userId)).map(checkpoint)) === hash(before),
        'IBKR restoration readback differs'
      );
      await tx.ibkrSyncRun.update({
        where: { id: run.id, userId },
        data: { restoredAt: new Date() },
      });
    }
    const after = run.after as unknown as Checkpoint[];
    const review = before.map((saved) => {
      const current = after.find((p) => p.id === saved.id)!;
      return {
        id: saved.id,
        symbol: saved.asset.symbol,
        cash: saved.asset.category === 'CASH',
        previousQuantity: current.quantity,
        quantity: saved.quantity,
        previousAvgCostNative: current.avgCostNative,
        avgCostNative: saved.avgCostNative,
        costCurrency: saved.costCurrency ?? current.costCurrency,
      };
    });
    return { applied: apply, runId: run.id, before, after: run.after, review };
  });
}

export async function ibkrRuns(userId: string) {
  return prisma.ibkrSyncRun.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { id: true, kind: true, createdAt: true, restoredAt: true },
  });
}
