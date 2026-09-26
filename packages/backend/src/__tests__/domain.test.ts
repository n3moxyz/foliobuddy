import { describe, expect, it } from 'vitest';
import {
  applyPositionDelta,
  calculatePositionValue,
  impliedYahooTicker,
  importPriceFeed,
  isExternalProviderCategoryCompatible,
} from '../lib/domain.js';

describe('domain helpers', () => {
  it('calculates position value and unrealized PnL from current price', () => {
    expect(
      calculatePositionValue({
        quantity: 2,
        avgCostUsd: 40,
        currentPriceUsd: 60,
      })
    ).toEqual({
      marketValueUsd: 120,
      unrealizedPnL: 40,
      unrealizedPnLPct: 50,
    });
  });

  it('keeps zero-priced assets as zero-valued rather than unknown', () => {
    expect(
      calculatePositionValue({
        quantity: 2,
        avgCostUsd: 40,
        currentPriceUsd: 0,
      })
    ).toEqual({
      marketValueUsd: 0,
      unrealizedPnL: -80,
      unrealizedPnLPct: -100,
    });
  });

  it('adds quantity with weighted average cost', () => {
    expect(
      applyPositionDelta({
        currentQuantity: 10,
        currentAvgCostUsd: 5,
        deltaQuantity: 5,
        deltaTotalCostUsd: 40,
        mode: 'add',
      })
    ).toMatchObject({
      currentTotalCostUsd: 50,
      deltaCostUsd: 40,
      nextQuantity: 15,
      nextTotalCostUsd: 90,
      nextAvgCostUsd: 6,
    });
  });

  it('reduces quantity at the current average cost', () => {
    expect(
      applyPositionDelta({
        currentQuantity: 10,
        currentAvgCostUsd: 5,
        deltaQuantity: 4,
        mode: 'reduce',
      })
    ).toMatchObject({
      currentTotalCostUsd: 50,
      deltaCostUsd: 20,
      nextQuantity: 6,
      nextTotalCostUsd: 30,
      nextAvgCostUsd: 5,
    });
  });

  it('rejects reductions below zero quantity', () => {
    expect(() =>
      applyPositionDelta({
        currentQuantity: 1,
        currentAvgCostUsd: 5,
        deltaQuantity: 2,
        mode: 'reduce',
      })
    ).toThrow('reduce below zero quantity');
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects non-finite position inputs (%s)',
    (invalid) => {
      expect(() =>
        applyPositionDelta({
          currentQuantity: 1,
          currentAvgCostUsd: 5,
          deltaQuantity: invalid,
          deltaTotalCostUsd: 1,
          mode: 'add',
        })
      ).toThrow('Delta quantity must be positive');
    }
  );

  it('rejects finite inputs whose multiplication overflows', () => {
    expect(() =>
      applyPositionDelta({
        currentQuantity: 1e308,
        currentAvgCostUsd: 1e308,
        deltaQuantity: 1,
        deltaTotalCostUsd: 1,
        mode: 'add',
      })
    ).toThrow('supported numeric range');
  });

  it('captures external provider/category compatibility', () => {
    expect(isExternalProviderCategoryCompatible('yahoo', 'EQUITY')).toBe(true);
    expect(isExternalProviderCategoryCompatible('yahoo', 'UNIT_TRUST')).toBe(true);
    expect(isExternalProviderCategoryCompatible('yahoo', 'LIQUID_CRYPTO')).toBe(false);
    expect(isExternalProviderCategoryCompatible('manual', 'UNIT_TRUST')).toBe(true);
    expect(isExternalProviderCategoryCompatible('manual', 'CASH')).toBe(false);
  });
});

describe('importPriceFeed', () => {
  it.each([
    [
      { category: 'EQUITY', symbol: 'nvda' },
      { priceProvider: 'yahoo', providerAssetId: 'NVDA' },
    ],
    [
      { category: 'UNIT_TRUST', symbol: 'UTX' },
      { priceProvider: 'manual', providerAssetId: null },
    ],
    [
      { category: 'LIQUID_CRYPTO', symbol: 'SOL', coingeckoId: 'solana' },
      { priceProvider: 'coingecko', providerAssetId: 'solana' },
    ],
    [
      { category: 'NFT', symbol: 'PUNK' },
      { priceProvider: 'coingecko', providerAssetId: null },
    ],
  ])('defaults %o to a feed the refresh job can read', (asset, feed) => {
    expect(importPriceFeed(asset)).toEqual(feed);
  });

  it('keeps an explicit feed and fills only a missing provider id', () => {
    expect(
      importPriceFeed({
        category: 'UNIT_TRUST',
        symbol: 'FUND',
        priceProvider: 'yahoo',
        providerAssetId: '0P0000XYZ.SI',
      })
    ).toEqual({ priceProvider: 'yahoo', providerAssetId: '0P0000XYZ.SI' });
    expect(importPriceFeed({ category: 'EQUITY', symbol: 'usde', priceProvider: 'yahoo' })).toEqual(
      { priceProvider: 'yahoo', providerAssetId: 'USDE' }
    );
  });

  it('never points a non-USD equity at a bare ticker, which Yahoo reads as the US listing', () => {
    expect(importPriceFeed({ category: 'EQUITY', symbol: 'D05', nativeCurrency: 'sgd' })).toEqual({
      priceProvider: 'yahoo',
      providerAssetId: null,
    });
    expect(
      importPriceFeed({ category: 'EQUITY', symbol: 'd05.si', nativeCurrency: 'SGD' })
    ).toEqual({ priceProvider: 'yahoo', providerAssetId: 'D05.SI' });
  });

  it('never treats a fund code as a Yahoo symbol', () => {
    // It could name an unrelated Yahoo instrument and price the fund from it.
    expect(
      importPriceFeed({ category: 'UNIT_TRUST', symbol: 'LIONGLOB', priceProvider: 'yahoo' })
    ).toEqual({ priceProvider: 'yahoo', providerAssetId: null });
  });
});

describe('impliedYahooTicker', () => {
  it.each([
    ['nvda', undefined, 'NVDA'],
    ['NVDA', 'USD', 'NVDA'],
    ['D05.SI', 'SGD', 'D05.SI'],
    // Imports default currency to USD, so a suffixed ticker stays trusted either way.
    ['D05.SI', 'USD', 'D05.SI'],
    ['D05', 'SGD', null],
    ['  ', 'USD', null],
  ])('%s in %s implies %s', (symbol, currency, expected) => {
    expect(impliedYahooTicker(symbol, currency)).toBe(expected);
  });
});
