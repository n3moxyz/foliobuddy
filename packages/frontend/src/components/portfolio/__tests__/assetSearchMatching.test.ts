import { describe, expect, it } from 'vitest';
import type { Asset, ProviderSearchResult } from '@/lib/types';
import { isListedEquityCandidate } from '../assetSearchMatching';

function asset(overrides: Partial<Asset>): Asset {
  return {
    id: 'asset-1',
    coingeckoId: null,
    priceProvider: 'coingecko',
    providerAssetId: null,
    nativeCurrency: 'USD',
    exchange: null,
    factsheetUrl: null,
    isin: null,
    symbol: 'X',
    name: 'X',
    category: 'LIQUID_CRYPTO',
    currentPriceUsd: 1,
    priceUpdatedAt: null,
    ...overrides,
  };
}

const stablecoinX: ProviderSearchResult = {
  id: 'USDE',
  providerAssetId: 'USDE',
  provider: 'yahoo',
  symbol: 'USDE',
  name: 'StablecoinX Inc.',
  exchange: 'NASDAQ',
  nativeCurrency: 'USD',
  rank: null,
};

const ethenaUsde = asset({
  id: 'ethena',
  coingeckoId: 'ethena-usde',
  providerAssetId: 'ethena-usde',
  symbol: 'USDE',
  name: 'Ethena USDe',
  category: 'STABLECOIN',
});

describe('isListedEquityCandidate', () => {
  it('keeps a Yahoo equity whose ticker only matches a stablecoin (StablecoinX vs Ethena USDe)', () => {
    expect(isListedEquityCandidate([ethenaUsde], stablecoinX)).toBe(false);
  });

  it('keeps a Yahoo equity whose ticker only matches a coin (BTC mini-trust ETF vs bitcoin)', () => {
    const bitcoin = asset({ coingeckoId: 'bitcoin', symbol: 'BTC', name: 'Bitcoin' });
    const btcEtf = { ...stablecoinX, id: 'BTC', providerAssetId: 'BTC', symbol: 'BTC' };

    expect(isListedEquityCandidate([bitcoin], btcEtf)).toBe(false);
  });

  it('hides a hit already listed as an equity with the same ticker, case-insensitively', () => {
    const legacyEquity = asset({ priceProvider: 'manual', symbol: 'usde', category: 'EQUITY' });

    expect(isListedEquityCandidate([ethenaUsde, legacyEquity], stablecoinX)).toBe(true);
  });

  it('hides a hit whose Yahoo identity is already in the catalog', () => {
    const catalogued = asset({
      priceProvider: 'yahoo',
      providerAssetId: 'USDE',
      symbol: 'STABLECOINX',
      category: 'EQUITY',
    });

    expect(isListedEquityCandidate([catalogued], stablecoinX)).toBe(true);
  });

  it('treats a missing catalog as nothing listed', () => {
    expect(isListedEquityCandidate(undefined, stablecoinX)).toBe(false);
  });
});
