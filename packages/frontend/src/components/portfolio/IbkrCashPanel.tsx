import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type IbkrReconciliationResult, type Position } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { usePositions } from '@/hooks/usePortfolio';
import { formatQuantity, formatDateTime, formatTrimmedNumber } from '@/lib/utils';
import { isNonNegativeNumberInput } from '@/lib/formValidation';
import { isIbkrCashPosition } from './ibkrCash';
import { IbkrSyncButton } from './IbkrSyncButton';
import { IbkrBackgroundSync } from './IbkrBackgroundSync';
import { Plus, Trash2 } from 'lucide-react';

const CURRENCIES = ['USD', 'SGD', 'JPY', 'TWD', 'KRW', 'NOK', 'GBP'];
type BalanceInput = { key: number; currency: string; direction: 'cash' | 'debt'; amount: string };
const balanceInputs = (position: Position, cash = position.ibkrCash): BalanceInput[] =>
  (cash?.balances ?? [{ currency: 'USD', cashBalance: position.quantity }]).map((b, key) => ({
    key,
    currency: b.currency,
    direction: b.cashBalance < 0 ? 'debt' : 'cash',
    amount: String(Math.abs(b.cashBalance)),
  }));

/** Only mounts for owned IBKR fiat cash; never changes another broker's form. */
export function IbkrCashPanel({
  position,
  onSuccess,
}: {
  position: Position;
  onSuccess?: () => void;
}) {
  if (!isIbkrCashPosition(position)) return null;
  return <IbkrCashEditor position={position} onSuccess={onSuccess} />;
}

