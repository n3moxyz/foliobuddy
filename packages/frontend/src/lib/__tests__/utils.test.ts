import { describe, expect, it } from 'vitest';
import { isMarketExposureCategory } from '@/lib/utils';

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
