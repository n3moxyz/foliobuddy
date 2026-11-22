import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@/lib/types';
import { IbkrSyncButton } from '../IbkrSyncButton';
import * as directSync from '../ibkrDirectSync';
import { installAuthSession } from '@/lib/authSession';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { loading: vi.fn(() => 'sync-toast'), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}));
beforeEach(() => {
  installAuthSession('button-owner', 'button-session', async () => 'button-token');
  vi.clearAllMocks();
});
afterEach(() => vi.restoreAllMocks());

const position = {
  id: 'button-test-cash',
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  custodyOf: null,
  asset: { category: 'CASH' },
  ibkrSyncedAt: '2026-09-30T08:00:00Z',
} as Position;
function show(p = position, disabled = false) {
  const client = new QueryClient();
  return {
    ...render(
      <QueryClientProvider client={client}>
        <IbkrSyncButton position={p} disabled={disabled} />
      </QueryClientProvider>
    ),
    client,
  };
}
describe('one-click IBKR control', () => {
  it.each(['older cache', 'newer capture', 'manual edit'])(
    'keeps Done a close action when a %s arrives during the click',
    async (change) => {
      const capturedAt = '2026-10-02T08:00:00Z';
      const completed: directSync.DirectSyncState = { phase: 'done', capturedAt, unchanged: true };
      const current: Position = {
        ...position,
        ibkrSyncedAt: capturedAt,
        ibkrCash: {
          source: 'ibkr',
          capturedAt,
          baseCurrency: 'USD',
          baseCash: 100,
          baseToUsd: 1,
          netCashUsd: 100,
          balances: [],
        },
      };
      vi.spyOn(directSync, 'hasHelperConnection').mockReturnValue(true);
      vi.spyOn(directSync, 'getDirectSyncState').mockReturnValue(completed);
      const sync = vi.spyOn(directSync, 'syncIbkrDirect').mockResolvedValue(completed);
      const view = show(current);
      fireEvent.keyDown(screen.getByRole('button', { name: 'IBKR sync options' }), {
        key: 'ArrowDown',
      });
      fireEvent.click(screen.getByRole('menuitem', { name: 'Sync Details' }));
      const done = screen.getByRole('button', { name: 'Done' });
      fireEvent.pointerDown(done, { button: 0 });
      const nextTime = change === 'older cache' ? '2026-10-01T08:00:00Z' : '2026-10-02T09:00:00Z';
      view.rerender(
        <QueryClientProvider client={view.client}>
          <IbkrSyncButton
            position={{
              ...current,
              ibkrSyncedAt: nextTime,
              ibkrCash: {
                ...current.ibkrCash!,
                source: change === 'manual edit' ? 'manual' : 'ibkr',
                capturedAt: nextTime,
              },
            }}
          />
        </QueryClientProvider>
      );
      expect(screen.queryByText(/Last verified broker capture/)).not.toBeInTheDocument();
      await act(async () => {
        fireEvent.click(done);
      });
      expect(sync).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    }
  );
  it.each(['success', 'failure'])(
    'updates one persistent toast through %s even after leaving Portfolio',
    async (outcome) => {
      let resolve!: (value: directSync.DirectSyncState) => void;
      let reject!: (error: Error) => void;
      let state: directSync.DirectSyncState = { phase: 'idle' };
      const listeners = new Set<() => void>();
      vi.spyOn(directSync, 'hasHelperConnection').mockReturnValue(true);
      vi.spyOn(directSync, 'getDirectSyncState').mockImplementation(() => state);
      vi.spyOn(directSync, 'subscribeDirectSync').mockImplementation((listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      });
      const sync = vi.spyOn(directSync, 'syncIbkrDirect').mockReturnValue(
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        })
      );
      const view = show();
      fireEvent.click(screen.getByRole('button', { name: 'Sync IBKR' }));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(toast.loading).toHaveBeenCalledWith(
        'Syncing IBKR…',
        expect.objectContaining({ description: expect.stringContaining('Checking your IBKR') })
      );
      act(() => {
        state = { phase: 'reading' };
        listeners.forEach((listener) => listener());
      });
      expect(toast.loading).toHaveBeenLastCalledWith(
        'Syncing IBKR…',
        expect.objectContaining({
          id: 'sync-toast',
          description: expect.stringContaining('Reading IBKR twice'),
        })
      );
      fireEvent.click(screen.getByRole('button', { name: 'Syncing IBKR…' }));
      expect(sync).toHaveBeenCalledOnce();
      view.unmount();
      await act(async () => {
        if (outcome === 'success') resolve({ phase: 'done', unchanged: true });
        else reject(new Error('The backup could not be verified.'));
      });
      expect(listeners.size).toBe(0);
      const result = expect.objectContaining({ id: 'sync-toast', duration: Infinity });
      if (outcome === 'success')
        expect(toast.success).toHaveBeenCalledWith('IBKR synced and verified', result);
      else expect(toast.error).toHaveBeenCalledWith('IBKR sync stopped', result);
    }
  );
  it.each(['success', 'failure'])(
    'ignores late %s feedback after switching accounts',
    async (outcome) => {
      let resolve!: (value: directSync.DirectSyncState) => void;
      let reject!: (error: Error) => void;
      vi.spyOn(directSync, 'hasHelperConnection').mockReturnValue(true);
      vi.spyOn(directSync, 'syncIbkrDirect').mockReturnValue(
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        })
      );
      const view = show();
      const invalidate = vi.spyOn(view.client, 'invalidateQueries');
      fireEvent.click(screen.getByRole('button', { name: 'Sync IBKR' }));
      await act(async () => {
        installAuthSession('other-owner', 'other-session', async () => 'other-token');
        if (outcome === 'success') resolve({ phase: 'done', unchanged: true });
        else reject(new Error('Prior account failure'));
      });
      expect(toast.success).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.dismiss).toHaveBeenCalledWith('sync-toast');
      expect(invalidate).not.toHaveBeenCalled();
    }
  );
  it.each([
    { storageLocation: 'Tiger' },
    { storageLocation: 'Binance' },
    { storageType: 'BANK' },
    { custodyOf: 'Someone else' },
    { asset: { category: 'STABLECOIN' } },
  ])('is absent outside owned IBKR records %o', (change) => {
    expect(show({ ...position, ...change } as Position).container).toBeEmptyDOMElement();
  });
  it('explains one-time setup without asking for a chat link or Send', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'Sync IBKR' }));
    expect(screen.getByRole('heading', { name: 'Connect This Mac Once' })).toBeInTheDocument();
    expect(screen.getByLabelText('One-Time Setup Code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Codex chat link')).not.toBeInTheDocument();
    expect(screen.queryByText(/Press Send/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect and Sync' })).toBeInTheDocument();
  });
  it.each([
    ['manual', 'Last manual cash edit'],
    ['ibkr', 'Last saved broker capture'],
  ] as const)('labels %s source timestamps accurately', (source, label) => {
    show({
      ...position,
      ibkrSyncedAt: '2026-10-02T08:00:00Z',
      ibkrCash: {
        source,
        capturedAt: '2026-10-01T08:00:00Z',
        baseCurrency: 'USD',
        baseCash: 100,
        baseToUsd: 1,
        netCashUsd: 100,
        balances: [],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sync IBKR' }));
    expect(screen.getByText(new RegExp(label))).toHaveTextContent('1 Oct 2026');
    expect(screen.queryByText(/2 Oct 2026/)).not.toBeInTheDocument();
  });
  it('respects a cash-panel operation already in progress', () => {
    show(position, true);
    expect(screen.getByRole('button', { name: 'Sync IBKR' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'IBKR sync options' })).toBeDisabled();
  });
});
