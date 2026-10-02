import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IbkrBackgroundSync } from '../IbkrBackgroundSync';
import { backgroundSyncStatus } from '../ibkrBackgroundStatus';
import { api } from '@/lib/api';
import { installAuthSession } from '@/lib/authSession';
import { toast } from 'sonner';
import type { IbkrSyncDevice, Position } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/api', () => ({
  api: {
    getIbkrDevices: vi.fn(async () => []),
    registerIbkrDevice: vi.fn(),
    revokeIbkrDevice: vi.fn(),
  },
}));
const position = {
  id: 'fictional-cash',
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  custodyOf: null,
  asset: { category: 'CASH', symbol: 'USD' },
} as Position;
const enrollment = {
  version: 1,
  deviceId: '6880ef43-a389-42f1-9b3f-f2445148d472',
  cashPositionId: position.id,
  name: 'Merlin',
  publicKey: 'MCowBQYDK2VwAyEApublictestkey',
  connectorFingerprint: 'a'.repeat(64),
  audience: 'https://api.foliobuddy.xyz',
  createdAt: '2026-10-02T01:00:00.000Z',
  signature: 'public-proof',
};
const device: IbkrSyncDevice = {
  deviceId: enrollment.deviceId,
  cashPositionId: position.id,
  name: 'Merlin',
  keyFingerprint: 'b'.repeat(64),
  connectorFingerprint: enrollment.connectorFingerprint,
  createdAt: '2026-10-01T01:00:00Z',
  revokedAt: null,
  lastSeenAt: '2026-10-01T22:01:00Z',
  lastVerifiedAt: '2026-10-01T22:01:00Z',
  lastCapturedAt: '2026-10-01T22:00:30Z',
  lastStatus: 'verified',
  lastError: null,
  lastChanges: [],
  blocked: false,
};
function mount(p = position) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <IbkrBackgroundSync position={p} />
    </QueryClientProvider>
  );
  return { ...view, client };
}
beforeEach(() => {
  vi.clearAllMocks();
  installAuthSession('owner-a', 'session-a', async () => 'test');
  vi.mocked(api.getIbkrDevices).mockResolvedValue([]);
});
afterEach(() => {
  usePrivacyStore.getState().setValuesHidden(false);
  vi.useRealTimers();
});

