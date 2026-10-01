import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PositionTable } from '../PositionTable';
import type { Position } from '@/lib/types';

vi.mock('@/hooks/usePortfolio', () => ({
  useDeletePosition: () => ({ mutateAsync: vi.fn() }),
  useCancelPositionHistory: () => ({ mutateAsync: vi.fn() }),
  usePositionHistory: () => ({ data: [] }),
}));
vi.mock('../PositionForm', () => ({ PositionForm: () => null }));

it('keeps IBKR sync outside the collapse toggle and excludes other brokers and custody', async () => {
  const holding = {
    id: 'ibkr-stock',
    assetId: 'stock',
    quantity: 10,
    avgCostUsd: 50,
    marketValueUsd: 600,
    storageType: 'BROKERAGE',
    storageLocation: 'IBKR',
    custodyOf: null,
    asset: {
      id: 'stock',
      symbol: 'EXAMPLE',
      name: 'Example',
      category: 'EQUITY',
      currentPriceUsd: 60,
    },
  } as Position;
  const anchor = {
    ...holding,
    id: 'ibkr-cash',
    asset: { ...holding.asset, category: 'CASH' },
  } as Position;
  const client = new QueryClient();
  const { rerender } = render(
    <PositionTable positions={[holding]} groupBy="broker" ibkrSyncAnchor={anchor} />,
    {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    }
  );
  const group = screen.getByRole('button', { name: /^IBKR \(/ });
  const expanded = group.getAttribute('aria-expanded');
  const sync = screen.getByRole('button', { name: 'Sync IBKR' });
  expect(group.contains(sync)).toBe(false);
  fireEvent.click(sync);
  expect(group).toHaveAttribute('aria-expanded', expanded);
  expect(screen.getByRole('dialog')).toHaveTextContent('Connect this Mac once');
  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  await waitFor(() => expect(sync).toHaveFocus());
  rerender(
    <PositionTable
      positions={[{ ...holding, storageLocation: 'Tiger' }]}
      groupBy="broker"
      ibkrSyncAnchor={anchor}
    />
  );
  expect(screen.queryByRole('button', { name: 'Sync IBKR' })).not.toBeInTheDocument();
  rerender(
    <PositionTable
      positions={[{ ...holding, custodyOf: 'Someone' }]}
      groupBy="broker"
      ibkrSyncAnchor={anchor}
    />
  );
  expect(screen.queryByRole('button', { name: 'Sync IBKR' })).not.toBeInTheDocument();
});

it('updates open details after an unchanged native NAV is revalued with new FX', () => {
  const position = {
    id: 'amova-fsm',
    assetId: 'amova',
    quantity: 100,
    avgCostUsd: 3,
    marketValueUsd: 483.696,
    unrealizedPnL: 183.696,
    unrealizedPnLPct: 61.232,
    storageType: 'BROKERAGE',
    storageLocation: 'FSMOne',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    asset: {
      id: 'amova',
      symbol: 'AMOVASIN',
      name: 'Amova Singapore Equity',
      category: 'UNIT_TRUST',
      nativeCurrency: 'SGD',
      priceProvider: 'fund-manager',
      isin: 'SG9999004360',
      currentPriceNative: 6.0462,
      currentPriceUsd: 4.83696,
      priceSource: 'fund-manager',
      priceAsOf: '2026-09-09T00:00:00Z',
      priceCheckedAt: '2026-09-10T10:00:00Z',
      priceCheckStatus: 'ok',
    },
  } as Position;
  const { rerender } = render(<PositionTable positions={[position]} fxRate={1.25} />);
  fireEvent.click(screen.getAllByRole('button', { name: 'View details' })[0]);
  expect(within(screen.getByRole('dialog')).getByText('$4.8370')).toBeInTheDocument();
  const updated: Position = {
    ...position,
    marketValueUsd: 431.8714286,
    asset: { ...position.asset, currentPriceUsd: 6.0462 / 1.4, priceCheckStatus: 'error' },
  };
  rerender(<PositionTable positions={[updated]} fxRate={1.4} />);
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText('$4.3187')).toBeInTheDocument();
  expect(dialog.getByText(/Refresh failed/)).toBeInTheDocument();
  expect(dialog.getByText(/Published NAV.*6.0462/)).toBeInTheDocument();
  expect(dialog.getByText(/NAV as of 09 Sep/)).toBeInTheDocument();
});
