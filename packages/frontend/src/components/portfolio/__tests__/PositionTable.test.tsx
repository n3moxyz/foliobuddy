import { fireEvent, render, screen, within } from '@testing-library/react';
import { it, expect, vi } from 'vitest';
import { PositionTable } from '../PositionTable';
import type { Position } from '@/lib/types';

vi.mock('@/hooks/usePortfolio', () => ({
  useDeletePosition: () => ({ mutateAsync: vi.fn() }),
  useCancelPositionHistory: () => ({ mutateAsync: vi.fn() }),
  usePositionHistory: () => ({ data: [] }),
}));
vi.mock('../PositionForm', () => ({ PositionForm: () => null }));

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
