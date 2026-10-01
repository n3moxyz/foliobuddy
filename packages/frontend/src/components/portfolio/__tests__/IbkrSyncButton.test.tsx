import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Position } from '@/lib/types';
import { IbkrSyncButton } from '../IbkrSyncButton';
import { readIbkrCodexChat, saveIbkrCodexChat } from '../ibkrCodexSync';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
const chat = '12345678-1234-1234-1234-123456789abc';
const position = {
  id: 'owned-ibkr-cash',
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  custodyOf: null,
  asset: { category: 'CASH' },
  ibkrSyncedAt: '2026-09-30T08:00:00Z',
} as Position;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe('Sync via Codex', () => {
  it.each([
    { storageLocation: 'Tiger' },
    { storageLocation: 'Binance' },
    { storageType: 'BANK' },
    { custodyOf: 'Someone else' },
    { asset: { category: 'STABLECOIN' } },
  ])('does not offer a handoff for another broker or custody record: %o', (change) => {
    const { container } = render(
      <IbkrSyncButton position={{ ...position, ...change } as Position} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sets up a validated chat and opens a draft without claiming the sync ran', () => {
    render(<IbkrSyncButton position={position} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync via Codex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Codex' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a local chat link');
    expect(screen.getByText(/Last saved broker capture/)).toHaveTextContent('30 Sep');
    fireEvent.change(screen.getByLabelText('Codex chat link'), {
      target: { value: `codex://threads/${chat}` },
    });
    const link = screen.getByRole('link', { name: 'Open Codex' });
    const target = new URL(link.getAttribute('href')!);
    expect(target.searchParams.get('prompt')).toContain('"owned-ibkr-cash"');
    // Prevent jsdom's navigation while preserving the component's click handler.
    link.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(link);
    expect(readIbkrCodexChat(position.id)).toBe(chat);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sync via Codex' })).toHaveAttribute(
      'href',
      target.href
    );
    expect(toast.info).toHaveBeenCalledWith(
      'Press Send in Codex to start the sync',
      expect.any(Object)
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('updates another mounted entry point while keeping other account settings separate', () => {
    render(
      <>
        <IbkrSyncButton position={position} />
        <IbkrSyncButton position={{ ...position, id: 'other-owner' }} />
      </>
    );
    act(() => saveIbkrCodexChat(position.id, chat));
    expect(screen.getAllByRole('link', { name: 'Sync via Codex' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Sync via Codex' })).toHaveLength(1);
  });

  it.each([
    ['manual', 'Last manual cash edit'],
    ['ibkr', 'Last saved broker capture'],
  ] as const)(
    'labels the %s cash snapshot without substituting another sync time',
    (source, label) => {
      render(
        <IbkrSyncButton
          position={{
            ...position,
            ibkrSyncedAt: '2026-10-02T08:00:00Z',
            ibkrCash: {
              source,
              capturedAt: '2026-10-01T08:00:00Z',
              baseCurrency: 'USD',
              baseCash: 100,
              baseToUsd: 1,
              netCashUsd: 100,
              balances: [{ currency: 'USD', cashBalance: 100, fxRateToUsd: 1 }],
            },
          }}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: 'Sync via Codex' }));
      expect(screen.getByText(new RegExp(label))).toHaveTextContent('1 Oct 2026');
      expect(screen.queryByText(/2 Oct 2026/)).not.toBeInTheDocument();
      if (source === 'manual')
        expect(screen.queryByText(/Last saved broker capture/)).not.toBeInTheDocument();
    }
  );

  it('keeps the dialog open and prevents handoff when the setting cannot be saved', () => {
    render(<IbkrSyncButton position={position} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync via Codex' }));
    fireEvent.change(screen.getByLabelText('Codex chat link'), { target: { value: chat } });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(fireEvent.click(screen.getByRole('link', { name: 'Open Codex' }))).toBe(false);
    expect(screen.getByRole('alert')).toHaveTextContent('could not save the chat link');
    expect(readIbkrCodexChat(position.id)).toBeNull();
  });

  it('copies the request and reports clipboard failures', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    render(<IbkrSyncButton position={position} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sync via Codex' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy sync request' }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Sync request copied', expect.any(Object))
    );
    expect(writeText.mock.calls[0][0]).toContain('"owned-ibkr-cash"');
    writeText.mockRejectedValue(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'Copy sync request' }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'Could not copy the sync request',
        expect.any(Object)
      )
    );
    vi.unstubAllGlobals();
  });

  it('disables both entry points while the cash panel is applying a change', () => {
    saveIbkrCodexChat(position.id, chat);
    render(<IbkrSyncButton position={position} disabled />);
    expect(screen.getByRole('button', { name: 'Sync via Codex' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'IBKR sync options' })).toBeDisabled();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
