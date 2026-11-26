import { useEffect, useRef, useState } from 'react';
import { DeferredStatus } from '@/components/ui/deferred-status';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@/lib/toast';
import { api, type IbkrSyncDevice } from '@/lib/api';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';
import { Button } from '@/components/ui/button';
import { failureDescription } from '@/lib/mutationFeedback';
import { formatDateTime } from '@/lib/utils';

/** Grant management remains reachable even after its cash position becomes ineligible. */
export function IbkrDeviceSettings() {
  const client = useQueryClient();
  const queryKey = ['ibkr-devices', 'active'];
  const devices = useQuery({
    queryKey,
    queryFn: () => api.getIbkrDevices(),
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // The trigger and the confirm row replace each other, so focus must follow the swap.
  const cancelRef = useRef<HTMLButtonElement>(null);
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusTarget = useRef<{ kind: 'cancel' } | { kind: 'trigger'; id: string } | null>(null);
  useEffect(() => {
    const target = focusTarget.current;
    focusTarget.current = null;
    if (target?.kind === 'cancel') cancelRef.current?.focus();
    else if (target) triggerRefs.current.get(target.id)?.focus();
  }, [confirmId]);
  // The failed action, naming the Mac, then its cause or next step.
  const [error, setError] = useState<{ title: string; description: string } | null>(null);
  // Disconnect failures show inline in this section.
  const revoke = useMutation({ meta: { showsOwnError: true }, mutationFn: api.revokeIbkrDevice });
  async function disconnect({ deviceId, name }: IbkrSyncDevice) {
    const session = captureAuthSession();
    setError(null);
    try {
      await revoke.mutateAsync(deviceId);
      if (!isAuthSessionCurrent(session)) return;
      client.setQueryData<IbkrSyncDevice[]>(queryKey, (rows) =>
        rows?.filter((row) => row.deviceId !== deviceId)
      );
      setConfirmId(null);
      void client.invalidateQueries({ queryKey: ['ibkr-devices'] });
      toast.success(`${name} disconnected from daily IBKR sync`);
    } catch (cause) {
      if (!isAuthSessionCurrent(session)) return;
      setError({ title: `Couldn't disconnect ${name}`, description: failureDescription(cause) });
    }
  }
  return (
    <section aria-label="IBKR Daily Sync" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">IBKR Daily Sync</h2>
        <p className="text-sm text-muted-foreground">
          Manage Macs allowed to sync your IBKR positions in FolioBuddy.
        </p>
      </div>
      {devices.isPending ? (
        <p className="text-sm text-muted-foreground">
          <span aria-hidden="true">Checking connections…</span>
          <DeferredStatus>Checking connections…</DeferredStatus>
        </p>
      ) : devices.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            IBKR connections could not be loaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => void devices.refetch()}>
            Retry Connections
          </Button>
        </div>
      ) : devices.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No Mac is connected. Connect your own Mac from your IBKR cash position.
        </p>
      ) : (
        <div className="divide-y">
          {devices.data.map((device) => (
            <div key={device.deviceId} className="space-y-2 py-3">
              <p className="text-sm font-medium">{device.name}</p>
              <p className="text-xs text-muted-foreground">
                {device.lastVerifiedAt
                  ? `Last verified sync: ${formatDateTime(device.lastVerifiedAt)}`
                  : 'No verified sync yet'}
              </p>
              {confirmId === device.deviceId ? (
                <>
                  <p className="text-sm">
                    Disconnect {device.name}? It will no longer update this IBKR account each
                    morning. Your IBKR connection in Codex, saved positions and checkpoints stay as
                    they are.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => void disconnect(device)}
                    >
                      {revoke.isPending ? 'Disconnecting…' : 'Disconnect'}
                    </Button>
                    <Button
                      ref={cancelRef}
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => {
                        focusTarget.current = { kind: 'trigger', id: device.deviceId };
                        setConfirmId(null);
                        setError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  ref={(node) => {
                    if (node) triggerRefs.current.set(device.deviceId, node);
                    else triggerRefs.current.delete(device.deviceId);
                  }}
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => {
                    focusTarget.current = { kind: 'cancel' };
                    setConfirmId(device.deviceId);
                    setError(null);
                  }}
                >
                  Disconnect {device.name}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {error && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p className="font-medium">{error.title}</p>
          <p>{error.description}</p>
        </div>
      )}
    </section>
  );
}
