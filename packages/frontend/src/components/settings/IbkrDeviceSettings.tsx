import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, type IbkrSyncDevice } from '@/lib/api';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';
import { Button } from '@/components/ui/button';
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
  const [error, setError] = useState<string | null>(null);
  const revoke = useMutation({ mutationFn: api.revokeIbkrDevice });
  async function disconnect(deviceId: string) {
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
      toast.success('Daily IBKR sync disconnected');
    } catch (cause) {
      if (!isAuthSessionCurrent(session)) return;
      setError(
        cause instanceof Error ? cause.message : 'The connection could not be disconnected.'
      );
    }
  }
  return (
    <section aria-label="IBKR daily sync" className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">IBKR daily sync</h2>
        <p className="text-sm text-muted-foreground">
          Manage Macs allowed to sync your IBKR positions in FolioBuddy.
        </p>
      </div>
      {devices.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Checking connections…
        </p>
      ) : devices.isError ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            IBKR connections could not be loaded.
          </p>
          <Button variant="outline" size="sm" onClick={() => void devices.refetch()}>
            Retry connections
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
                    Stop daily sync from this Mac? Your positions and checkpoints stay available.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => void disconnect(device.deviceId)}
                    >
                      {revoke.isPending ? 'Disconnecting…' : 'Stop daily sync'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={revoke.isPending}
                      onClick={() => {
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
                  variant="outline"
                  size="sm"
                  disabled={revoke.isPending}
                  onClick={() => {
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
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
