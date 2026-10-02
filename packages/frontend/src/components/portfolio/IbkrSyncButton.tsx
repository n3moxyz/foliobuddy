import { useId, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Position } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime, formatQuantity, formatNativePrice, formatNativeAmount } from '@/lib/utils';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { isOwnedIbkrPosition } from './ibkrOwnership';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';
import {
  disconnectHelper,
  getDirectSyncState,
  hasHelperConnection,
  isDirectSyncResultCurrent,
  isSyncBusy,
  pairHelper,
  recordedBrokerUpdate,
  subscribeDirectSync,
  syncIbkrDirect,
  type SyncPhase,
} from './ibkrDirectSync';

const phaseLabels: Record<SyncPhase, string> = {
  idle: 'Ready to sync',
  checking: 'Checking your IBKR portfolio…',
  reading: 'Reading IBKR twice…',
  retrying: 'Waiting for IBKR’s currency totals to settle…',
  reviewing: 'Checking shares, costs and cash…',
  backup: 'Saving and verifying your backup…',
  saving: 'Updating your IBKR records…',
  verifying: 'Verifying the saved records…',
  done: 'IBKR synced and verified',
  error: 'Sync needs attention',
};

export function IbkrSyncButton({
  position,
  disabled = false,
}: {
  position: Position;
  disabled?: boolean;
}) {
  if (!isOwnedIbkrPosition(position)) return null;
  return <IbkrSyncControl position={position} disabled={disabled} />;
}

