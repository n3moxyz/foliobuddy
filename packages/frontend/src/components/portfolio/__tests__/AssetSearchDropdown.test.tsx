import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset } from '@/lib/types';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

const bitcoin = {
  id: 'bitcoin-asset',
  symbol: 'BTC',
  name: 'Bitcoin',
} as Asset;

function renderDropdown(props: Partial<ComponentProps<typeof AssetSearchDropdown>> = {}) {
  return render(
    <AssetSearchDropdown
      selectedAsset={null}
      searchQuery=""
      showDropdown
      highlightedIndex={-1}
      searchLoading={false}
      combinedResults={[]}
      isEditing={false}
      onSearchChange={vi.fn()}
      onFocus={vi.fn()}
      onBlur={vi.fn()}
      onKeyDown={vi.fn()}
      onSelectExistingAsset={vi.fn()}
      onSelectCoin={vi.fn()}
      onClearSelection={vi.fn()}
      setHighlightedIndex={vi.fn()}
      setValidationError={vi.fn()}
      {...props}
    />
  );
}

describe('AssetSearchDropdown', () => {
  it('selects catalog assets without claiming the user holds them', () => {
    const onSelectExistingAsset = vi.fn();
    const onSelectCoin = vi.fn();

    renderDropdown({
      combinedResults: [{ type: 'existing', asset: bitcoin }],
      onSelectExistingAsset,
      onSelectCoin,
    });

    expect(screen.queryByText('In portfolio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /BTC.*Bitcoin/ }));

    expect(onSelectExistingAsset).toHaveBeenCalledWith(bitcoin);
    expect(onSelectCoin).not.toHaveBeenCalled();
  });
});

describe('AssetSearchDropdown: search states', () => {
  it('shows "No matching assets" for a settled empty search', () => {
    renderDropdown({ searchQuery: 'pepe' });

    expect(screen.getByText('No matching assets')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows Searching…, not "No matching assets", while the search is pending', () => {
    // PositionForm passes the debounce wait as searchLoading too.
    renderDropdown({ searchQuery: 'pepe', searchLoading: true });

    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
  });

  it('shows the search error, not "No matching assets", and retries from the notice', () => {
    const onRetrySearch = vi.fn();
    renderDropdown({ searchQuery: 'pepe', searchFailed: true, onRetrySearch });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("Couldn't search assets");
    expect(alert).toHaveTextContent('Check your connection and try again.');
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
    // The status lines live in the listbox; a failed search with no matches has none.
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    const retry = screen.getByRole('button', { name: 'Try again' });
    // The picker sits inside the position form, where a bare button would submit it.
    expect(retry).toHaveAttribute('type', 'button');
    fireEvent.click(retry);

    expect(onRetrySearch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('keeps catalog matches visible beside the search error', () => {
    renderDropdown({
      searchQuery: 'btc',
      searchFailed: true,
      combinedResults: [{ type: 'existing', asset: bitcoin }],
    });

    expect(screen.getByRole('option', { name: /BTC.*Bitcoin/ })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't search assets");
  });

  it('treats whitespace-only input as no query', () => {
    renderDropdown({ searchQuery: '   ' });

    expect(screen.getByText('Type to search assets…')).toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
  });

  it('marks no option active while Searching… hides the list', () => {
    renderDropdown({
      searchQuery: 'btc',
      searchLoading: true,
      highlightedIndex: 0,
      combinedResults: [{ type: 'existing', asset: bitcoin }],
    });

    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).not.toHaveAttribute('aria-activedescendant');
  });

  it('closes only when focus leaves the picker, so Tab can reach Try again', () => {
    const onBlur = vi.fn();
    renderDropdown({ searchQuery: 'pepe', searchFailed: true, onBlur });
    const input = screen.getByRole('combobox');
    input.focus();

    screen.getByRole('button', { name: 'Try again' }).focus();
    expect(onBlur).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Try again' }).blur();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
