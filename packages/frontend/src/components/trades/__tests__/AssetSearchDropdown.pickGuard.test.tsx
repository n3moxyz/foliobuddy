import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { Asset, CoinSearchResult } from '@/lib/types';
import { AssetSearchDropdown } from '../AssetSearchDropdown';

const mutateAsync = vi.fn();

vi.mock('@/hooks/useAssets', () => ({
  useAssets: () => ({ data: [] }),
  useSearchCoins: () => ({ data: [ethenaCoin], isLoading: false }),
  useCreateAssetFromCoinGecko: () => ({ mutateAsync, isPending: false }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const ethenaCoin: CoinSearchResult = {
  id: 'ethena-usde',
  symbol: 'usde',
  name: 'Ethena USDe',
  rank: 40,
};

function catalogAsset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    coingeckoId: null,
    priceProvider: 'coingecko',
    providerAssetId: null,
    nativeCurrency: 'USD',
    exchange: null,
    factsheetUrl: null,
    isin: null,
    symbol: 'USDE',
    name: 'Ethena USDe',
    category: 'LIQUID_CRYPTO',
    currentPriceUsd: 1,
    priceUpdatedAt: null,
    ...overrides,
  };
}

type OnSelectAsset = (assetId: string, asset: Asset) => void;

async function pickEthenaCoin(onSelectAsset: OnSelectAsset) {
  render(<AssetSearchDropdown selectedAsset={null} onSelectAsset={onSelectAsset} />);
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: 'usde' } });
  fireEvent.click(await screen.findByRole('option', { name: /Ethena USDe/ }));
  await waitFor(() => expect(mutateAsync).toHaveBeenCalled());
}

describe('Trades asset picker: server returns a different asset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses a coin pick that the server resolved to a same-ticker stock', async () => {
    mutateAsync.mockResolvedValue(
      catalogAsset({
        id: 'stablecoinx',
        priceProvider: 'yahoo',
        providerAssetId: 'USDE',
        name: 'StablecoinX Inc.',
        category: 'EQUITY',
      })
    );
    const onSelectAsset = vi.fn<OnSelectAsset>();

    await pickEthenaCoin(onSelectAsset);

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Couldn't select Ethena USDe", {
        description: expect.stringContaining('StablecoinX Inc. (Equities)'),
      })
    );
    expect(onSelectAsset).not.toHaveBeenCalled();
  });

  it('selects the coin when the server returns it', async () => {
    const coinRow = catalogAsset({ id: 'ethena', coingeckoId: 'ethena-usde' });
    mutateAsync.mockResolvedValue(coinRow);
    const onSelectAsset = vi.fn<OnSelectAsset>();

    await pickEthenaCoin(onSelectAsset);

    await waitFor(() => expect(onSelectAsset).toHaveBeenCalledWith('ethena', coinRow));
    expect(toast.error).not.toHaveBeenCalled();
  });
});
