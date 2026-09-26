import { describe, expect, it } from 'vitest';
import type { Asset, Trade } from '@/lib/types';
import {
  buildMonthlyReviews,
  buildTickerDossiers,
  findTickerDossier,
  setTickerParams,
  tickerLabels,
  topTagsForTrades,
} from '../tradeLensModels';

const asset: Asset = {
  id: 'asset-1',
  coingeckoId: 'bitcoin',
  priceProvider: 'coingecko',
  providerAssetId: 'bitcoin',
  nativeCurrency: 'USD',
  exchange: null,
  factsheetUrl: null,
  isin: null,
  symbol: 'BTC',
  name: 'Bitcoin',
  category: 'LIQUID_CRYPTO',
  currentPriceUsd: 60_000,
  priceUpdatedAt: null,
};

function trade(overrides: Partial<Trade> = {}): Trade {
  return {
    id: 'trade-1',
    assetId: asset.id,
    asset,
    direction: 'LONG',
    entryPrice: 100,
    exitPrice: 110,
    quantity: 1,
    positionSizeUsd: 100,
    entryDate: '2026-01-01T00:00:00.000Z',
    exitDate: '2026-01-03T00:00:00.000Z',
    fundingCost: 0,
    status: 'CLOSED',
    realizedPnL: 10,
    realizedPnLPct: 10,
    notes: null,
    tags: null,
    ...overrides,
  };
}

