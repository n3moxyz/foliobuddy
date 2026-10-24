import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Trade } from '@/lib/types';
import { useTradeSortStore } from '@/stores/tradeSortStore';
import { TradeTapeSection } from '../TradeTapeSection';

vi.mock('@/hooks/useMoneyFormatter', () => ({
  useMoneyFormatter: () => ({
    formatCurrency: String,
    formatPrice: String,
    formatQuantity: String,
    formatSignedCurrency: String,
  }),
}));

function trade(symbol: string, entryDate: string, exitDate: string): Trade {
  return {
    id: symbol,
    assetId: symbol,
    asset: {
      id: symbol,
      symbol,
      name: `${symbol} full name`,
      category: 'LIQUID_CRYPTO',
      coingeckoId: null,
      priceProvider: 'manual',
      providerAssetId: null,
      nativeCurrency: 'USD',
      exchange: null,
      factsheetUrl: null,
      isin: null,
      currentPriceUsd: 0,
      priceUpdatedAt: null,
    },
    direction: 'LONG',
    entryPrice: 10,
    exitPrice: 11,
    quantity: 1,
    positionSizeUsd: 10,
    entryDate,
    exitDate,
    fundingCost: 0,
    status: 'CLOSED',
    realizedPnL: 1,
    realizedPnLPct: 10,
    notes: null,
    tags: null,
  };
}

const trades = [trade('A', '2026-10-01', '2026-10-24'), trade('B', '2026-10-20', '2026-10-21')];

function renderTape() {
  return render(
    <TradeTapeSection
      trades={trades}
      isLoading={false}
      filter="all"
      onFilterChange={vi.fn()}
      filteredCount={2}
      openCount={0}
      closedCount={2}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  );
}

function rowOrder() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.getAttribute('aria-label'));
}

describe('trade order controls', () => {
  beforeEach(() => useTradeSortStore.setState({ defaultSort: 'entryDate-desc' }));
  afterEach(cleanup);

  it('shows the opening chronology and its active column indicator', () => {
    renderTape();
    expect(rowOrder()).toEqual(['View B LONG trade', 'View A LONG trade']);
    expect(screen.getByRole('button', { name: 'Entry Date' }).closest('th')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    expect(screen.getByRole('combobox', { name: 'Default trade order' })).toHaveTextContent(
      'Entry date: newest first'
    );
  });

  it('returns to the saved default when a temporary header sort is cleared', () => {
    useTradeSortStore.getState().setDefaultSort('exitDate-desc');
    renderTape();
    const assetHeader = screen.getByRole('button', { name: 'Asset' });
    fireEvent.click(assetHeader);
    fireEvent.click(assetHeader);
    expect(rowOrder()).toEqual(['View B LONG trade', 'View A LONG trade']);
    fireEvent.click(assetHeader);
    expect(rowOrder()).toEqual(['View A LONG trade', 'View B LONG trade']);
    expect(screen.getByRole('button', { name: 'Exit Date' }).closest('th')).toHaveAttribute(
      'aria-sort',
      'descending'
    );
    expect(useTradeSortStore.getState().defaultSort).toBe('exitDate-desc');
  });

  it('applies a changed saved default immediately and clears the temporary override', () => {
    renderTape();
    fireEvent.click(screen.getByRole('button', { name: 'Asset' }));
    expect(rowOrder()[0]).toBe('View A LONG trade');
    act(() => useTradeSortStore.getState().setDefaultSort('exitDate-asc'));
    expect(rowOrder()[0]).toBe('View B LONG trade');
    expect(screen.getByRole('button', { name: 'Asset' }).closest('th')).toHaveAttribute(
      'aria-sort',
      'none'
    );
  });
});
