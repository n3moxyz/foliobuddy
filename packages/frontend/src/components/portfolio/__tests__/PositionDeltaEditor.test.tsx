import { createTestQueryClient, createQueryClientWrapper } from '@/test/utils';
import { USER_PREFERENCES_QUERY_KEY } from '@/hooks/useUserPreferences';
import { useState, type ComponentProps } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
  const {
    additionalQuantity: initialQuantity = '',
    onAdditionalQuantityChange = vi.fn(),
    ...props
  } = overrides;
  function EditorHarness() {
    const [quantity, setQuantity] = useState(initialQuantity);
    return (
      <PositionDeltaEditor
        position={position}
        deltaMode="add"
        onDeltaModeChange={vi.fn()}
        additionalQuantity={quantity}
        onAdditionalQuantityChange={(value) => {
          setQuantity(value);
          onAdditionalQuantityChange(value);
        }}
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
        {...props}
      />
    );
  }
  const client = createTestQueryClient();
  client.setQueryData(USER_PREFERENCES_QUERY_KEY, {
    snapshotHour: 5,
    snapshotTimezone: 'Asia/Singapore',
    perpExposureUsd: null,
    reducePercentages: [25, 50, 75, 100],
  });
  return render(<EditorHarness />, { wrapper: createQueryClientWrapper(client) });
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
      expect(
        within(screen.getByRole('group', { name: 'Reduce quantity controls' })).getByText('SOL')
      ).toBeInTheDocument();
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
      fireEvent.click(screen.getByRole('button', { name: 'Reduce 25%' }));
      fireEvent.click(screen.getByRole('button', { name: 'Reduce 100%' }));
      expect(onChange.mock.calls.at(-1)?.[0]).toBe(value);
    }
  );

  it('groups the amount, balance, estimate, and four percentage buttons without a slider', () => {
    renderEditor({ deltaMode: 'reduce' });
    const panel = screen.getByRole('group', { name: 'Reduce quantity controls' });
    expect(panel).toContainElement(screen.getByLabelText('Reduce Quantity'));
    expect(within(panel).getByRole('button', { name: 'Reduce max SOL' })).toHaveTextContent(
      'Balance:'
    );
    expect(within(panel).getByRole('group', { name: 'Reduce percentage' })).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });

  it.each([25, 50, 75, 100])('fills %s percent without submitting the form', (percentage) => {
    renderEditor({ deltaMode: 'reduce' });
    const button = screen.getByRole('button', { name: 'Reduce ' + percentage + '%' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(screen.getByLabelText('Reduce Quantity')).toHaveValue(String(percentage / 10));
    expect(button).toHaveAttribute('aria-pressed', 'true');
  });

  it('keeps preset selection in sync with typed quantities', () => {
    renderEditor({ deltaMode: 'reduce' });
    const input = screen.getByLabelText('Reduce Quantity');
    fireEvent.change(input, { target: { value: '5' } });
    expect(screen.getByRole('button', { name: 'Reduce 50%' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    fireEvent.change(input, { target: { value: '6.25' } });
    expect(screen.getByRole('button', { name: 'Reduce 50%' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reduce max SOL' }));
    expect(screen.getByRole('button', { name: 'Reduce 100%' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows a masked USD estimate from the current quote, never from cost basis', () => {
    renderEditor({
      deltaMode: 'reduce',
      additionalQuantity: '2',
      position: {
        ...position,
        asset: { ...position.asset, currentPriceUsd: 150 },
      },
    });
    expect(screen.getByLabelText('Estimated value in USD')).toHaveTextContent('$300.00');
    act(() => usePrivacyStore.getState().setValuesHidden(true));
    expect(screen.getByLabelText('Estimated value in USD')).toHaveTextContent(MASKED_MONEY_VALUE);
    expect(screen.getByLabelText('Reduce Quantity')).toHaveValue('2');
  });

  it('keeps an over-balance typed quantity for validation without silently capping it', () => {
    renderEditor({ deltaMode: 'reduce' });
    const input = screen.getByLabelText('Reduce Quantity');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '12' } });
    expect(input).toHaveValue('12');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Exceeds balance');
    expect(screen.getByRole('button', { name: 'Reduce 100%' })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    fireEvent.change(input, { target: { value: '5' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-invalid');
  });

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
      for (const stop of [25, 50, 75, 100]) {
        expect(screen.getByRole('button', { name: 'Reduce ' + stop + '%' })).toBeDisabled();
      }
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

  it('keeps the current balance in the Add amount panel without limiting the addition', () => {
    renderEditor({ deltaMode: 'add' });
    const amount = screen.getByRole('group', { name: 'Additional Quantity controls' });
    const input = screen.getByLabelText('Additional Quantity');
    expect(amount).toContainElement(input);
    expect(within(amount).getByText('SOL')).toBeInTheDocument();
    expect(within(amount).getByText('Balance:')).toBeInTheDocument();
    expect(within(amount).getByText('10 SOL')).toBeInTheDocument();
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '50' } });
    expect(input).toHaveValue('50');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
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
    expect(screen.getAllByText(MASKED_MONEY_VALUE)).toHaveLength(6);
    expect(screen.getByRole('group', { name: 'Additional Quantity controls' })).toHaveTextContent(
      `${MASKED_MONEY_VALUE} SOL`
    );
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

  it('warns that reducing to zero deletes the position and its history', () => {
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
    expect(screen.queryByText(/deletes the position/i)).not.toBeInTheDocument();
    unmount();
    void rerender;

    renderEditor({
      deltaMode: 'reduce',
      preview: { ...basePreview, nextQuantity: 0, nextAvgCost: 0, nextTotalCost: 0 },
    });
    expect(screen.getByText(/deletes the position/i)).toBeInTheDocument();
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