function IbkrSyncControl({ position, disabled }: { position: Position; disabled: boolean }) {
  const queryClient = useQueryClient();
  const { maskMoney } = useMoneyFormatter();
  const fieldId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const state = useSyncExternalStore(
    subscribeDirectSync,
    () => getDirectSyncState(position.id),
    () => getDirectSyncState(position.id)
  );
  const connected = useSyncExternalStore(
    subscribeDirectSync,
    () => hasHelperConnection(position.id),
    () => false
  );
  const busy = isSyncBusy(state.phase);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const last = recordedBrokerUpdate(position);
  const resultIsCurrent = isDirectSyncResultCurrent(state, position);
  const capturedAt = resultIsCurrent ? state.capturedAt : last.time;
  const visiblePhase = state.phase === 'done' && !resultIsCurrent ? 'idle' : state.phase;
  // Later portfolio refreshes can invalidate a displayed result, but must not
  // turn a completed operation's close button into another sync action.
  const completed = state.phase === 'done';
  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['positions'] }),
      queryClient.invalidateQueries({ queryKey: ['portfolio'] }),
      queryClient.invalidateQueries({ queryKey: ['ibkr-runs'] }),
    ]);
  }
  async function sync() {
    const session = captureAuthSession();
    setError(null);
    setOpen(true);
    try {
      const result = await syncIbkrDirect(position.id);
      if (!isAuthSessionCurrent(session)) return;
      toast.success('IBKR synced and verified', {
        description: result.unchanged
          ? 'Shares, native cost bases and currency balances are unchanged.'
          : 'Your IBKR shares, cost bases and currency balances are up to date.',
      });
    } catch (cause) {
      if (!isAuthSessionCurrent(session)) return;
      toast.error('IBKR sync stopped', {
        description: cause instanceof Error ? cause.message : 'Check the sync details.',
      });
    } finally {
      if (isAuthSessionCurrent(session)) await refresh();
    }
  }
  async function connect() {
    const session = captureAuthSession();
    setConnecting(true);
    setError(null);
    try {
      await pairHelper(position.id, code);
      if (!isAuthSessionCurrent(session)) return;
      setCode('');
      await sync();
    } catch (cause) {
      if (!isAuthSessionCurrent(session)) return;
      setError(cause instanceof Error ? cause.message : 'This Mac could not connect.');
    } finally {
      if (isAuthSessionCurrent(session)) setConnecting(false);
    }
  }
  function configure() {
    setCode('');
    setError(null);
    setOpen(true);
  }
  return (
    <>
      <div className="inline-flex items-center gap-1">
        <Button
          ref={triggerRef}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || connecting}
          aria-busy={busy}
          onClick={() => (busy ? configure() : connected ? void sync() : configure())}
        >
          {busy ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <RefreshCw className="mr-1 h-4 w-4" />
          )}
          {busy ? 'Syncing IBKR…' : 'Sync IBKR'}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="IBKR sync options"
              disabled={disabled || busy || connecting}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={configure}>Sync details</DropdownMenuItem>
            {connected && (
              <DropdownMenuItem
                onSelect={() => {
                  try {
                    disconnectHelper(position.id);
                    configure();
                  } catch (cause) {
                    toast.error(
                      cause instanceof Error ? cause.message : 'Could not disconnect this browser'
                    );
                  }
                }}
              >
                Disconnect this browser
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="!bottom-0 !left-0 !top-auto max-h-[85vh] w-full max-w-none !translate-x-0 !translate-y-0 overflow-y-auto rounded-b-none rounded-t-lg pb-[max(1rem,env(safe-area-inset-bottom))] sm:!bottom-auto sm:!left-[50%] sm:!top-[50%] sm:w-[calc(100%-2rem)] sm:max-w-lg sm:!translate-x-[-50%] sm:!translate-y-[-50%] sm:rounded-lg sm:pb-6"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader className="pr-10 text-left">
            <DialogTitle>{connected ? 'Sync IBKR' : 'Connect this Mac once'}</DialogTitle>
            <DialogDescription>
              {connected
                ? 'Updates your IBKR shares, native cost bases and currency cash or debt. Your trade history stays intact.'
                : 'Connect the Mac helper once. After that, press Sync IBKR to update directly from the app.'}
            </DialogDescription>
          </DialogHeader>
          {!connected ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Install the FolioBuddy Mac helper, then enter the code from its setup page. It uses
                your existing IBKR connection in Codex.
              </p>
              <a
                className="text-sm underline underline-offset-4"
                href="https://github.com/n3moxyz/foliobuddy/blob/main/docs/solutions/2026-10-01-ibkr-one-click-sync.md"
                target="_blank"
                rel="noopener noreferrer"
              >
                Mac helper setup instructions
              </a>
              <div className="space-y-2">
                <Label htmlFor={fieldId}>One-time setup code</Label>
                <Input
                  id={fieldId}
                  value={code}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={connecting}
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${fieldId}-error` : undefined}
                  placeholder="12-character code"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Keep this Mac on and FolioBuddy open during a sync. If the IBKR connection expires,
                reconnect it in Codex.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-sm font-medium"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />}
                {phaseLabels[visiblePhase]}
              </p>
              {visiblePhase === 'done' && (
                <p className="text-sm text-muted-foreground">
                  {state.unchanged
                    ? 'Shares, native cost bases and currency balances are unchanged. The latest broker capture is saved.'
                    : 'Your IBKR records match the verified broker capture.'}
                </p>
              )}
              {visiblePhase === 'done' &&
                state.changes &&
                (state.changes.positions.length > 0 || state.changes.cash.length > 0) && (
                  <dl className="divide-y text-sm">
                    {state.changes.positions.map((row) => (
                      <div key={row.id} className="space-y-1 py-3">
                        <dt className="font-medium">{row.symbol}</dt>
                        {row.quantity !== row.previousQuantity && (
                          <dd>
                            Shares: {formatQuantity(row.previousQuantity, 'EQUITY')} →{' '}
                            {formatQuantity(row.quantity, 'EQUITY')}
                          </dd>
                        )}
                        {row.avgCostNative !== row.previousAvgCostNative && (
                          <dd className="text-muted-foreground">
                            Average cost:{' '}
                            {maskMoney(
                              formatNativePrice(row.previousAvgCostNative, row.costCurrency)
                            )}{' '}
                            → {maskMoney(formatNativePrice(row.avgCostNative, row.costCurrency))}
                          </dd>
                        )}
                      </div>
                    ))}
                    {state.changes.cash.map((row) => (
                      <div key={row.currency} className="space-y-1 py-3">
                        <dt className="font-medium">{row.currency} cash / debt</dt>
                        <dd className="font-mono text-muted-foreground">
                          {row.previous == null
                            ? 'Not recorded'
                            : maskMoney(formatNativeAmount(row.previous, row.currency))}{' '}
                          →{' '}
                          {row.current == null
                            ? 'No balance reported'
                            : maskMoney(formatNativeAmount(row.current, row.currency))}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              {busy && (
                <p className="text-sm text-muted-foreground">
                  Keep FolioBuddy open. A private backup is verified before any changes are saved.
                </p>
              )}
              {visiblePhase === 'idle' && (
                <p className="text-sm text-muted-foreground">
                  This browser is paired with your Mac helper. No chat message is needed.
                </p>
              )}
            </div>
          )}
          {capturedAt && (
            <p className="text-xs text-muted-foreground">
              {resultIsCurrent ? 'Last verified broker capture' : last.label}:{' '}
              {formatDateTime(capturedAt)}.
            </p>
          )}
          {(error || (connected && state.error)) && (
            <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
              {error || state.error}
            </p>
          )}
          <DialogFooter>
            {connected ? (
              <Button
                type="button"
                disabled={busy || connecting || disabled}
                onClick={() => (completed ? setOpen(false) : void sync())}
              >
                {completed ? 'Done' : 'Sync now'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={connecting || disabled}
                onClick={() => void connect()}
              >
                {connecting ? 'Connecting…' : 'Connect and sync'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
