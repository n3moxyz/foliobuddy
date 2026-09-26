import { describe, expect, it } from 'vitest';
import type { Asset, CoinSearchResult, ProviderSearchResult } from '@/lib/types';
import {
  impliedYahooTicker,
  isListedCoinCandidate,
  isListedEquityCandidate,
  isUnpricedEquity,
  unpricedEquityRepairRequest,
} from '../assetSearchMatching';

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

describe('isListedCoinCandidate', () => {
  const bitcoinHit: CoinSearchResult = { id: 'bitcoin', symbol: 'btc', name: 'Bitcoin', rank: 1 };
  const btcEtf = asset({
    id: 'btc-etf',
    priceProvider: 'yahoo',
    providerAssetId: 'BTC',
    symbol: 'BTC',
    name: 'Grayscale Bitcoin Mini Trust ETF',
    category: 'EQUITY',
  });

  it('keeps a coin whose ticker only matches an equity (bitcoin vs the BTC spot ETF)', () => {
    expect(isListedCoinCandidate([btcEtf], bitcoinHit)).toBe(false);
  });

  it('keeps a coin whose ticker only matches a unit trust or fiat cash', () => {
    const fund = asset({ symbol: 'BTC', priceProvider: 'manual', category: 'UNIT_TRUST' });
    const usdCash = asset({ symbol: 'USD', priceProvider: 'manual', category: 'CASH' });
    const usdHit: CoinSearchResult = { id: 'usd-token', symbol: 'usd', name: 'USD', rank: null };

    expect(isListedCoinCandidate([fund], bitcoinHit)).toBe(false);
    expect(isListedCoinCandidate([usdCash], usdHit)).toBe(false);
  });

  it('hides a coin already listed as crypto with the same ticker, case-insensitively', () => {
    const legacyCoin = asset({
      symbol: 'Btc',
      providerAssetId: 'legacy-btc',
      category: 'LIQUID_CRYPTO',
    });

    expect(isListedCoinCandidate([btcEtf, legacyCoin], bitcoinHit)).toBe(true);
  });

  it('hides a coin whose CoinGecko id is catalogued, in any class or id column', () => {
    const ethenaHit: CoinSearchResult = {
      id: 'ethena-usde',
      symbol: 'usde',
      name: 'Ethena USDe',
      rank: null,
    };
    const pairOnly = { ...ethenaUsde, coingeckoId: null };

    expect(isListedCoinCandidate([ethenaUsde], ethenaHit)).toBe(true);
    expect(isListedCoinCandidate([pairOnly], ethenaHit)).toBe(true);
  });

  it('treats a missing catalog as nothing listed', () => {
    expect(isListedCoinCandidate(undefined, bitcoinHit)).toBe(false);
  });
});

describe('isUnpricedEquity', () => {
  it('flags an EQUITY row left on an automatic feed with no provider id', () => {
    const legacyImport = asset({
      priceProvider: 'coingecko',
      providerAssetId: null,
      category: 'EQUITY',
    });

    expect(isUnpricedEquity(legacyImport)).toBe(true);
  });

  it('keeps a manually priced EQUITY row (providerAssetId is optional for manual)', () => {
    const manualEquity = asset({
      priceProvider: 'manual',
      providerAssetId: null,
      category: 'EQUITY',
    });

    expect(isUnpricedEquity(manualEquity)).toBe(false);
  });

  it('keeps a Yahoo-priced EQUITY row that already has its provider id', () => {
    const pricedEquity = asset({
      priceProvider: 'yahoo',
      providerAssetId: 'NBIS',
      category: 'EQUITY',
    });

    expect(isUnpricedEquity(pricedEquity)).toBe(false);
  });

  it('ignores an unpriced row outside EQUITY (e.g. a stablecoin import)', () => {
    const unpricedStablecoin = asset({
      priceProvider: 'coingecko',
      providerAssetId: null,
      category: 'STABLECOIN',
    });

    expect(isUnpricedEquity(unpricedStablecoin)).toBe(false);
  });
});

describe('impliedYahooTicker', () => {
  it.each([
    ['nbis', 'USD', 'NBIS'],
    ['D05.SI', 'SGD', 'D05.SI'],
    ['D05.SI', 'USD', 'D05.SI'],
    ['D05', 'SGD', null],
    ['NBIS', null, 'NBIS'],
  ])('%s in %s implies %s', (symbol, currency, expected) => {
    expect(impliedYahooTicker(symbol, currency)).toBe(expected);
  });
});

describe('unpriced rows in the pickers', () => {
  const pepeHit: CoinSearchResult = { id: 'pepe', symbol: 'pepe', name: 'Pepe', rank: 30 };

  it('shows the coin hit that heals a same-ticker unpriced crypto row', () => {
    const deadPepe = asset({ id: 'dead-pepe', symbol: 'PEPE', category: 'LIQUID_CRYPTO' });

    expect(isListedCoinCandidate([deadPepe], pepeHit)).toBe(false);
  });

  it('shows the coin hit that backfills a legacy row holding only its coingeckoId', () => {
    const legacyPepe = asset({ symbol: 'PEPE', coingeckoId: 'pepe', category: 'LIQUID_CRYPTO' });

    expect(isListedCoinCandidate([legacyPepe], pepeHit)).toBe(false);
  });

  it('asks from-provider for the identity only, never this row’s exchange or currency', () => {
    // A live row may already hold the ticker; stale metadata would overwrite it.
    const deadNbis = asset({
      symbol: 'nbis',
      name: 'Nebius Group',
      category: 'EQUITY',
      exchange: 'NASDAQ',
    });

    expect(unpricedEquityRepairRequest(deadNbis, 'USD')).toEqual({
      provider: 'yahoo',
      providerAssetId: 'NBIS',
      symbol: 'nbis',
      name: 'Nebius Group',
      category: 'EQUITY',
    });
  });

  it('asks nothing for a priced equity or a non-USD bare ticker', () => {
    const priced = asset({
      symbol: 'NBIS',
      category: 'EQUITY',
      priceProvider: 'yahoo',
      providerAssetId: 'NBIS',
    });
    const bareSgd = asset({ symbol: 'C38U', category: 'EQUITY', nativeCurrency: 'SGD' });

    expect(unpricedEquityRepairRequest(priced, 'USD')).toBeNull();
    expect(unpricedEquityRepairRequest(bareSgd, 'SGD')).toBeNull();
  });
});