describe('daily IBKR connection', () => {
  it.each([{ storageLocation: 'Tiger' }, { custodyOf: 'Other person' }])(
    'does not query another broker or custody account: %j',
    (patch) => {
      const { container } = mount({ ...position, ...patch });
      expect(container).toBeEmptyDOMElement();
      expect(api.getIbkrDevices).not.toHaveBeenCalled();
    }
  );
  it('requires review and explicit authorization, scoped to the displayed cash account', async () => {
    vi.mocked(api.registerIbkrDevice).mockResolvedValue({ ...device, lastStatus: 'authorized' });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a Mac' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Public connection details' }), {
      target: { value: JSON.stringify(enrollment) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    expect(api.registerIbkrDevice).not.toHaveBeenCalled();
    expect(screen.getByText(/Only your owned IBKR shares/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize daily IBKR sync' }));
    await waitFor(() =>
      expect(vi.mocked(api.registerIbkrDevice).mock.calls[0]?.[0]).toEqual({
        cashPositionId: position.id,
        enrollment,
      })
    );
  });
  it('prepares a user-named Mac and uses that device name throughout authorization', async () => {
    const named = { ...enrollment, name: "Alice's Mini" };
    vi.mocked(api.registerIbkrDevice).mockResolvedValue({ ...device, name: named.name });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a Mac' }));
    expect(screen.getByLabelText('Mac name')).toHaveValue('My Mac');
    fireEvent.change(screen.getByLabelText('Mac name'), { target: { value: named.name } });
    expect(screen.getByText(/npm run ibkr:worker:setup/).textContent).toContain(
      "--name 'Alice'\\''s Mini'"
    );
    fireEvent.change(screen.getByLabelText('Public connection details'), {
      target: { value: JSON.stringify(named) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    expect(screen.getByText("Authorize Alice's Mini")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Authorize daily IBKR sync' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Alice's Mini authorized for daily IBKR sync")
    );
  });
  it('discards an authorization completion after the signed-in account changes', async () => {
    let resolve!: (value: IbkrSyncDevice) => void;
    vi.mocked(api.registerIbkrDevice).mockReturnValue(
      new Promise((done) => {
        resolve = done;
      })
    );
    const { client } = mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a Mac' }));
    fireEvent.change(screen.getByLabelText('Public connection details'), {
      target: { value: JSON.stringify(enrollment) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    fireEvent.click(screen.getByRole('button', { name: 'Authorize daily IBKR sync' }));
    await waitFor(() => expect(api.registerIbkrDevice).toHaveBeenCalled());
    installAuthSession('owner-b', 'session-b', async () => 'test-b');
    await act(async () => {
      resolve(device);
    });
    expect(toast.success).not.toHaveBeenCalled();
    expect(client.getQueryData(['ibkr-devices', position.id])).toEqual([]);
  });
  it('rejects unexpected private fields before sending connection details', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a Mac' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Public connection details' }), {
      target: { value: JSON.stringify({ ...enrollment, privateKey: 'must-not-send' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/public connection details/);
    expect(api.registerIbkrDevice).not.toHaveBeenCalled();
  });
  it('rejects connection details signed for another cash position', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Connect a Mac' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Public connection details' }), {
      target: { value: JSON.stringify({ ...enrollment, cashPositionId: 'other-cash' }) },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Review connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/different IBKR cash position/);
    expect(api.registerIbkrDevice).not.toHaveBeenCalled();
  });
  it('updates overdue status when an unchanged status response is polled', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-01T22:59:00Z'));
    const stale = { ...device, lastVerifiedAt: '2026-09-30T22:01:00Z' };
    vi.mocked(api.getIbkrDevices).mockResolvedValue([stale]);
    const { client } = mount();
    expect(await screen.findByText('Synced and verified')).toBeInTheDocument();
    const original = client.getQueryData(['ibkr-devices', position.id]);
    vi.setSystemTime(new Date('2026-10-01T23:01:00Z'));
    await act(async () => {
      await client.refetchQueries({ queryKey: ['ibkr-devices', position.id] });
    });
    expect(client.getQueryData(['ibkr-devices', position.id])).toBe(original);
    expect(await screen.findByRole('status')).toHaveTextContent('Daily sync overdue');
  });
  it('keeps a failed status fetch actionable and never offers a duplicate grant', async () => {
    vi.mocked(api.getIbkrDevices).mockRejectedValue(new Error('offline'));
    mount();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be loaded/);
    expect(screen.queryByRole('button', { name: 'Connect a Mac' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry connection status' })).toBeInTheDocument();
  });
  it('requires confirmation before revoking and retains the display on failure', async () => {
    vi.mocked(api.getIbkrDevices).mockResolvedValue([device]);
    vi.mocked(api.revokeIbkrDevice).mockRejectedValue(new Error('Disconnect failed'));
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Disconnect Merlin' }));
    expect(api.revokeIbkrDevice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Stop daily sync' }));
    await waitFor(() =>
      expect(vi.mocked(api.revokeIbkrDevice).mock.calls[0]?.[0]).toBe(device.deviceId)
    );
    expect(await screen.findByText('Disconnect failed')).toBeInTheDocument();
    expect(screen.getByText('Merlin')).toBeInTheDocument();
  });
  it('masks cash and native average changes while keeping quantities visible', async () => {
    vi.mocked(api.getIbkrDevices).mockResolvedValue([
      {
        ...device,
        lastChanges: [
          { kind: 'cash', currency: 'JPY', previous: 45000, current: 55000 },
          {
            kind: 'native-average',
            symbol: 'TEST',
            currency: 'JPY',
            previous: 8400,
            current: 8500,
          },
          { kind: 'quantity', symbol: 'TEST', previous: 10, current: 20 },
        ],
      },
    ]);
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    mount();
    await screen.findByText('Merlin');
    expect(screen.queryByText(/45,000|55,000|8,400|8,500/)).not.toBeInTheDocument();
    expect(screen.getByText(/10 → 20 shares/)).toBeInTheDocument();
    expect(screen.getAllByText(/••••/).length).toBeGreaterThan(0);
  });
});

describe('daily status in Singapore time', () => {
  it('shows an active attempt as progress while its normal run window is open', () => {
    expect(
      backgroundSyncStatus(
        { ...device, lastStatus: 'running', blocked: true },
        Date.parse('2026-10-01T22:02:00Z')
      ).label
    ).toBe('Sync in progress');
  });
  it('allows the run window, then reports a missed run even if Merlin cannot send an error', () => {
    const stale = { ...device, lastVerifiedAt: '2026-09-30T22:01:00Z' };
    expect(backgroundSyncStatus(stale, Date.parse('2026-10-01T22:30:00Z')).attention).toBe(false);
    expect(backgroundSyncStatus(stale, Date.parse('2026-10-01T23:01:00Z')).label).toBe(
      'Daily sync overdue'
    );
  });
  it('does not call a connected device verified before its first saved run', () => {
    const newDevice = {
      ...device,
      createdAt: '2026-10-02T01:00:00Z',
      lastStatus: 'authorized' as const,
      lastVerifiedAt: null,
    };
    expect(backgroundSyncStatus(newDevice, Date.parse('2026-10-02T01:01:00Z')).label).toBe(
      'Waiting for Merlin'
    );
  });
  it('shows an uncertain result ahead of an earlier successful sync', () => {
    expect(
      backgroundSyncStatus({ ...device, blocked: true }, Date.parse('2026-10-01T22:02:00Z')).label
    ).toBe('Sync needs attention');
  });
});