function IbkrCashEditor({
  position: initialPosition,
  onSuccess,
}: {
  position: Position;
  onSuccess?: () => void;
}) {
  const { data: positions } = usePositions();
  const position = positions?.find((row) => row.id === initialPosition.id) ?? initialPosition;
  const { formatCurrency, formatPrice, maskMoney } = useMoneyFormatter();
  const native = (value: number, currency: string) =>
    maskMoney(`${currency} ${formatTrimmedNumber(value, 8)}`);
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'view' | 'cash' | 'sync'>('view');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<BalanceInput[]>(() => balanceInputs(position));
  const [preview, setPreview] = useState<IbkrReconciliationResult | null>(null);
  const [reviewInput, setReviewInput] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [backupSaved, setBackupSaved] = useState(false);
  const [restoreId, setRestoreId] = useState<string | null>(null);
  const [restoreReady, setRestoreReady] = useState(false);
  const [restorePreview, setRestorePreview] = useState<Awaited<
    ReturnType<typeof api.restoreIbkr>
  > | null>(null);
  const mutation = useMutation({ mutationFn: api.reconcileIbkr });
  const restore = useMutation({
    mutationFn: ({ id, apply }: { id: string; apply: boolean }) =>
      api.restoreIbkr(id, apply ? 'apply' : 'preview'),
  });
  const runs = useQuery({ queryKey: ['ibkr-runs'], queryFn: api.getIbkrRuns });
  const busy = mutation.isPending || restore.isPending;
  const cash =
    preview?.applied &&
    (!position.ibkrCash ||
      Date.parse(preview.cash.capturedAt) > Date.parse(position.ibkrCash.capturedAt))
      ? preview.cash
      : position.ibkrCash;
  const clear = () => {
    setPreview(null);
    setReviewInput(null);
    setBackupSaved(false);
    setError(null);
  };
  const changeRow = (key: number, value: Partial<BalanceInput>) => {
    setRows((list) => list.map((row) => (row.key === key ? { ...row, ...value } : row)));
    clear();
  };
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['positions'] }),
      queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
      queryClient.invalidateQueries({ queryKey: ['ibkr-runs'] }),
    ]);
  }
  async function reconcile(apply: boolean) {
    setError(null);
    try {
      const input = apply
        ? reviewInput
        : mode === 'sync'
          ? JSON.parse(text)
          : {
              capturedAt: new Date().toISOString(),
              balances: rows.map((row) => ({
                currency: row.currency,
                cashBalance: Number(row.amount) * (row.direction === 'debt' ? -1 : 1),
              })),
            };
      if (
        !apply &&
        mode === 'cash' &&
        (rows.some((row) => !isNonNegativeNumberInput(row.amount)) ||
          new Set(rows.map((row) => row.currency)).size !== rows.length)
      )
        throw new Error('Enter one valid balance per currency');
      const result = await mutation.mutateAsync({
        action: apply ? 'apply' : 'preview',
        kind: mode === 'sync' ? 'sync' : 'cash',
        cashPositionId: position.id,
        input,
        ...(apply ? { expectedState: preview?.state } : {}),
      });
      setPreview(result);
      setReviewInput(input);
      setBackupSaved(false);
      if (result.applied) {
        await refresh();
        toast.success('IBKR records saved and verified');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'IBKR reconciliation failed');
    }
  }
  function download() {
    if (!preview) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(preview.backup, null, 2)], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `foliobuddy-ibkr-backup-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // The browser must resolve the blob before its backing URL is released.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setBackupSaved(true);
  }
  async function restoreRun(apply: boolean) {
    if (!restoreId) return;
    setError(null);
    try {
      const result = await restore.mutateAsync({ id: restoreId, apply });
      if (apply) {
        setRestoreReady(false);
        setRestorePreview(null);
        setRestoreId(null);
        clear();
        setMode('view');
        await refresh();
        toast.success('IBKR checkpoint restored');
      } else {
        setRestoreReady(true);
        setRestorePreview(result);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Checkpoint restoration failed');
    }
  }
  return (
    <section aria-label="IBKR currency cash and debt" className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">IBKR cash &amp; debt</h3>
        <p className="text-sm text-muted-foreground">
          Currency balances contribute one net USD amount to your portfolio.
        </p>
      </div>
      <div className="flex items-baseline justify-between gap-3 border-b pb-3">
        <span className="text-sm text-muted-foreground">Net cash (USD)</span>
        <span
          className={`font-mono text-xl font-semibold ${(cash?.netCashUsd ?? position.marketValueUsd ?? 0) < 0 ? 'text-loss' : ''}`}
        >
          {formatCurrency(cash?.netCashUsd ?? position.marketValueUsd, 'USD', 2)}
        </span>
      </div>
      {cash ? (
        <>
          <dl className="divide-y">
            {cash.balances.map((balance) => (
              <div
                key={balance.currency}
                className="flex flex-wrap items-center justify-between gap-2 py-3"
              >
                <dt className="flex items-center gap-2 text-sm">
                  <span className="font-medium">{balance.currency}</span>
                  <span
                    className={`text-xs ${balance.cashBalance < 0 ? 'text-loss' : 'text-muted-foreground'}`}
                  >
                    {balance.cashBalance < 0 ? 'Debt' : 'Cash'}
                  </span>
                </dt>
                <dd className="text-right font-mono text-sm">
                  <p>{native(balance.cashBalance, balance.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(balance.cashBalance * balance.fxRateToUsd, 'USD', 2)}
                  </p>
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            {cash.source === 'ibkr' ? 'Broker capture' : 'Manual balances'} ·{' '}
            {formatDateTime(cash.capturedAt)}.
            {cash.source === 'ibkr' &&
              ' Net cash uses IBKR’s reported total. Currency conversions can differ slightly because FX quotes refresh separately.'}
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Currency balances have not been reconciled yet. The recorded USD cash is shown above.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <IbkrSyncButton position={position} disabled={busy} />
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setRows(balanceInputs(position, cash));
            setMode('cash');
            clear();
          }}
        >
          Edit currency balances
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setMode('sync');
            clear();
          }}
        >
          Import broker capture
        </Button>
      </div>
      {mode === 'cash' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Enter the amount and choose Cash or Debt. USD conversion uses recent exchange rates.
          </p>
          {rows.map((row, index) => (
            <div
              key={row.key}
              className="grid grid-cols-[1fr_1fr_auto] gap-2 rounded-md border p-3"
            >
              <Select
                value={row.currency}
                disabled={busy}
                onValueChange={(currency) => changeRow(row.key, { currency })}
              >
                <SelectTrigger aria-label={`Currency ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.direction}
                disabled={busy}
                onValueChange={(direction) =>
                  changeRow(row.key, { direction: direction as 'cash' | 'debt' })
                }
              >
                <SelectTrigger aria-label={`Balance type ${index + 1}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="debt">Debt</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={`Remove ${row.currency} balance`}
                disabled={busy || rows.length === 1}
                onClick={() => {
                  setRows((list) => list.filter((b) => b.key !== row.key));
                  clear();
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <label className="col-span-3 text-xs text-muted-foreground">
                Amount ({row.currency})
                <FormattedNumberInput
                  aria-label={`Amount ${row.currency}`}
                  value={row.amount}
                  disabled={busy}
                  onValueChange={(amount) => changeRow(row.key, { amount })}
                  className="mt-1"
                />
              </label>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            disabled={busy || rows.length >= CURRENCIES.length}
            onClick={() => {
              const currency = CURRENCIES.find((c) => !rows.some((row) => row.currency === c));
              if (currency) {
                setRows((list) => [
                  ...list,
                  {
                    key: Math.max(...list.map((r) => r.key)) + 1,
                    currency,
                    direction: 'cash',
                    amount: '0',
                  },
                ]);
                clear();
              }
            }}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add currency
          </Button>
        </div>
      )}
      {mode === 'sync' && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Use a verified capture with two broker reads. Quantities, native averages and cash will
            be reconciled together. Your transaction history remains available.
          </p>
          <Textarea
            aria-label="IBKR sync capture JSON"
            rows={5}
            className="font-mono text-xs"
            value={text}
            disabled={busy}
            onChange={(event) => {
              setText(event.target.value);
              clear();
            }}
            placeholder="Paste the verified IBKR capture"
          />
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {mode !== 'view' && !preview?.applied && (
        <Button
          type="button"
          variant="outline"
          disabled={busy || (mode === 'sync' && !text.trim())}
          onClick={() => void reconcile(false)}
        >
          {busy ? 'Checking…' : 'Preview IBKR changes'}
        </Button>
      )}
      {preview && (
        <div className="space-y-3 border-t pt-3">
          {preview.review.map((row) => (
            <div key={row.id} className="space-y-1 text-sm">
              <p className="font-medium">{row.cash ? 'Net cash (USD)' : row.symbol}</p>
              <p>
                {row.cash ? (
                  <>
                    {formatCurrency(row.previousQuantity, 'USD', 2)} →{' '}
                    {formatCurrency(row.quantity, 'USD', 2)}
                  </>
                ) : (
                  <>
                    {formatQuantity(row.previousQuantity, 'EQUITY')} →{' '}
                    {formatQuantity(row.quantity, 'EQUITY')} shares
                  </>
                )}
              </p>
              {!row.cash && (
                <p className="text-xs text-muted-foreground">
                  Native average:{' '}
                  {row.previousAvgCostNative == null
                    ? 'Not saved'
                    : native(row.previousAvgCostNative, row.costCurrency ?? 'USD')}
                  {' → '}
                  {row.avgCostNative == null
                    ? 'Not saved'
                    : native(row.avgCostNative, row.costCurrency ?? 'USD')}
                  . Recorded USD average retained: {formatPrice(row.recordedAvgCostUsd, 'USD')}.
                </p>
              )}
            </div>
          ))}
          <p className="text-sm font-medium">
            Reviewed net cash: {formatCurrency(preview.cash.netCashUsd, 'USD', 2)}
          </p>
          <dl className="space-y-1 text-sm">
            {preview.cash.balances.map((balance) => (
              <div key={balance.currency} className="flex flex-wrap justify-between gap-2">
                <dt>
                  {balance.currency} {balance.cashBalance < 0 ? 'debt' : 'cash'}
                </dt>
                <dd className="font-mono">{native(balance.cashBalance, balance.currency)}</dd>
              </div>
            ))}
          </dl>
          {preview.applied ? (
            <p role="status" className="text-sm">
              Saved and verified. {preview.unchanged && 'Balances and holdings are unchanged.'}
            </p>
          ) : (
            <>
              <Button type="button" variant="outline" disabled={busy} onClick={download}>
                Download IBKR checkpoint
              </Button>
              <p className="text-xs text-muted-foreground">
                A private checkpoint is also saved on the server when you apply. Later edits stop
                restoration until reviewed.
              </p>
              <Button
                type="button"
                disabled={busy || !backupSaved}
                onClick={() => void reconcile(true)}
              >
                Apply IBKR changes
              </Button>
            </>
          )}
        </div>
      )}
      {runs.isError && (
        <p role="alert" className="text-sm text-destructive">
          IBKR checkpoints could not be loaded.
        </p>
      )}
      {!!runs.data?.length && (
        <div className="space-y-2 border-t pt-3">
          <h4 className="text-sm font-medium">Recent checkpoints</h4>
          {runs.data.slice(0, 3).map((run) => (
            <div key={run.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span>
                {formatDateTime(run.createdAt)} ·{' '}
                {run.kind === 'cash' ? 'Cash edit' : 'Broker sync'}
                {run.restoredAt && ' · Restored'}
              </span>
              {!run.restoredAt && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setRestoreId(run.id);
                    setRestoreReady(false);
                    setRestorePreview(null);
                  }}
                >
                  Restore…
                </Button>
              )}
            </div>
          ))}
          {restoreId && (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-sm">
                Restore the IBKR holdings and cash from before this checkpoint. The server checks
                that there have been no later changes.
              </p>
              {restorePreview?.review.map((row) => (
                <p key={row.id} className="text-sm">
                  {row.cash ? 'Net cash (USD)' : row.symbol}:{' '}
                  {row.cash ? (
                    <>
                      {formatCurrency(row.previousQuantity, 'USD', 2)} →{' '}
                      {formatCurrency(row.quantity, 'USD', 2)}
                    </>
                  ) : (
                    <>
                      {formatQuantity(row.previousQuantity, 'EQUITY')} →{' '}
                      {formatQuantity(row.quantity, 'EQUITY')} shares; native average{' '}
                      {row.previousAvgCostNative == null
                        ? 'Not saved'
                        : native(row.previousAvgCostNative, row.costCurrency ?? 'USD')}
                      {' → '}
                      {row.avgCostNative == null
                        ? 'Not saved'
                        : native(row.avgCostNative, row.costCurrency ?? 'USD')}
                    </>
                  )}
                </p>
              ))}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void restoreRun(false)}
                >
                  Check restoration
                </Button>
                {restoreReady && (
                  <Button type="button" disabled={busy} onClick={() => void restoreRun(true)}>
                    Restore checked checkpoint
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setRestoreId(null)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <IbkrBackgroundSync position={position} />
      {onSuccess && (
        <Button type="button" variant="ghost" disabled={busy} onClick={onSuccess}>
          Done
        </Button>
      )}
    </section>
  );
}
