import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PositionTable } from '../PositionTable';
import * as ibkrSync from '../ibkrDirectSync';
import type { Position, PositionHistoryEntry } from '@/lib/types';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';
import { useMediaQuery } from '@/hooks/useMediaQuery';

const { historyMock } = vi.hoisted(() => ({
  historyMock: vi.fn(() => ({ data: [] as PositionHistoryEntry[] })),
}));

vi.mock('@/hooks/usePortfolio', () => ({
  useCancelPositionHistory: () => ({ mutateAsync: vi.fn() }),
  usePositionHistory: historyMock,
}));
vi.mock('../PositionForm', () => ({ PositionForm: () => null }));
vi.mock('@/hooks/useMediaQuery', () => ({ useMediaQuery: vi.fn(() => false) }));

afterEach(() => {
  act(() => usePrivacyStore.getState().setValuesHidden(false));
  historyMock.mockReturnValue({ data: [] });
  vi.mocked(useMediaQuery).mockReturnValue(false);
  vi.restoreAllMocks();
});

const privatePosition = {
  id: 'private-position',
  assetId: 'private-asset',
  quantity: 54321.25,
  avgCostUsd: 10,
  avgCostNative: 1500,
  marketValueUsd: 670324.225,
  storageType: 'BROKERAGE',
  storageLocation: 'Tiger',
  custodyOf: null,
  createdAt: '2026-01-01T00:00:00Z',
  asset: {
    id: 'private-asset',
    symbol: 'PRIVATE',
    name: 'Example asset',
    category: 'EQUITY',
    nativeCurrency: 'JPY',
    currentPriceUsd: 12.34,
  },
} as Position;

it('names group help for its storage topic', () => {
  render(
    <PositionTable
      positions={[
        { ...privatePosition, storageType: 'CEX', storageLocation: 'Binance' },
        { ...privatePosition, id: 'bank-position', storageType: 'BANK', storageLocation: 'DBS' },
      ]}
    />
  );

  expect(screen.getByRole('button', { name: 'Help: CEX' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Help: Bank' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Help' })).not.toBeInTheDocument();
});

it('saves a phone edit and applies the account order in the desktop layout', async () => {
  const positions: Position[] = [
    { ...privatePosition, id: 'cex-row', storageType: 'CEX', storageLocation: 'Binance' },
    { ...privatePosition, id: 'bank-row', storageType: 'BANK', storageLocation: 'DBS' },
    { ...privatePosition, id: 'broker-row' },
  ];
  const save = vi.fn(async () => {});
  vi.mocked(useMediaQuery).mockReturnValue(true);
  const view = render(
    <PositionTable
      positions={positions}
      sectionPrefix="mobile-cash"
      groupOrder={{ ready: true, save }}
    />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Reorder groups' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Reorder groups' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Move Bank up' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Move Bank up' }));
  fireEvent.click(dialog.getByRole('button', { name: 'Save order' }));
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Reorder groups' })).not.toBeInTheDocument()
  );
  expect(save).toHaveBeenCalledWith(['bank', 'cex', 'brokerage']);
  view.unmount();

  vi.mocked(useMediaQuery).mockReturnValue(false);
  render(
    <PositionTable
      positions={positions}
      sectionPrefix="cash"
      groupOrder={{ ready: true, save, order: ['bank', 'cex', 'brokerage'] }}
    />
  );
  const groupTriggers = screen.getAllByRole('button', {
    name: /^(CEX|Broker Account|Bank) \(/,
  });
  expect(groupTriggers.map((button) => button.textContent?.split('(')[0])).toEqual([
    'Bank',
    'CEX',
    'Broker Account',
  ]);
});

