import type { ComponentProps } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Position } from '@/lib/types';
import { PositionDeltaEditor } from '../PositionDeltaEditor';
import { MASKED_MONEY_VALUE, usePrivacyStore } from '@/stores/privacyStore';
import { applyPositionDelta } from '@foliobuddy/shared';

afterEach(() => act(() => usePrivacyStore.getState().setValuesHidden(false)));

const position = {
  id: 'sol-position',
  assetId: 'sol',
  asset: {
    id: 'sol',
    category: 'LIQUID_CRYPTO',
    symbol: 'SOL',
    name: 'Solana',
  },
  storageType: 'CEX',
  storageLocation: 'Binance',
  custodyOf: null,
  quantity: 10,
  avgCostUsd: 100,
  marketValueUsd: 1_500,
  unrealizedPnL: 500,
  unrealizedPnLPct: 50,
} as Position;

function renderEditor(overrides: Partial<ComponentProps<typeof PositionDeltaEditor>> = {}) {
  return render(
    <PositionDeltaEditor
      position={position}
      deltaMode="add"
      onDeltaModeChange={vi.fn()}
      additionalQuantity=""
      onAdditionalQuantityChange={vi.fn()}
      additionalCostInputMode="total"
      onAdditionalCostInputModeChange={vi.fn()}
      additionalTotalCost=""
      calculatedAdditionalTotalCost=""
      onAdditionalTotalCostChange={vi.fn()}
      additionalAvgCostInput=""
      calculatedAdditionalAvgCost=""
      onAdditionalAvgCostChange={vi.fn()}
      costCurrency="USD"
      preview={null}
      error={null}
      validationError={null}
      fundingSlot={<div data-testid="fund-slot" />}
      custodySlot={null}
      isLoading={false}
      canSubmit
      {...overrides}
    />
  );
}

