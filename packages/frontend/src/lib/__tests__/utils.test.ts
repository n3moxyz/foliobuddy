import { describe, expect, it } from 'vitest';
import { formatNativePrice, formatQuantity, isMarketExposureCategory } from '@/lib/utils';
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

describe('formatQuantity', () => {
  it('trims whole-share equity quantities and keeps meaningful fractional shares', () => {
    expect(formatQuantity(85, 'EQUITY')).toBe('85');
    expect(formatQuantity(120, 'EQUITY')).toBe('120');
    expect(formatQuantity(12.5, 'EQUITY')).toBe('12.5');
    expect(formatQuantity(1.23456, 'EQUITY')).toBe('1.2346');
  });

  it('uses tighter trimmed precision for unit trusts', () => {
    expect(formatQuantity(50000, 'UNIT_TRUST')).toBe('50,000');
    expect(formatQuantity(12345.6789, 'UNIT_TRUST')).toBe('12,345.679');
  });

  it('keeps crypto precision without trailing zeroes', () => {
    expect(formatQuantity(1.42, 'LIQUID_CRYPTO')).toBe('1.42');
    expect(formatQuantity(0.00842, 'LIQUID_CRYPTO')).toBe('0.00842');
    expect(formatQuantity(0.123456789, 'LIQUID_CRYPTO')).toBe('0.12345679');
  });

  it('shows cash-like quantities without unnecessary decimals', () => {
    expect(formatQuantity(24500, 'STABLECOIN')).toBe('24,500');
    expect(formatQuantity(24500.5, 'CASH')).toBe('24,500.5');
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
