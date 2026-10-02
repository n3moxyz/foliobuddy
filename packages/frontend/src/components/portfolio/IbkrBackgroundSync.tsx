import { useEffect, useId, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type IbkrDeviceEnrollment, type IbkrSyncDevice, type Position } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';
import { Textarea } from '@/components/ui/textarea';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { formatDateTime, formatTrimmedNumber } from '@/lib/utils';
import { isIbkrCashPosition } from './ibkrCash';
import { backgroundSyncStatus, parsePublicEnrollment } from './ibkrBackgroundStatus';

export function IbkrBackgroundSync({ position }: { position: Position }) {
  if (!isIbkrCashPosition(position) || position.asset.symbol !== 'USD') return null;
  return <BackgroundConnection cashPositionId={position.id} />;
}

function BackgroundConnection({ cashPositionId }: { cashPositionId: string }) {
  const headingId = useId();
  const inputId = useId();
  const nameId = useId();
  const client = useQueryClient();
  const queryKey = ['ibkr-devices', cashPositionId];
  const devices = useQuery({
    queryKey,
    queryFn: () => api.getIbkrDevices(cashPositionId),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60_000,
  });
  const [connecting, setConnecting] = useState(false);
  const [text, setText] = useState('');
  const [macName, setMacName] = useState('My Mac');
  const [review, setReview] = useState<IbkrDeviceEnrollment | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const register = useMutation({ mutationFn: api.registerIbkrDevice });
  const revoke = useMutation({ mutationFn: api.revokeIbkrDevice });
  const busy = register.isPending || revoke.isPending;
  const device = devices.data?.find((d) => !d.revokedAt);
  // Observe successful poll timestamps even when React Query shares unchanged data.
  const statusCheckedAt = devices.dataUpdatedAt || Date.now();
  const refreshedAt = useRef<string | null>(null);
  const verifiedAt = device?.lastVerifiedAt;
  useEffect(() => {
    if (!verifiedAt || refreshedAt.current === verifiedAt) return;
    refreshedAt.current = verifiedAt;
    void Promise.all([
      client.invalidateQueries({ queryKey: ['positions'] }),
      client.invalidateQueries({ queryKey: ['portfolio'] }),
      client.invalidateQueries({ queryKey: ['ibkr-runs'] }),
    ]);
  }, [client, verifiedAt]);
  const reset = () => {
    setConnecting(false);
    setText('');
    setReview(null);
    setError(null);
  };
  async function authorize() {
    if (!review) return;
    const session = captureAuthSession();
    setError(null);
    try {
      const saved = await register.mutateAsync({ cashPositionId, enrollment: review });
      if (!isAuthSessionCurrent(session)) return;
      client.setQueryData<IbkrSyncDevice[]>(queryKey, (previous) => [saved, ...(previous ?? [])]);
      reset();
      toast.success(`${saved.name} authorized for daily IBKR sync`);
      void client.invalidateQueries({ queryKey: ['ibkr-devices'] });
    } catch (e) {
      if (!isAuthSessionCurrent(session)) return;
      setError(e instanceof Error ? e.message : 'The connection could not be authorized.');
    }
  }
  async function disconnect() {
    if (!device) return;
    const session = captureAuthSession();
    setError(null);
    try {
      await revoke.mutateAsync(device.deviceId);
      if (!isAuthSessionCurrent(session)) return;
      client.setQueryData<IbkrSyncDevice[]>(queryKey, (previous) =>
        previous?.map((d) =>
          d.deviceId === device.deviceId ? { ...d, revokedAt: new Date().toISOString() } : d
        )
      );
      setConfirmDisconnect(false);
      toast.success('Daily IBKR sync disconnected');
      void client.invalidateQueries({ queryKey: ['ibkr-devices'] });
    } catch (e) {
      if (!isAuthSessionCurrent(session)) return;
      setError(e instanceof Error ? e.message : 'The connection could not be disconnected.');
    }
  }
  return (
    <section aria-labelledby={headingId} className="space-y-3 border-t pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 id={headingId} className="text-sm font-medium">
          Daily sync
        </h4>
        <span className="text-xs text-muted-foreground">6:00 AM · Singapore</span>
      </div>
      {devices.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking connection…
        </p>
      ) : devices.isError ? (
        <>
          <p role="alert" className="text-sm text-destructive">
            Daily sync connection could not be loaded.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void devices.refetch()}>
            Retry connection status
          </Button>
        </>
      ) : device ? (
        <>
          <DeviceStatus device={device} now={statusCheckedAt} />
          {confirmDisconnect ? (
            <div className="space-y-2">
              <p className="text-sm">
                Stop {device.name} from updating this IBKR account? Your saved positions and
                checkpoints stay available.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={busy}
                  onClick={() => void disconnect()}
                >
                  {revoke.isPending ? 'Disconnecting…' : 'Stop daily sync'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    setConfirmDisconnect(false);
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDisconnect(true)}
            >
              Disconnect {device.name}
            </Button>
          )}
        </>
      ) : !connecting ? (
        <>
          <p className="text-sm text-muted-foreground">
            Connect your own Mac to sync each morning, even when this browser is closed.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              reset();
              setConnecting(true);
            }}
          >
            Connect a Mac
          </Button>
        </>
      ) : review ? (
        <div className="space-y-3">
          <p className="text-sm font-medium">Authorize {review.name}</p>
          <p className="text-sm text-muted-foreground">
            Only your owned IBKR shares, native cost bases and currency cash or debt can be updated.
            Your original USD purchase records and trade histories stay intact.
          </p>
          <p className="text-xs text-muted-foreground">
            Runs every morning at 6:00 AM Singapore time. {review.name} must be awake and connected
            to your IBKR account. You can disconnect it here at any time.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={busy} onClick={() => void authorize()}>
              {register.isPending ? 'Authorizing…' : 'Authorize daily IBKR sync'}
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Use a Mac signed into your own Codex and IBKR plugin. On a shared Mac, use your own
            macOS user profile. In its FolioBuddy folder, run this setup command:
          </p>
          <label htmlFor={nameId} className="text-sm font-medium">
            Mac name
          </label>
          <Input
            id={nameId}
            value={macName}
            maxLength={80}
            onChange={(event) => setMacName(event.target.value)}
            placeholder="My Mac"
          />
          <code className="block break-all rounded bg-muted p-2 text-xs">
            {`npm run ibkr:worker:setup -- --cash-position-id '${cashPositionId.replace(/'/g, "'\\''")}' --name '${(macName.trim() || 'My Mac').replace(/'/g, "'\\''")}'`}
          </code>
          <label htmlFor={inputId} className="text-sm font-medium">
            Public connection details
          </label>
          <p id={`${inputId}-help`} className="text-xs text-muted-foreground">
            Paste the public connection details generated on your Mac during setup. No passwords or
            private keys are needed.
          </p>
          <Textarea
            id={inputId}
            aria-describedby={`${inputId}-help`}
            rows={4}
            value={text}
            className="font-mono text-xs"
            maxLength={4096}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!text.trim()}
              onClick={() => {
                try {
                  const enrollment = parsePublicEnrollment(text);
                  if (enrollment.cashPositionId !== cashPositionId)
                    throw new Error(
                      'These connection details belong to a different IBKR cash position.'
                    );
                  setReview(enrollment);
                  setError(null);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Review connection
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={reset}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

function DeviceStatus({ device, now }: { device: IbkrSyncDevice; now: number }) {
  const status = backgroundSyncStatus(device, now);
  const { maskMoney, formatQuantity } = useMoneyFormatter();
  const money = (value: number | null, currency = 'USD') =>
    value == null
      ? 'Not saved'
      : maskMoney(
          `${currency} ${formatTrimmedNumber(value, ['JPY', 'KRW'].includes(currency) ? 0 : 2)}`
        );
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{device.name}</span>
        <span role="status" className={status.attention ? 'text-warning' : 'text-muted-foreground'}>
          {status.label}
        </span>
      </div>
      {status.attention && (
        <p role="alert" className="text-sm text-destructive">
          {device.lastError ??
            (status.label === 'Daily sync overdue'
              ? `The scheduled sync has not been verified. Check that ${device.name} is awake and your IBKR connection is available.`
              : `This run needs review before another automatic update. Check the private sync record on ${device.name}.`)}
        </p>
      )}
      <dl className="space-y-1 text-xs text-muted-foreground">
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Last verified sync</dt>
          <dd>{device.lastVerifiedAt ? formatDateTime(device.lastVerifiedAt) : 'Not yet'}</dd>
        </div>
        {device.lastCapturedAt && (
          <div className="flex flex-wrap justify-between gap-2">
            <dt>Broker capture</dt>
            <dd>{formatDateTime(device.lastCapturedAt)}</dd>
          </div>
        )}
        <div className="flex flex-wrap justify-between gap-2">
          <dt>Last contact</dt>
          <dd>{device.lastSeenAt ? formatDateTime(device.lastSeenAt) : 'Not yet'}</dd>
        </div>
      </dl>
      {device.lastStatus === 'verified' &&
        (device.lastChanges.length ? (
          <ul className="space-y-1 text-xs">
            {device.lastChanges.map((change, i) => (
              <li key={`${change.kind}-${change.symbol ?? change.currency}-${i}`}>
                {change.kind === 'quantity'
                  ? `${change.symbol}: ${formatQuantity(change.previous ?? 0, 'EQUITY')} → ${formatQuantity(change.current ?? 0, 'EQUITY')} shares`
                  : `${change.kind === 'cash' ? `${change.currency} cash / debt` : `${change.symbol} native average`}: ${money(change.previous, change.currency)} → ${money(change.current, change.currency)}`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            Shares, native averages and currency balances were unchanged.
          </p>
        ))}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer rounded-sm py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Connection details
        </summary>
        <p className="break-all py-1">Device fingerprint: {device.keyFingerprint}</p>
        <p className="break-all py-1">IBKR connection: {device.connectorFingerprint}</p>
      </details>
    </div>
  );
}
