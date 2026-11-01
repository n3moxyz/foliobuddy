import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset, CoinSearchResult } from '@/lib/types';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

const catalog: { assets: Asset[]; coins: CoinSearchResult[] } = { assets: [], coins: [] };

vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: catalog.assets }),
  useSearchCoins: () => ({
    data: catalog.coins,
    isSearching: false,
    isError: false,
    retry: vi.fn(),
  }),
  useCreateAssetFromCoinGecko: () => ({ mutateAsync: vi.fn() }),
}));

const btcEtf: Asset = {
  id: 'btc-etf',
  coingeckoId: null,
  priceProvider: 'yahoo',
  providerAssetId: 'BTC',
  nativeCurrency: 'USD',
  exchange: 'NYSEArca',
  factsheetUrl: null,
  isin: null,
  symbol: 'BTC',
  name: 'Grayscale Bitcoin Mini Trust ETF',
  category: 'EQUITY',
  currentPriceUsd: 45,
  priceUpdatedAt: null,
};

describe('AssetSearchDropdown', () => {
  it('selects catalog assets without claiming the user holds them', () => {
    catalog.assets = [btcEtf];
    catalog.coins = [];
    const onSelectAsset = vi.fn();

    render(<AssetSearchDropdown selectedAsset={null} onSelectAsset={onSelectAsset} />);
    fireEvent.focus(screen.getByRole('combobox'));

    expect(screen.queryByText('In portfolio')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('option', { name: /Grayscale Bitcoin Mini Trust ETF/ }));

    expect(onSelectAsset).toHaveBeenCalledWith(btcEtf.id, btcEtf);
  });

  it('offers the bitcoin coin although a BTC spot ETF is already in the catalog', () => {
    catalog.assets = [btcEtf];
    catalog.coins = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 }];

    render(<AssetSearchDropdown selectedAsset={null} onSelectAsset={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'btc' } });

    expect(screen.getByRole('option', { name: /Grayscale Bitcoin Mini Trust ETF/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /^BTC\s*Bitcoin/ })).toBeVisible();
  });
});
