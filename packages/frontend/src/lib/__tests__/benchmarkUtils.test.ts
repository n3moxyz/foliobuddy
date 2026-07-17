import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BENCHMARKS,
  getCurrentChange,
  mergeAdditionalBenchmark,
  normalizePerformanceHistory,
} from '@/lib/benchmarkUtils';

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

describe('normalizePerformanceHistory', () => {
  const point = (timestamp: string, totalValueUsd: number) => ({
    timestamp,
    totalValueUsd,
    totalValueSgd: null,
    unrealizedPnL: null,
    btcPrice: null,
    ethPrice: null,
  });

  it('normalizes against the first value and contains corrupted numeric points', () => {
    expect(
      normalizePerformanceHistory([
        point('2026-01-01T00:00:00Z', 100),
        point('2026-01-02T00:00:00Z', 110),
        point('2026-01-03T00:00:00Z', Number.NaN),
      ]).map(({ portfolio }) => portfolio)
    ).toEqual([0, 10, 0]);
  });
});

describe('mergeAdditionalBenchmark', () => {
  const normalized = [
    { timestamp: 'a', date: new Date('2026-01-01T00:00:00Z'), portfolio: 0 },
    { timestamp: 'b', date: new Date('2026-01-02T00:00:00Z'), portfolio: 5 },
  ];

  it('sorts provider data and aligns its baseline to the first portfolio timestamp', () => {
    const merged = mergeAdditionalBenchmark(
      normalized,
      {
        days: 2,
        data: [
          { timestamp: Date.parse('2026-01-02T00:00:00Z'), price: 110 },
          { timestamp: Date.parse('2026-01-01T00:00:00Z'), price: 100 },
        ],
      },
      'spx'
    );

    expect(merged.map((point) => point.spx)).toEqual([0, 10]);
  });

  it('ignores corrupted provider points and invalid portfolio dates', () => {
    const providerData = {
      days: 2,
      data: [
        { timestamp: Number.NaN, price: 100 },
        { timestamp: Date.parse('2026-01-01T00:00:00Z'), price: -1 },
      ],
    };
    expect(mergeAdditionalBenchmark(normalized, providerData, 'bad')).toBe(normalized);

    const invalid = [{ timestamp: 'bad', date: new Date('bad'), portfolio: 0 }];
    expect(
      mergeAdditionalBenchmark(invalid, { days: 1, data: [{ timestamp: 1, price: 1 }] }, 'bad')
    ).toBe(invalid);
  });

  it('does not expose non-finite current changes', () => {
    expect(getCurrentChange([{ ...normalized[0], bad: Number.NaN }], 'bad')).toBeUndefined();
  });
});
