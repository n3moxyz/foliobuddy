import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/lib/types';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

const bitcoin = {
  id: 'bitcoin-asset',
  symbol: 'BTC',
  name: 'Bitcoin',
} as Asset;

describe('AssetSearchDropdown', () => {
  it('selects catalog assets without claiming the user holds them', () => {
    const onSelectExistingAsset = vi.fn();
    const onSelectCoin = vi.fn();

    render(
      <AssetSearchDropdown
        selectedAsset={null}
        searchQuery=""
        showDropdown
        highlightedIndex={-1}
        searchLoading={false}
        combinedResults={[{ type: 'existing', asset: bitcoin }]}
        isEditing={false}
        onSearchChange={vi.fn()}
        onFocus={vi.fn()}
        onBlur={vi.fn()}
        onKeyDown={vi.fn()}
        onSelectExistingAsset={onSelectExistingAsset}
        onSelectCoin={onSelectCoin}
        onClearSelection={vi.fn()}
        setHighlightedIndex={vi.fn()}
        setValidationError={vi.fn()}
      />
    );

    expect(screen.queryByText('In portfolio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /BTC.*Bitcoin/ }));

    expect(onSelectExistingAsset).toHaveBeenCalledWith(bitcoin);
    expect(onSelectCoin).not.toHaveBeenCalled();
  });
});
