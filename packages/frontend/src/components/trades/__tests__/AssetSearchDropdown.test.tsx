import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Asset, CoinSearchResult } from '@/lib/types';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

const catalog: { assets: Asset[]; coins: CoinSearchResult[] } = { assets: [], coins: [] };

vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: catalog.assets }),
  useSearchCoins: () => ({ data: catalog.coins, isLoading: false }),
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
  it('offers the bitcoin coin although a BTC spot ETF is already in the catalog', () => {
    catalog.assets = [btcEtf];
    catalog.coins = [{ id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 }];

    render(<AssetSearchDropdown selectedAsset={null} onSelectAsset={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'btc' } });

    expect(screen.getByRole('option', { name: /Grayscale Bitcoin Mini Trust ETF/ })).toBeVisible();
    expect(screen.getByRole('option', { name: /^BTC\s*Bitcoin/ })).toBeVisible();
  });
});
