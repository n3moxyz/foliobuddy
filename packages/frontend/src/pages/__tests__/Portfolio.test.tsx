import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@/lib/types';
import Portfolio from '../Portfolio';

const perpMocks = vi.hoisted(() => ({
  exposure: 0,
  save: vi.fn(() => true),
}));

const positions = [
  {
    id: 'btc-position',
    assetId: 'btc',
    asset: {
      id: 'btc',
      category: 'LIQUID_CRYPTO',
      symbol: 'BTC',
      name: 'Bitcoin',
    },
    storageType: 'CEX',
    storageLocation: 'Binance',
    custodyOf: null,
    quantity: 1,
    avgCostUsd: 50_000,
    marketValueUsd: 60_000,
    unrealizedPnL: 10_000,
    unrealizedPnLPct: 20,
  },
  {
    id: 'equity-position',
    assetId: 'nbis',
    asset: {
      id: 'nbis',
      category: 'EQUITY',
      symbol: 'NBIS',
      name: 'Nebius',
    },
    storageType: 'BROKERAGE',
    storageLocation: 'Tiger',
    custodyOf: null,
    quantity: 100,
    avgCostUsd: 30,
    marketValueUsd: 4_000,
    unrealizedPnL: 1_000,
    unrealizedPnLPct: 33.33,
  },
  {
    id: 'cash-position',
    assetId: 'cash-usd',
    asset: {
      id: 'cash-usd',
      category: 'CASH',
      symbol: 'USD',
      name: 'Cash USD',
    },
    storageType: 'BROKERAGE',
    storageLocation: 'Tiger',
    custodyOf: null,
    quantity: 10_000,
    avgCostUsd: 1,
    marketValueUsd: 10_000,
    unrealizedPnL: 0,
    unrealizedPnLPct: 0,
  },
] as Position[];

vi.mock('@/hooks/usePortfolio', () => ({
  usePositions: () => ({ data: positions, isLoading: false }),
  usePortfolioSummary: () => ({ data: undefined }),
  useFxRates: () => ({ data: [] }),
  useDrawdownStats: () => ({
    ytdAthUsd: null,
    currentDrawdownPct: null,
    maxDrawdownPct: null,
    maxDailyDrawdownPct: null,
  }),
  useDeleteAllPositions: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/usePerpExposure', () => ({
  usePerpExposure: () => ({
    perpExposure: perpMocks.exposure,
    savePerpExposure: perpMocks.save,
    isReady: true,
    isSaving: false,
  }),
}));

vi.mock('@/components/portfolio/PositionTable', () => ({
  PositionTable: ({
    positions: tablePositions,
    sectionPrefix,
    groupBy,
    mobileVariant,
    showMobileColumnToggle,
  }: {
    positions: Position[];
    sectionPrefix: string;
    groupBy: string;
    mobileVariant?: string;
    showMobileColumnToggle?: boolean;
  }) => (
    <div
      data-testid={`position-table-${sectionPrefix}`}
      data-group-by={groupBy}
      data-mobile-variant={mobileVariant}
      data-mobile-column-toggle={String(showMobileColumnToggle)}
    >
      {tablePositions.map((position) => position.asset.symbol).join(',')}
    </div>
  ),
}));

vi.mock('@/components/portfolio/CollapsibleCard', () => ({
  CollapsibleCard: ({
    title,
    headerExtra,
    children,
  }: {
    title: string;
    headerExtra?: ReactNode;
    children: ReactNode;
  }) => (
    <section>
      <h2>{title}</h2>
      {headerExtra}
      {children}
    </section>
  ),
}));

vi.mock('@/components/portfolio/PositionForm', () => ({
  PositionForm: () => null,
}));

vi.mock('@/components/portfolio/UpdateNavModal', () => ({
  UpdateNavModal: () => null,
}));

describe('Portfolio responsive grouping', () => {
  beforeEach(() => {
    perpMocks.exposure = 0;
    perpMocks.save.mockClear();
  });

  it('keeps desktop asset categories on mobile while using compact rows', () => {
    render(<Portfolio />);

    const crypto = screen.getByTestId('position-table-mobile-crypto');
    const equities = screen.getByTestId('position-table-mobile-equities');
    const cash = screen.getByTestId('position-table-mobile-cash');

    expect(crypto).toHaveTextContent('BTC');
    expect(crypto).toHaveAttribute('data-group-by', 'storage');
    expect(equities).toHaveTextContent('NBIS');
    expect(equities).toHaveAttribute('data-group-by', 'broker');
    expect(cash).toHaveTextContent('USD');
    expect(cash).toHaveAttribute('data-group-by', 'storage');

    for (const table of [crypto, equities, cash]) {
      expect(table).toHaveAttribute('data-mobile-variant', 'compact');
      expect(table).toHaveAttribute('data-mobile-column-toggle', 'false');
    }

    expect(screen.queryByTestId('position-table-mobile-owned')).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'By Type' })[0]);
    expect(equities).toHaveAttribute('data-group-by', 'equityType');
  });

  it('does not save an invalid perp dialog value', async () => {
    render(<Portfolio />);

    fireEvent.pointerDown(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add Perp' }));

    const input = screen.getByLabelText('Position Size (USD)');
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.change(input, { target: { value: '.' } });

    expect(save).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(perpMocks.save).not.toHaveBeenCalled();
  });

  it('saves an inline perp edit exactly once when Enter blurs the input', () => {
    perpMocks.exposure = 350_000;
    render(<Portfolio />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit perp exposure' }));
    const input = screen.getByLabelText('Perp exposure in USD');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(perpMocks.save).toHaveBeenCalledTimes(1);
    expect(perpMocks.save).toHaveBeenCalledWith(350_000);
  });
});
