import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type NativeReconciliationResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { formatTrimmedNumber, formatQuantity } from '@/lib/utils';

export function NativeCostReconciliation() {
  const [mode, setMode] = useState('reconcile');
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<NativeReconciliationResult | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [backupSaved, setBackupSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { formatPrice, maskMoney } = useMoneyFormatter();
  const mutation = useMutation({ mutationFn: api.reconcileNativeCosts });
  const reset = () => {
    setPreview(null);
    setDownloaded(false);
    setBackupSaved(false);
    setError(null);
  };

  async function run(apply: boolean) {
    setError(null);
    try {
      const parsed: unknown = JSON.parse(text);
      const result = await mutation.mutateAsync(
        mode === 'restore'
          ? { action: apply ? 'restore' : 'restore-preview', backup: parsed }
          : {
              action: apply ? 'apply' : 'preview',
              input: parsed,
              ...(apply ? { expectedState: preview?.state } : {}),
            }
      );
      setPreview(result);
      if (apply) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['positions'] }),
          queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
        ]);
        toast.success(
          mode === 'restore'
            ? 'Original cost records restored'
            : 'Native cost reconciliation applied'
        );
      } else {
        setDownloaded(false);
        setBackupSaved(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reconciliation failed');
    }
  }

  function downloadBackup() {
    if (!preview?.backup) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(preview.backup, null, 2)], { type: 'application/json' })
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `foliobuddy-native-cost-backup-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
  }

  return (
    <div className="space-y-4">
      <Tabs
        value={mode}
        onValueChange={(value) => {
          setMode(value);
          setText('');
          reset();
        }}
      >
        <TabsList>
          <TabsTrigger value="reconcile" disabled={mutation.isPending}>
            Reconcile costs
          </TabsTrigger>
          <TabsTrigger value="restore" disabled={mutation.isPending}>
            Restore backup
          </TabsTrigger>
        </TabsList>
      </Tabs>
      <p className="text-sm text-muted-foreground">
        {mode === 'restore'
          ? 'Restore the native fields from a saved repair backup. Later position changes require review before restoration.'
          : 'Use a verified IBKR capture to save native weighted-average costs. Existing USD entries remain available. Included broker orders must match your recorded dates and share quantities.'}
      </p>
      <label className="text-sm font-medium block">
        {mode === 'restore' ? 'Backup file' : 'Broker capture file'}
        <input
          type="file"
          accept=".json,application/json"
          disabled={mutation.isPending}
          className="block mt-2 w-full text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            try {
              if (file.size > 800000)
                throw new Error('This file is too large; split the repair into smaller batches');
              setText(await file.text());
              reset();
            } catch (e) {
              setError(e instanceof Error ? e.message : 'File could not be read');
            }
          }}
        />
      </label>
      <Textarea
        aria-label="Reconciliation JSON"
        value={text}
        rows={5}
        className="font-mono text-xs"
        disabled={mutation.isPending}
        onChange={(event) => {
          setText(event.target.value);
          reset();
        }}
        placeholder={
          mode === 'restore' ? 'Paste a saved repair backup' : 'Paste a verified broker capture'
        }
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {!preview?.applied && (
        <Button
          type="button"
          variant="outline"
          disabled={!text.trim() || mutation.isPending}
          onClick={() => void run(false)}
        >
          {mutation.isPending ? 'Checking…' : 'Preview changes'}
        </Button>
      )}
      {preview && (
        <div className="space-y-3">
          {preview.review.map((row) => (
            <div key={row.symbol} className="rounded-lg border p-3 space-y-1 text-sm">
              <p className="font-semibold">
                {row.symbol} · {formatQuantity(row.quantity, 'EQUITY')} shares
              </p>
              <p>
                Native average:{' '}
                {row.avgCostNative != null
                  ? maskMoney(`${row.costCurrency} ${formatTrimmedNumber(row.avgCostNative, 8)}`)
                  : 'Return to recorded USD cost'}
              </p>
              {row.avgCostUsd != null && (
                <p>Current USD average: {formatPrice(row.avgCostUsd, 'USD')}</p>
              )}
              <p className="text-muted-foreground">
                Recorded USD average retained: {formatPrice(row.recordedAvgCostUsd, 'USD')}
              </p>
              {row.costFxAsOf && (
                <p className="text-xs text-muted-foreground">
                  FX checked {new Date(row.costFxAsOf).toLocaleString()}
                </p>
              )}
              {row.nativeHistoryRows !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {row.nativeHistoryRows === 0 && !row.initialRowAdded
                    ? 'Historical entries left unchanged'
                    : `${row.nativeHistoryRows} existing history rows verified${row.initialRowAdded ? ' · original buy added from broker evidence' : ''}`}
                </p>
              )}
            </div>
          ))}
          {preview.applied ? (
            <p role="status" className="text-sm font-medium">
              {mode === 'restore' ? 'Restored and verified.' : 'Applied and verified.'}
            </p>
          ) : (
            <>
              {mode === 'reconcile' && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadBackup}
                    disabled={mutation.isPending}
                  >
                    Download private backup
                  </Button>
                  {downloaded && (
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={backupSaved}
                        onCheckedChange={(checked) => setBackupSaved(checked === true)}
                        disabled={mutation.isPending}
                      />
                      I saved the backup file
                    </label>
                  )}
                </>
              )}
              <p className="text-xs text-muted-foreground">
                All rows are checked again when applying. A changed position stops the entire
                repair.
              </p>
              <Button
                type="button"
                disabled={mutation.isPending || (mode === 'reconcile' && !backupSaved)}
                onClick={() => void run(true)}
              >
                {mutation.isPending
                  ? 'Applying…'
                  : mode === 'restore'
                    ? 'Restore reviewed records'
                    : 'Apply reviewed changes'}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
