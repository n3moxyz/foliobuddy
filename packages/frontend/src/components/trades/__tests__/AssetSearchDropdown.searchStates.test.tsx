import type { FormEvent } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import type { Asset, CoinSearchResult } from '@/lib/types';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

// Real search hooks against a stubbed API: the wrong "No matching assets" came from
// the debounce, the request state and the dropdown together.

const pepeCoin: CoinSearchResult = { id: 'pepe', symbol: 'pepe', name: 'Pepe', rank: 30 };

const solana: Asset = {
  id: 'solana-asset',
  coingeckoId: 'solana',
  priceProvider: 'coingecko',
  providerAssetId: 'solana',
  nativeCurrency: 'USD',
  exchange: null,
  factsheetUrl: null,
  isin: null,
  symbol: 'SOL',
  name: 'Solana',
  category: 'LIQUID_CRYPTO',
  currentPriceUsd: 150,
  priceUpdatedAt: null,
};

const offline = () => new TypeError('Failed to fetch');

function renderPicker({ catalog = [] as Asset[] } = {}) {
  vi.spyOn(api, 'getAssets').mockResolvedValue(catalog);
  const onSelectAsset = vi.fn();
  const onSubmit = vi.fn((event: FormEvent) => event.preventDefault());
  const Wrapper = createQueryClientWrapper(createTestQueryClient());
  render(
    <Wrapper>
      {/* TradeForm wraps the picker in a form, so a stray submit would show. */}
      <form onSubmit={onSubmit}>
        <AssetSearchDropdown selectedAsset={null} onSelectAsset={onSelectAsset} />
      </form>
      <button type="button">Outside</button>
    </Wrapper>
  );
  const input = screen.getByRole('combobox');
  act(() => input.focus());
  return { input, onSelectAsset, onSubmit };
}

describe('Trades asset picker: search states', () => {
  beforeEach(() => {
    vi.spyOn(api, 'searchCoins').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Searching…, not "No matching assets", while the debounce waits', async () => {
    const { input } = renderPicker();

    fireEvent.change(input, { target: { value: 'zzz' } });

    // No request has started, so there is no answer to report yet.
    expect(api.searchCoins).not.toHaveBeenCalled();
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();

    // A successful empty response is a real "no match".
    expect(await screen.findByText('No matching assets')).toBeInTheDocument();
    expect(api.searchCoins).toHaveBeenCalledWith('zzz');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the error, not "No matching assets", when the search fails, and retries it', async () => {
    vi.mocked(api.searchCoins).mockRejectedValueOnce(offline());
    const { input, onSubmit } = renderPicker();

    fireEvent.change(input, { target: { value: 'pepe' } });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't search assets");
    expect(alert).toHaveTextContent('Check your connection and try again.');
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();

    vi.mocked(api.searchCoins).mockResolvedValueOnce([pepeCoin]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('option', { name: /PEPE\s*Pepe/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.searchCoins).toHaveBeenCalledTimes(2);
    expect(input).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps catalog matches visible beside the error', async () => {
    vi.mocked(api.searchCoins).mockRejectedValue(offline());
    const { input } = renderPicker({ catalog: [solana] });

    fireEvent.change(input, { target: { value: 'sol' } });

    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't search assets");
    expect(screen.getByRole('option', { name: /SOL\s*Solana/ })).toBeInTheDocument();
  });

  it('lets Tab reach Try again without closing, and closes once focus leaves', async () => {
    vi.mocked(api.searchCoins).mockRejectedValue(offline());
    const { input } = renderPicker();

    fireEvent.change(input, { target: { value: 'pepe' } });
    const retry = await screen.findByRole('button', { name: 'Try again' });

    act(() => retry.focus());
    expect(retry).toHaveFocus();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'true');

    act(() => screen.getByRole('button', { name: 'Outside' }).focus());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  it('treats whitespace alone as no query: no search and no empty line', async () => {
    const { input } = renderPicker();
    await waitFor(() => expect(api.getAssets).toHaveBeenCalled());

    fireEvent.change(input, { target: { value: '   ' } });

    expect(screen.getByText('Type to search assets…')).toBeInTheDocument();
    expect(screen.queryByText('Searching…')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
    // Outlast the 150 ms debounce: whitespace never reaches the API.
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(api.searchCoins).not.toHaveBeenCalled();
    expect(screen.getByText('Type to search assets…')).toBeInTheDocument();
    expect(screen.queryByText('No matching assets')).not.toBeInTheDocument();
  });

  it('ignores Enter while Searching… hides the list', async () => {
    vi.mocked(api.searchCoins).mockImplementation(() => new Promise(() => {}));
    const { input, onSelectAsset } = renderPicker({ catalog: [solana] });
    // The catalog lists on focus, before any query.
    await screen.findByRole('option', { name: /SOL\s*Solana/ });

    fireEvent.change(input, { target: { value: 'sol' } });
    expect(screen.getByText('Searching…')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    // fireEvent returns false when the handler prevented the default (form submit).
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(false);
    expect(onSelectAsset).not.toHaveBeenCalled();
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });
});
