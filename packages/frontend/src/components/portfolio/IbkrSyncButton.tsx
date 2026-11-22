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
import { formatDateTime, formatNativePrice, formatNativeAmount } from '@/lib/utils';
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
  syncIbkrOnDemand,
  type SyncPhase,
} from './ibkrDirectSync';

const phaseLabels: Record<SyncPhase, string> = {
  idle: 'Ready to sync',
  checking: 'Checking your IBKR portfolio…',
  queued: 'Waiting for your connected Mac…',
  running: 'Your connected Mac is syncing IBKR…',
  reading: 'Reading IBKR twice…',
  retrying: "Waiting for IBKR's currency totals to settle…",
  reviewing: 'Checking shares, costs and cash…',
  backup: 'Saving and verifying your backup…',
  saving: 'Updating your IBKR records…',
  verifying: 'Verifying the saved records…',
  done: 'IBKR synced and verified',
  error: 'Sync needs attention',
};

let dismissPreviousSyncToast: (() => void) | undefined;

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
  const { maskMoney, formatQuantity } = useMoneyFormatter();
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
  const mobileBrowser =
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const useMacHelper = connected && !mobileBrowser;
  const showPairing = !connected && !mobileBrowser && !state.deviceName;
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
      queryClient.invalidateQueries({ queryKey: ['ibkr-devices'] }),
    ]);
  }
  async function sync(local: boolean) {
    if (isSyncBusy(getDirectSyncState(position.id).phase)) return;
    const session = captureAuthSession();
    setError(null);
    setOpen(false);
    dismissPreviousSyncToast?.();
    let shownPhase: SyncPhase = 'checking';
    let progressHidden = false;
    let resultId: ReturnType<typeof toast> | undefined;
    // Sonner's loading variant disables both the close button and swipe gestures.
    const progressOptions = {
      duration: Infinity,
      icon: <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />,
      onDismiss: () => {
        progressHidden = true;
      },
    };
    const progressId = toast('Syncing IBKR…', {
      ...progressOptions,
      description: local
        ? `${phaseLabels.checking} Keep this tab open.`
        : 'Requesting a sync on your connected Mac…',
    });
    function cleanup() {
      session.signal.removeEventListener('abort', dismiss);
      if (dismissPreviousSyncToast === dismiss) dismissPreviousSyncToast = undefined;
    }
    function hideProgress() {
      if (progressHidden) return;
      progressHidden = true;
      toast.dismiss(progressId);
    }
    function dismiss() {
      cleanup();
      hideProgress();
      if (resultId !== undefined) toast.dismiss(resultId);
    }
    dismissPreviousSyncToast = dismiss;
    session.signal.addEventListener('abort', dismiss, { once: true });
    const options = {
      onDismiss: cleanup,
      onAutoClose: cleanup,
    };
    const unsubscribe = subscribeDirectSync(() => {
      if (progressHidden || !isAuthSessionCurrent(session)) return;
      const { phase, deviceName } = getDirectSyncState(position.id);
      if (!isSyncBusy(phase) || shownPhase === phase) return;
      shownPhase = phase;
      toast('Syncing IBKR…', {
        ...progressOptions,
        id: progressId,
        description: local
          ? `${phaseLabels[phase]} Keep this tab open.`
          : phase === 'queued' && deviceName
            ? `Waiting for ${deviceName}…`
            : phase === 'running' && deviceName
              ? `${deviceName} is syncing IBKR…`
              : phaseLabels[phase],
      });
    });
    try {
      const result = await (local ? syncIbkrDirect(position.id) : syncIbkrOnDemand(position.id));
      if (!isAuthSessionCurrent(session)) return;
      hideProgress();
      if (!result) {
        if (!mobileBrowser) {
          dismiss();
          configure();
          return;
        }
        resultId = toast.error('Connect a Mac to sync IBKR', {
          ...options,
          description: 'Open Daily Sync on your IBKR cash position to connect a Mac.',
        });
        return;
      }
      resultId = toast.success(phaseLabels.done, {
        ...options,
        description: result.unchanged
          ? 'Shares, native cost bases and currency balances are unchanged.'
          : 'Your IBKR shares, cost bases and currency balances are up to date.',
      });
    } catch (cause) {
      if (!isAuthSessionCurrent(session)) return;
      hideProgress();
      resultId = toast.error(local ? 'IBKR sync stopped' : 'IBKR sync needs attention', {
        ...options,
        description: cause instanceof Error ? cause.message : 'Check the sync details.',
      });
    } finally {
      unsubscribe();
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
      await sync(true);
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
          aria-disabled={busy || undefined}
          aria-busy={busy}
          onClick={() => {
            if (busy) return;
            void sync(useMacHelper);
          }}
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
            <DropdownMenuItem onSelect={configure}>Sync Details</DropdownMenuItem>
            {useMacHelper && (
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
                Disconnect This Browser
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          mobileSheet
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            triggerRef.current?.focus();
          }}
        >
          <DialogHeader className="pr-10 text-left">
            <DialogTitle>{showPairing ? 'Connect This Mac Once' : 'Sync IBKR'}</DialogTitle>
            <DialogDescription>
              {showPairing
                ? 'Connect the Mac helper once. After that, press Sync IBKR to update directly from the app.'
                : 'Updates your IBKR shares, native cost bases and currency cash or debt. Your trade history stays intact.'}
            </DialogDescription>
          </DialogHeader>
          {showPairing ? (
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
                <Label htmlFor={fieldId}>One-Time Setup Code</Label>
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
                        <dt className="font-medium">{row.currency} Cash / Debt</dt>
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
              {busy && useMacHelper && (
                <p className="text-sm text-muted-foreground">
                  Keep FolioBuddy open. A private backup is verified before any changes are saved.
                </p>
              )}
              {visiblePhase === 'idle' && (
                <p className="text-sm text-muted-foreground">
                  {useMacHelper
                    ? 'This browser is paired with your Mac helper.'
                    : 'Sync Now sends a request to your connected Mac.'}
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
          {(error || (!showPairing && state.error)) && (
            <p id={`${fieldId}-error`} role="alert" className="text-sm text-destructive">
              {error || state.error}
            </p>
          )}
          <DialogFooter>
            {!showPairing ? (
              <Button
                type="button"
                disabled={busy || connecting || disabled}
                onClick={() => (completed ? setOpen(false) : void sync(useMacHelper))}
              >
                {completed ? 'Done' : 'Sync Now'}
              </Button>
            ) : (
              <Button
                type="button"
                disabled={connecting || disabled}
                onClick={() => void connect()}
              >
                {connecting ? 'Connecting…' : 'Connect and Sync'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
