import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IbkrDeviceSettings } from '../IbkrDeviceSettings';
import { api } from '@/lib/api';
import type { IbkrSyncDevice } from '@/lib/types';

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
    fireEvent.click(screen.getByRole('button', { name: 'Stop daily sync' }));
    await waitFor(() =>
      expect(vi.mocked(api.revokeIbkrDevice).mock.calls[0]?.[0]).toBe(device.deviceId)
    );
    expect(await screen.findByText(/No Mac is connected/)).toBeInTheDocument();
  });
  it('retains a connection and shows the error when revocation fails', async () => {
    vi.mocked(api.revokeIbkrDevice).mockRejectedValue(new Error('Disconnect failed'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Merlin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop daily sync' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Disconnect failed');
    expect(screen.getByText('Merlin')).toBeInTheDocument();
  });
  it('offers retry when grant access is unavailable', async () => {
    vi.mocked(api.getIbkrDevices).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.getByRole('button', { name: 'Retry connections' })).toBeInTheDocument();
  });
});
