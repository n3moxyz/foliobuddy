import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Position } from '@/lib/types';
import { PositionDeltaEditor } from '../PositionDeltaEditor';

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
});