describe('topTagsForTrades', () => {
  const trades = [
    trade({ tags: 'breakout, momentum, breakout' }),
    trade({ id: 'trade-2', tags: ' momentum, ,alpha' }),
  ];

  it('trims tags and sorts count ties deterministically', () => {
    expect(topTagsForTrades(trades)).toEqual([
      { label: 'breakout', count: 2 },
      { label: 'momentum', count: 2 },
      { label: 'alpha', count: 1 },
    ]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'returns no tags for invalid or empty limit %s',
    (limit) => expect(topTagsForTrades(trades, limit)).toEqual([])
  );
});

describe('buildTickerDossiers', () => {
  it('never labels a winning trade as the largest loss or a losing trade as the largest win', () => {
    const winners = buildTickerDossiers([
      trade({ realizedPnL: 10 }),
      trade({ id: 'trade-2', realizedPnL: 30 }),
    ])[0];
    expect(winners.largestWin?.id).toBe('trade-2');
    expect(winners.largestLoss).toBeNull();

    const losers = buildTickerDossiers([
      trade({ realizedPnL: -10 }),
      trade({ id: 'trade-2', realizedPnL: -30 }),
    ])[0];
    expect(losers.largestWin).toBeNull();
    expect(losers.largestLoss?.id).toBe('trade-2');
  });

  it('excludes corrupted PnL, backwards dates, and non-finite sizes from aggregates', () => {
    const dossier = buildTickerDossiers([
      trade(),
      trade({
        id: 'backwards',
        entryDate: '2026-01-10T00:00:00.000Z',
        exitDate: '2026-01-01T00:00:00.000Z',
        realizedPnL: 20,
        positionSizeUsd: Number.NaN,
      }),
      trade({ id: 'corrupt', realizedPnL: Number.NaN }),
      trade({ id: 'open', status: 'OPEN', exitDate: null, realizedPnL: null }),
    ])[0];

    expect(dossier.closedTrades.map((item) => item.id)).toEqual(['trade-1', 'backwards']);
    expect(dossier.avgHoldDays).toBe(2);
    expect(dossier.avgPositionSizeUsd).toBe(100);
    expect(dossier.openCount).toBe(1);
  });
});

describe('buildMonthlyReviews', () => {
  it('sorts invalid-date records after real calendar months', () => {
    const reviews = buildMonthlyReviews([
      trade({ id: 'feb', exitDate: '2026-02-10T00:00:00.000Z' }),
      trade({ id: 'jan', exitDate: '2026-01-10T00:00:00.000Z' }),
      trade({ id: 'unknown', exitDate: 'not-a-date', realizedPnL: -5 }),
    ]);

    expect(reviews.map((review) => review.key)).toEqual(['2026-02', '2026-01', 'unknown']);
    expect(reviews[2].label).toBe('Unknown');
  });
});

describe('ticker views for assets that share a ticker', () => {
  const btcEtf: Asset = {
    ...asset,
    id: 'btc-etf',
    coingeckoId: null,
    priceProvider: 'yahoo',
    providerAssetId: 'BTC',
    name: 'Grayscale Bitcoin Mini Trust ETF',
    category: 'EQUITY',
  };
  const etfTrade = (overrides: Partial<Trade> = {}) =>
    trade({ id: 'etf-trade', assetId: btcEtf.id, asset: btcEtf, realizedPnL: -40, ...overrides });

  it('builds one dossier per asset, each named after its own asset', () => {
    const dossiers = buildTickerDossiers([trade({ realizedPnL: 10 }), etfTrade()]);

    expect(
      dossiers.map(({ assetId, label, name, totalPnL }) => [assetId, label, name, totalPnL])
    ).toEqual([
      ['btc-etf', 'BTC · Equity', 'Grayscale Bitcoin Mini Trust ETF', -40],
      ['asset-1', 'BTC · Crypto', 'Bitcoin', 10],
    ]);
  });

  it('labels a ticker with its class only when another asset shares it', () => {
    const eth = { ...asset, id: 'eth', symbol: 'ETH', name: 'Ethereum' };
    const labels = tickerLabels([asset, eth, btcEtf]);

    expect(Object.fromEntries(labels)).toEqual({
      'asset-1': 'BTC · Crypto',
      eth: 'ETH',
      'btc-etf': 'BTC · Equity',
    });
  });

  it('falls back to the asset name when the shared ticker is in one class twice', () => {
    const wrapped = { ...asset, id: 'wbtc', name: 'Legacy Bitcoin row' };

    expect(tickerLabels([asset, wrapped]).get('wbtc')).toBe('BTC · Legacy Bitcoin row');
  });

  it('numbers duplicate rows of one instrument so no two labels match', () => {
    // An old unpriced import row beside the live listing: same ticker, class and name.
    const deadRow = { ...btcEtf, id: 'a-dead-row', priceProvider: 'coingecko' as const };
    const labels = tickerLabels([btcEtf, asset, deadRow]);

    expect(Object.fromEntries(labels)).toEqual({
      'a-dead-row': 'BTC · Grayscale Bitcoin Mini Trust ETF (1)',
      'btc-etf': 'BTC · Grayscale Bitcoin Mini Trust ETF (2)',
      // Alone in its class, so the coin keeps the plain class label.
      'asset-1': 'BTC · Crypto',
    });
  });

  it('finds the dossier a URL names, preferring the asset id for a shared ticker', () => {
    const dossiers = buildTickerDossiers([trade(), etfTrade()]);

    expect(findTickerDossier(dossiers, 'BTC', 'asset-1')?.assetId).toBe('asset-1');
    expect(findTickerDossier(dossiers, 'BTC', 'btc-etf')?.assetId).toBe('btc-etf');
    // A bare ticker (old link or bookmark) still opens one of them rather than nothing.
    expect(findTickerDossier(dossiers, 'BTC', null)?.symbol).toBe('BTC');
    expect(findTickerDossier(dossiers, 'ETH', null)).toBeNull();
    expect(findTickerDossier(dossiers, null, 'asset-1')).toBeNull();
  });

  it('adds the asset id to the URL only when the ticker is shared', () => {
    const shared = buildTickerDossiers([trade(), etfTrade()]);
    const alone = buildTickerDossiers([trade()]);

    const sharedParams = new URLSearchParams('view=monthly');
    setTickerParams(sharedParams, shared[0], shared);
    const aloneParams = new URLSearchParams('asset=stale');
    setTickerParams(aloneParams, alone[0], alone);

    expect(sharedParams.toString()).toBe('view=monthly&ticker=BTC&asset=btc-etf');
    expect(aloneParams.toString()).toBe('ticker=BTC');
  });
});
