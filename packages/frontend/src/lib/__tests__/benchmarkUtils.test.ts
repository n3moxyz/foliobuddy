import { describe, expect, it } from 'vitest';
import { DEFAULT_BENCHMARKS } from '@/lib/benchmarkUtils';

describe('DEFAULT_BENCHMARKS', () => {
  it('includes SPX as a provider-aware Yahoo default alongside BTC and ETH', () => {
    expect(
      DEFAULT_BENCHMARKS.map(({ id, provider, providerAssetId, symbol, enabled }) => ({
        id,
        provider,
        providerAssetId,
        symbol,
        enabled,
      }))
    ).toEqual([
      {
        id: 'btc',
        provider: 'coingecko',
        providerAssetId: 'bitcoin',
        symbol: 'BTC',
        enabled: true,
      },
      {
        id: 'eth',
        provider: 'coingecko',
        providerAssetId: 'ethereum',
        symbol: 'ETH',
        enabled: true,
      },
      {
        id: 'spx',
        provider: 'yahoo',
        providerAssetId: 'SPY',
        symbol: 'SPX',
        enabled: true,
      },
    ]);
  });
});
