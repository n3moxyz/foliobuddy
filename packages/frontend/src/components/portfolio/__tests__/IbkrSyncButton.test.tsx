import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Position } from '@/lib/types';
import { IbkrSyncButton } from '../IbkrSyncButton';

const position = {
  id: 'button-test-cash',
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  custodyOf: null,
  asset: { category: 'CASH' },
  ibkrSyncedAt: '2026-09-30T08:00:00Z',
} as Position;
function show(p = position, disabled = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <IbkrSyncButton position={p} disabled={disabled} />
    </QueryClientProvider>
  );
}
describe('one-click IBKR control', () => {
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
    expect(screen.getByRole('heading', { name: 'Connect this Mac once' })).toBeInTheDocument();
    expect(screen.getByLabelText('One-time setup code')).toBeInTheDocument();
    expect(screen.queryByLabelText('Codex chat link')).not.toBeInTheDocument();
    expect(screen.queryByText(/Press Send/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect and sync' })).toBeInTheDocument();
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