describe('PositionDeltaEditor', () => {
  it.each([12.3456789012345, 1.2345678901234567e-8, 1e21])(
    'fills the complete balance without rounding or exponent notation (%s)',
    (quantity) => {
      const onChange = vi.fn();
      renderEditor({
        deltaMode: 'reduce',
        position: { ...position, quantity },
        onAdditionalQuantityChange: onChange,
      });
      const reduceMax = screen.getByRole('button', { name: 'Reduce max SOL' });
      expect(reduceMax).toHaveAttribute('type', 'button');
      expect(reduceMax).toHaveTextContent('SOL');
      fireEvent.click(reduceMax);
      const value = onChange.mock.calls[0][0] as string;
      expect(value).not.toMatch(/[eE,]/);
      expect(Number(value)).toBe(quantity);
      expect(
        applyPositionDelta({
          currentQuantity: quantity,
          currentAvgCostUsd: position.avgCostUsd,
          deltaQuantity: Number(value),
          mode: 'reduce',
        }).nextQuantity
      ).toBe(0);
    }
  );

  it('keeps the available balance masked when values are hidden', () => {
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    renderEditor({ deltaMode: 'reduce' });
    const reduceMax = screen.getByRole('button', { name: 'Reduce max SOL' });
    expect(reduceMax).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(reduceMax).not.toHaveTextContent('10');
  });

  it.each([0, -10, Number.NaN, Number.POSITIVE_INFINITY])(
    'disables Reduce max for a non-positive or invalid balance (%s)',
    (quantity) => {
      const onChange = vi.fn();
      renderEditor({
        deltaMode: 'reduce',
        position: { ...position, quantity },
        onAdditionalQuantityChange: onChange,
      });
      const reduceMax = screen.getByRole('button', { name: 'Reduce max SOL' });
      expect(reduceMax).toBeDisabled();
      fireEvent.click(reduceMax);
      expect(onChange).not.toHaveBeenCalled();
    }
  );

  it('disables Reduce max while saving and omits it in Add mode', () => {
    const { unmount } = renderEditor({ deltaMode: 'reduce', isLoading: true });
    expect(screen.getByRole('button', { name: 'Reduce max SOL' })).toBeDisabled();
    unmount();
    renderEditor({ deltaMode: 'add' });
    expect(screen.queryByRole('button', { name: 'Reduce max SOL' })).not.toBeInTheDocument();
  });

  it('masks read-only quantities and previews while keeping the entered quantity editable', () => {
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    renderEditor({
      additionalQuantity: '2.5',
      preview: {
        currentQuantity: 10,
        currentAvgCost: 100,
        currentTotalCost: 1000,
        nextQuantity: 12.5,
        nextAvgCost: 110,
        nextTotalCost: 1375,
      },
    });
    expect(screen.getAllByText(MASKED_MONEY_VALUE)).toHaveLength(7);
    expect(screen.getByLabelText('Additional Quantity')).toHaveValue('2.5');
    expect(screen.queryByText('12.5')).not.toBeInTheDocument();
    act(() => usePrivacyStore.getState().toggleValuesHidden());
    expect(screen.getByText('12.5')).toBeInTheDocument();
  });

  it('reduce mode: proceeds/avg price are optional, funding slot renders, submit reads Reduce Position', () => {
    renderEditor({ deltaMode: 'reduce' });

    // Labels render as plain text ("Total Proceeds (USD)"); a function matcher keeps
    // the lookup resilient to the currency suffix. Optionality is conveyed by the
    // helper paragraph wired to both inputs via aria-describedby.
    const totalProceedsInput = screen.getByLabelText((content) =>
      content.startsWith('Total Proceeds (USD)')
    );
    const avgPriceInput = screen.getByLabelText((content) => content.startsWith('Avg Price (USD)'));

    expect(totalProceedsInput).not.toBeRequired();
    expect(avgPriceInput).not.toBeRequired();

    expect(screen.getByText('Total Proceeds')).toBeInTheDocument();
    expect(screen.getByText('Avg Price')).toBeInTheDocument();

    expect(screen.getByTestId('fund-slot')).toBeInTheDocument();

    expect(screen.getByText(/average cost/i)).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Reduce Position' })).toBeInTheDocument();
  });

  it('add mode: total/average cost are required, funding slot renders, submit reads Add to Position', () => {
    renderEditor({ deltaMode: 'add' });

    const totalCostInput = screen.getByLabelText('Total Cost (USD)');
    const avgCostInput = screen.getByLabelText('Average Cost (USD)');

    expect(totalCostInput).toBeRequired();
    expect(avgCostInput).toBeRequired();

    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('Avg Cost')).toBeInTheDocument();

    expect(screen.getByTestId('fund-slot')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Add to Position' })).toBeInTheDocument();
  });

  it('warns that reducing to zero closes and removes the position', () => {
    const basePreview = {
      currentQuantity: 10,
      currentAvgCost: 100,
      currentTotalCost: 1_000,
      nextAvgCost: 100,
    };

    const { rerender, unmount } = renderEditor({
      deltaMode: 'reduce',
      preview: { ...basePreview, nextQuantity: 4, nextTotalCost: 400 },
    });
    expect(screen.queryByText(/closes the position/i)).not.toBeInTheDocument();
    unmount();
    void rerender;

    renderEditor({
      deltaMode: 'reduce',
      preview: { ...basePreview, nextQuantity: 0, nextAvgCost: 0, nextTotalCost: 0 },
    });
    expect(screen.getByText(/closes the position/i)).toBeInTheDocument();
  });

  it('shows the same fractional native average before and after a partial sale', () => {
    const average = 60_000.123456;
    renderEditor({
      position: { ...position, avgCostNative: average, costCurrency: 'KRW' },
      costCurrency: 'KRW',
      deltaMode: 'reduce',
      preview: {
        currentQuantity: 30,
        currentAvgCost: average,
        currentTotalCost: 30 * average,
        nextQuantity: 25,
        nextAvgCost: average,
        nextTotalCost: 25 * average,
      },
    });

    expect(screen.getAllByText('60000.1235')).toHaveLength(2);
  });
});
