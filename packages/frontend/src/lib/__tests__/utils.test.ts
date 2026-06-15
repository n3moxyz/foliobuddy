import { describe, expect, it } from 'vitest';
import { formatNativePrice, isMarketExposureCategory } from '@/lib/utils';
import { localPriceLabel } from '@/components/portfolio/positionPriceDisplay';

describe('isMarketExposureCategory', () => {
  it('includes market-risk assets and excludes stablecoins and cash', () => {
    expect(isMarketExposureCategory('LIQUID_CRYPTO')).toBe(true);
    expect(isMarketExposureCategory('EQUITY')).toBe(true);
    expect(isMarketExposureCategory('UNIT_TRUST')).toBe(true);
    expect(isMarketExposureCategory('NFT')).toBe(true);
    expect(isMarketExposureCategory('ANGEL')).toBe(true);

    expect(isMarketExposureCategory('STABLECOIN')).toBe(false);
    expect(isMarketExposureCategory('CASH')).toBe(false);
  });
});

describe('formatNativePrice', () => {
  it('uses ISO currency labels for local price hints', () => {
    expect(formatNativePrice(65.25, 'SGD')).toBe('SGD\u00a065.25');
    expect(formatNativePrice(2400, 'JPY')).toBe('JPY\u00a02,400');
  });
});

describe('localPriceLabel', () => {
  it('shows native price when the asset currency differs from the display currency', () => {
    expect(
      localPriceLabel({
        usdPrice: 50,
        nativeCurrency: 'SGD',
        displayCurrency: 'USD',
        usdFxRates: { USD: 1, SGD: 1.3 },
      })
    ).toBe('(SGD\u00a065.00)');
  });

  it('hides native price when it already matches the display currency', () => {
    expect(
      localPriceLabel({
        usdPrice: 50,
        nativeCurrency: 'USD',
        displayCurrency: 'USD',
        usdFxRates: { USD: 1, SGD: 1.3 },
      })
    ).toBeNull();
  });
});