it.each(['CASH', 'STABLECOIN', 'LIQUID_CRYPTO', 'EQUITY', 'UNIT_TRUST'])(
  'masks %s quantities in desktop/mobile rows and details while showing current quotes',
  (category) => {
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    const props = {
      positions: [
        { ...privatePosition, asset: { ...privatePosition.asset, category } } as Position,
      ],
      usdFxRates: { JPY: 150 },
    };
    const { rerender } = render(<PositionTable {...props} />);
    const row = screen.getByRole('row', { name: 'View PRIVATE position' });
    const cells = within(row).getAllByRole('cell');
    expect(cells[1]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[2]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[3]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[4]).toHaveTextContent(category === 'UNIT_TRUST' ? '$12.3400' : '$12.34');
    expect(cells[4]).toHaveTextContent('JPY 1,851');
    expect(cells[5]).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(cells[2]).not.toHaveTextContent('JPY 1,500');

    fireEvent.click(within(row).getByRole('button', { name: 'View details' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Quantity').parentElement).toHaveTextContent(
      MASKED_MONEY_VALUE
    );
    expect(within(dialog).getByText('Current Price').parentElement).toHaveTextContent('$12.34');
    expect(within(dialog).getByText('Current Price').parentElement).toHaveTextContent('JPY 1,851');
    expect(dialog).not.toHaveTextContent('54,321.25');

    act(() => usePrivacyStore.getState().toggleValuesHidden());
    expect(cells[1]).toHaveTextContent('54,321.25');
    expect(cells[2]).toHaveTextContent('$10.00');
    expect(cells[2]).toHaveTextContent('JPY 1,500');
    expect(within(dialog).getByText('Quantity').parentElement).toHaveTextContent('54,321.25');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    vi.mocked(useMediaQuery).mockReturnValue(true);
    rerender(<PositionTable {...props} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const mobile = within(screen.getByRole('button', { name: /^View PRIVATE/ }));
    expect(mobile.getByText('Qty')).toHaveTextContent(`Qty${MASKED_MONEY_VALUE}`);
    expect(mobile.getByText('Price')).toHaveTextContent('$12.34');
    expect(mobile.getByText('Avg')).toHaveTextContent(MASKED_MONEY_VALUE);
  }
);

it('masks baseline, operation and resulting quantities in position history', () => {
  historyMock.mockReturnValue({
    data: [
      {
        id: 'reset',
        mode: 'reset',
        previousQuantity: 111.25,
        nextQuantity: 222.5,
        previousAvgCostUsd: 10,
        nextAvgCostUsd: 10,
        createdAt: '2026-02-01T00:00:00Z',
      } as PositionHistoryEntry,
      {
        id: 'add',
        mode: 'add',
        quantity: 123.125,
        costBasisUsd: 1231.25,
        previousQuantity: 222.5,
        nextQuantity: 345.625,
        previousAvgCostUsd: 10,
        nextAvgCostUsd: 10,
        createdAt: '2026-03-01T00:00:00Z',
      } as PositionHistoryEntry,
    ],
  });
  act(() => usePrivacyStore.getState().setValuesHidden(true));
  render(<PositionTable positions={[{ ...privatePosition, quantity: 345.625 }]} />);
  const row = screen.getByRole('row', { name: 'View PRIVATE position' });
  fireEvent.click(within(row).getByRole('button', { name: 'View details' }));
  const dialog = screen.getByRole('dialog');
  expect(within(dialog).getByText('Current Baseline')).toBeInTheDocument();
  expect(dialog).not.toHaveTextContent('111.25');
  expect(dialog).not.toHaveTextContent('222.5');
  expect(dialog).not.toHaveTextContent('123.125');
  expect(dialog).not.toHaveTextContent('345.625');
  act(() => usePrivacyStore.getState().toggleValuesHidden());
  expect(dialog).toHaveTextContent('111.25');
  expect(dialog).toHaveTextContent('222.5');
  expect(dialog).toHaveTextContent('123.125');
  expect(dialog).toHaveTextContent('345.625');
});

it('keeps IBKR sync outside the collapse toggle and excludes other brokers and custody', async () => {
  vi.spyOn(ibkrSync, 'syncIbkrOnDemand').mockResolvedValue(null);
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
  expect(await screen.findByRole('dialog')).toHaveTextContent('Connect This Mac Once');
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
  expect(dialog.getByText(/NAV as of 9 Sept? 2026/)).toBeInTheDocument();
});
