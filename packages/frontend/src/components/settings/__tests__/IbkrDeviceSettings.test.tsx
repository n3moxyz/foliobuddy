import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IbkrDeviceSettings } from '../IbkrDeviceSettings';
import { api } from '@/lib/api';
import { ApiError } from '@/lib/apiError';
import { CONNECTION_HINT } from '@/lib/mutationFeedback';
import type { IbkrSyncDevice } from '@/lib/types';
import { toast } from 'sonner';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({ api: { getIbkrDevices: vi.fn(), revokeIbkrDevice: vi.fn() } }));
const device = {
  deviceId: 'fictional-device',
  cashPositionId: 'moved-or-custody-cash',
  name: 'Merlin',
  lastVerifiedAt: null,
} as IbkrSyncDevice;
function mount() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <IbkrDeviceSettings />
    </QueryClientProvider>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getIbkrDevices).mockResolvedValue([device]);
});
describe('owner IBKR device settings', () => {
  it('lets the owner revoke an existing grant without reading the current position shape', async () => {
    vi.mocked(api.revokeIbkrDevice).mockImplementation(async () => {
      vi.mocked(api.getIbkrDevices).mockResolvedValue([]);
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Merlin' }));
    expect(api.getIbkrDevices).toHaveBeenCalledWith();
    expect(api.revokeIbkrDevice).not.toHaveBeenCalled();
    // The same question as the Portfolio panel, naming the Mac rather than "this Mac".
    expect(
      screen.getByText(
        /^Disconnect Merlin\? It will no longer update this IBKR account each morning\./
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    await waitFor(() =>
      expect(vi.mocked(api.revokeIbkrDevice).mock.calls[0]?.[0]).toBe(device.deviceId)
    );
    expect(await screen.findByText(/No Mac is connected/)).toBeInTheDocument();
    expect(toast.success).toHaveBeenCalledWith('Merlin disconnected from daily IBKR sync');
  });
  it('retains a connection and shows the error when revocation fails', async () => {
    vi.mocked(api.revokeIbkrDevice).mockRejectedValue(new Error('Disconnect failed'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Merlin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't disconnect Merlin");
    expect(alert).toHaveTextContent('Disconnect failed');
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it.each([
    ['offline', new TypeError('Failed to fetch'), CONNECTION_HINT],
    ['a server fault', new ApiError('Request failed (HTTP 502)', 502), CONNECTION_HINT],
    [
      'a server reason',
      new ApiError('IBKR device is unavailable', 404),
      'IBKR device is unavailable',
    ],
  ] as const)(
    'names the Mac, then the cause, when disconnecting fails (%s)',
    async (_case, failure, cause) => {
      vi.mocked(api.revokeIbkrDevice).mockRejectedValue(failure);
      mount();
      fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Merlin' }));
      fireEvent.click(screen.getByRole('button', { name: 'Disconnect' }));
      const alert = await screen.findByRole('alert');
      expect(alert.firstElementChild).toHaveTextContent(/^Couldn't disconnect Merlin$/);
      expect(alert.lastElementChild).toHaveTextContent(cause);
      expect(screen.queryByText(/Failed to fetch|HTTP 502/)).not.toBeInTheDocument();
      expect(toast.success).not.toHaveBeenCalled();
      // The confirmation stays open, so the owner can try again.
      expect(screen.getByRole('button', { name: 'Disconnect' })).toBeEnabled();
    }
  );
  it('offers retry when grant access is unavailable', async () => {
    vi.mocked(api.getIbkrDevices).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.getByRole('button', { name: 'Retry Connections' })).toBeInTheDocument();
  });
});
