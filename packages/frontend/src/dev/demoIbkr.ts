import type { FxRate, IbkrCashSnapshot, Position, PositionHistoryEntry } from '@foliobuddy/shared';
import type { IbkrSyncRun } from '@/lib/types';
import { isIbkrCashPosition } from '@/components/portfolio/ibkrCash';

type Run = IbkrSyncRun & { source: string; before: Position[]; after: Position[]; history: string };
let runs: Run[] = [];
export function resetDemoIbkr() {
  runs = [];
}

/** Cash edits are stateful in the disposable demo; broker validation uses the real sandbox. */
export function handleDemoIbkr(
  path: string,
  method: string,
  body: any,
  context: {
    positions: Position[];
    history: PositionHistoryEntry[];
    rates: FxRate[];
    save: (rows: Position[]) => void;
    newId: () => string;
  }
): Response | null {
  if (!path.startsWith('/api/ibkr/')) return null;
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  const ibkr = context.positions.filter(
    (p) => p.storageType === 'BROKERAGE' && p.storageLocation === 'IBKR' && !p.custodyOf
  );
  const history = JSON.stringify(
    context.history.filter((h) => ibkr.some((p) => p.id === h.positionId))
  );
  if (path === '/api/ibkr/runs' && method === 'GET')
    return json(
      runs.map(({ id, kind, createdAt, restoredAt }) => ({ id, kind, createdAt, restoredAt }))
    );
  if (path === '/api/ibkr/cash-position' && method === 'POST') {
    const cash = ibkr.filter(isIbkrCashPosition);
    return cash.length === 1
      ? json(cash[0])
      : json({ error: 'Use the seeded IBKR cash account in this demo' }, 409);
  }
  if (path === '/api/ibkr/restore' && method === 'POST') {
    const run = runs.find((r) => r.id === body.runId && !r.restoredAt);
    if (!run || JSON.stringify(ibkr) !== JSON.stringify(run.after) || history !== run.history)
      return json(
        { error: 'IBKR records changed after this checkpoint; restoration needs review' },
        409
      );
    if (body.action === 'apply') {
      context.save(context.positions.map((p) => run.before.find((b) => b.id === p.id) ?? p));
      run.restoredAt = new Date().toISOString();
    }
    return json({
      applied: body.action === 'apply',
      runId: run.id,
      before: run.before,
      after: run.after,
      review: run.before.map((p) => ({
        id: p.id,
        symbol: p.asset.symbol,
        cash: isIbkrCashPosition(p),
        previousQuantity: run.after.find((a) => a.id === p.id)!.quantity,
        quantity: p.quantity,
        previousAvgCostNative: null,
        avgCostNative: null,
        costCurrency: null,
      })),
    });
  }
  if (path !== '/api/ibkr/reconcile' || method !== 'POST')
    return json({ error: 'Unsupported IBKR demo operation' }, 400);
  if (body.kind === 'sync')
    return json(
      {
        error:
          'Verified broker captures require the real local sandbox. The demo supports currency balance edits.',
      },
      409
    );
  const position = ibkr.find(
    (p) => p.id === body.cashPositionId && isIbkrCashPosition(p) && p.asset.symbol === 'USD'
  );
  if (!position || ibkr.filter(isIbkrCashPosition).length !== 1)
    return json({ error: 'Select the owned IBKR USD cash account' }, 409);
  const input = body.input as {
    capturedAt?: string;
    balances?: { currency: string; cashBalance: number }[];
  };
  if (
    !input ||
    !Number.isFinite(Date.parse(input.capturedAt ?? '')) ||
    Math.abs(Date.now() - Date.parse(input.capturedAt!)) > 900000 ||
    !input.balances?.length ||
    input.balances.length > 20 ||
    new Set(input.balances.map((b) => b.currency)).size !== input.balances.length
  )
    return json({ error: 'Enter one valid balance per currency using a fresh preview' }, 400);
  const balances = input.balances.map((b) => ({
    ...b,
    fxRateToUsd:
      b.currency === 'USD'
        ? 1
        : 1 / (context.rates.find((r) => r.toCcy === b.currency)?.rate ?? NaN),
  }));
  if (
    balances.some(
      (b) =>
        !Number.isFinite(b.cashBalance) || !Number.isFinite(b.fxRateToUsd) || b.fxRateToUsd <= 0
    )
  )
    return json({ error: 'A valid currency and balance are required' }, 400);
  const netCashUsd = balances.reduce((sum, b) => sum + b.cashBalance * b.fxRateToUsd, 0);
  const cash: IbkrCashSnapshot = {
    source: 'manual',
    capturedAt: input.capturedAt!,
    balances,
    baseCurrency: 'USD',
    baseCash: netCashUsd,
    baseToUsd: 1,
    netCashUsd,
  };
  const source = JSON.stringify({ input, id: position.id });
  const prior = runs.find((r) => r.source === source);
  if (prior) {
    if (
      prior.restoredAt ||
      JSON.stringify(ibkr) !== JSON.stringify(prior.after) ||
      history !== prior.history
    )
      return json({ error: 'This capture was restored or superseded; preview again' }, 409);
    return json({
      applied: true,
      unchanged: true,
      runId: prior.id,
      backup: prior,
      cash,
      review: [],
    });
  }
  const state = JSON.stringify({ ibkr, history });
  if (body.action === 'apply' && body.expectedState !== state)
    return json({ error: 'IBKR records changed after preview' }, 409);
  const updated: Position = {
    ...position,
    quantity: netCashUsd,
    avgCostUsd: 1,
    avgCostNative: null,
    costCurrency: null,
    ibkrCash: cash,
    ibkrSyncedAt: input.capturedAt!,
    marketValueUsd: netCashUsd,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
    updatedAt: new Date().toISOString(),
  };
  const after = ibkr.map((p) => (p.id === position.id ? updated : p));
  const unchanged =
    JSON.stringify(
      position.ibkrCash?.balances.map(({ currency, cashBalance }) => ({ currency, cashBalance }))
    ) === JSON.stringify(balances.map(({ currency, cashBalance }) => ({ currency, cashBalance })));
  const backup = { version: 1, before: structuredClone(ibkr), after: structuredClone(after) };
  let runId: string | undefined;
  if (body.action === 'apply') {
    runId = context.newId();
    runs.unshift({
      id: runId,
      kind: 'cash',
      createdAt: new Date().toISOString(),
      restoredAt: null,
      source,
      ...backup,
      history,
    });
    context.save(context.positions.map((p) => (p.id === position.id ? updated : p)));
  }
  return json({
    state,
    backup,
    applied: body.action === 'apply',
    unchanged,
    runId,
    cash,
    review: [
      {
        id: position.id,
        symbol: 'USD',
        cash: true,
        previousQuantity: position.quantity,
        quantity: netCashUsd,
        previousAvgCostNative: null,
        avgCostNative: null,
        costCurrency: null,
        recordedAvgCostUsd: 1,
        avgCostUsd: 1,
      },
    ],
  });
}
