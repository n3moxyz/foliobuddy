import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { IbkrCashPanel } from '../IbkrCashPanel';
import type { Position } from '@/lib/types';
import { usePrivacyStore } from '@/stores/privacyStore';

vi.mock('@/lib/api', () => ({
  api: { getIbkrRuns: vi.fn(async () => []), reconcileIbkr: vi.fn(), restoreIbkr: vi.fn() },
}));
const position = {
  id: 'cash',
  assetId: 'usd',
  quantity: -450,
  avgCostUsd: 1,
  marketValueUsd: -450,
  storageType: 'BROKERAGE',
  storageLocation: 'IBKR',
  custodyOf: null,
  asset: { id: 'usd', symbol: 'USD', category: 'CASH', nativeCurrency: 'USD', currentPriceUsd: 1 },
  ibkrCash: {
    source: 'ibkr',
    capturedAt: '2026-09-30T08:00:00Z',
    baseCurrency: 'USD',
    baseCash: -450,
    baseToUsd: 1,
    netCashUsd: -450,
    balances: [
      { currency: 'USD', cashBalance: 300, fxRateToUsd: 1 },
      { currency: 'JPY', cashBalance: -111000, fxRateToUsd: 1 / 148 },
    ],
  },
} as Position;
function mount(p: Position) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<IbkrCashPanel position={p} />, { wrapper });
}
afterEach(() => usePrivacyStore.getState().setValuesHidden(false));
describe('IBKR cash panel', () => {
  it.each(['Tiger', 'Binance'])('keeps %s cash on its ordinary form', (storageLocation) => {
    const { container } = mount({ ...position, storageLocation, ibkrCash: undefined });
    expect(container).toBeEmptyDOMElement();
  });
  it('shows cash and debt separately and masks all read-only amounts', () => {
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    mount(position);
    expect(screen.getByText('Debt')).toBeInTheDocument();
    expect(screen.getByText('Cash')).toBeInTheDocument();
    expect(screen.getAllByText('••••').length).toBeGreaterThan(3);
    expect(screen.queryByText(/111,000|300\.00|450\.00/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit currency balances' }));
    expect(screen.getByRole('textbox', { name: 'Amount JPY' })).toHaveValue('111,000');
  });
  it('shows the broker total even when converted currency rows differ', () => {
    mount({
      ...position,
      ibkrCash: { ...position.ibkrCash!, baseCash: -448.5, netCashUsd: -448.5 },
    });
    expect(screen.getByText('-$448.50')).toBeInTheDocument();
    expect(screen.queryByText('-$450.00')).not.toBeInTheDocument();
    expect(screen.getByText(/FX quotes refresh separately/)).toBeInTheDocument();
  });
  it('reopens editing from the latest balances after a refetch', () => {
    const { rerender } = mount(position);
    fireEvent.click(screen.getByRole('button', { name: 'Edit currency balances' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Amount USD' }), {
      target: { value: '999' },
    });
    const updated = {
      ...position,
      ibkrCash: {
        ...position.ibkrCash!,
        balances: [{ currency: 'USD', cashBalance: 42, fxRateToUsd: 1 }],
        netCashUsd: 42,
      },
    };
    rerender(<IbkrCashPanel position={updated} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit currency balances' }));
    expect(screen.getByRole('textbox', { name: 'Amount USD' })).toHaveValue('42');
    expect(screen.queryByRole('textbox', { name: 'Amount JPY' })).not.toBeInTheDocument();
  });
});
