import { describe, expect, it } from 'vitest';
import {
  cleanCompanyName,
  filterRelevantNews,
  isRelevantNewsItem,
  newsQueryPlan,
  yahooNewsTicker,
} from '../services/news/newsQuery.js';
import type { ProviderNewsItem } from '../services/providers/types.js';

function asset(overrides: Record<string, unknown>) {
  return {
    symbol: 'X',
    name: 'X',
    category: 'EQUITY',
    priceProvider: 'yahoo',
    providerAssetId: null as string | null,
    ...overrides,
  };
}

function item(title: string, relatedTickers?: string[]): ProviderNewsItem {
  return {
    id: title,
    title,
    publisher: 'Test Wire',
    url: 'https://example.com/a',
    publishedAt: null,
    relatedTickers,
  };
}

describe('yahooNewsTicker', () => {
  it('appends -USD to CoinGecko symbols and upper-cases Yahoo tickers', () => {
    expect(
      yahooNewsTicker({ symbol: 'btc', priceProvider: 'coingecko', providerAssetId: 'bitcoin' })
    ).toBe('BTC-USD');
    expect(
      yahooNewsTicker({ symbol: '285A.T', priceProvider: 'yahoo', providerAssetId: '285a.t' })
    ).toBe('285A.T');
  });

  it('rejects manual-priced assets and unmappable symbols', () => {
    expect(
      yahooNewsTicker({ symbol: 'FUND', priceProvider: 'manual', providerAssetId: null })
    ).toBeNull();
    expect(
      yahooNewsTicker({ symbol: 'NOT A TICKER!', priceProvider: 'coingecko', providerAssetId: 'x' })
    ).toBeNull();
    expect(
      yahooNewsTicker({ symbol: 'X', priceProvider: 'yahoo', providerAssetId: '  ' })
    ).toBeNull();
  });
});

describe('cleanCompanyName', () => {
  // Probed 2026-09: "Singapore Telecommunications Limited" returned 0 Yahoo
  // headlines while "Singapore Telecommunications" returned 13.
  it.each([
    ['DBS Group Holdings Ltd', 'DBS Group Holdings'],
    ['Oversea-Chinese Banking Corporation Limited', 'Oversea-Chinese Banking'],
    ['Singapore Telecommunications Limited', 'Singapore Telecommunications'],
    ['Keppel Ltd.', 'Keppel'],
    ['Equinor ASA', 'Equinor'],
    ['Samsung Electronics Co., Ltd.', 'Samsung Electronics'],
    ['Taiwan Semiconductor Manufacturing Company Limited', 'Taiwan Semiconductor Manufacturing'],
    ['CapitaLand Integrated Commercial Trust', 'CapitaLand Integrated Commercial Trust'],
    ['  Apple   Inc. ', 'Apple'],
  ])('%s → %s', (input, expected) => {
    expect(cleanCompanyName(input)).toBe(expected);
  });

  it('bounds adversarial names before any regex runs', () => {
    // Unbounded, these took minutes of event loop (quadratic suffix stripping).
    const started = performance.now();
    expect(cleanCompanyName(`X${' Inc'.repeat(250_000)}`).length).toBeLessThanOrEqual(80);
    expect(cleanCompanyName(`a${','.repeat(1_000_000)}b`).length).toBeLessThanOrEqual(80);
    expect(performance.now() - started).toBeLessThan(250);
    // Only the first 200 characters are ever read.
    expect(cleanCompanyName(`Acme ${'x'.repeat(300)} Ltd`)).toBe(`Acme ${'x'.repeat(75)}`);
  });

  it('never strips a name down to nothing and drops quote characters', () => {
    expect(cleanCompanyName('Limited')).toBe('Limited');
    expect(cleanCompanyName('"Quoted" Holdings Ltd')).toBe('Quoted Holdings');
  });
});

describe('newsQueryPlan', () => {
  it('queries US listings by ticker and gates on the ticker tag', () => {
    expect(newsQueryPlan(asset({ symbol: 'NVDA', providerAssetId: 'NVDA' }))).toEqual({
      yahooQuery: 'NVDA',
      relevance: { tickers: ['NVDA'], titleTerms: [] },
      googleQuery: null,
    });
  });

  it('queries coins by name (SOL-USD returns nothing) and gates on the coin ticker', () => {
    expect(
      newsQueryPlan(
        asset({
          symbol: 'SOL',
          name: 'Solana',
          category: 'LIQUID_CRYPTO',
          priceProvider: 'coingecko',
          providerAssetId: 'solana',
        })
      )
    ).toEqual({
      yahooQuery: 'Solana',
      relevance: { tickers: ['SOL-USD'], titleTerms: [] },
      googleQuery: null,
    });
  });

  it('queries non-US listings by cleaned company name, naming the company in headlines', () => {
    expect(
      newsQueryPlan(
        asset({ symbol: '7203.T', name: 'Toyota Motor Corporation', providerAssetId: '7203.T' })
      )
    ).toEqual({
      yahooQuery: 'Toyota Motor',
      relevance: { tickers: ['7203.T'], titleTerms: ['Toyota'] },
      googleQuery: null,
    });
  });

  it('adds an exact-phrase Google News query only for Singapore listings', () => {
    expect(
      newsQueryPlan(
        asset({ symbol: 'D05.SI', name: 'DBS Group Holdings Ltd', providerAssetId: 'D05.SI' })
      )
    ).toEqual({
      yahooQuery: 'DBS Group Holdings',
      relevance: { tickers: ['D05.SI'], titleTerms: ['DBS'] },
      googleQuery: '"DBS Group Holdings"',
    });
  });

  it('skips generic first words as headline terms', () => {
    const plan = newsQueryPlan(
      asset({
        symbol: 'Z74.SI',
        name: 'Singapore Telecommunications Limited',
        providerAssetId: 'Z74.SI',
      })
    );
    expect(plan?.relevance.titleTerms).toEqual([]);
    expect(plan?.googleQuery).toBe('"Singapore Telecommunications"');
  });

  it('falls back to the ticker when the stored name is unusable', () => {
    expect(
      newsQueryPlan(asset({ symbol: 'D05.SI', name: 'D05.SI', providerAssetId: 'D05.SI' }))
    ).toMatchObject({ yahooQuery: 'D05.SI', googleQuery: null });
  });

  it('keeps ticker queries for unit trusts and skips assets without a ticker', () => {
    expect(
      newsQueryPlan(
        asset({
          symbol: 'FUND',
          name: 'United Asian Growth Fund',
          category: 'UNIT_TRUST',
          providerAssetId: '0P0000XYZ.SI',
        })
      )
    ).toMatchObject({ yahooQuery: '0P0000XYZ.SI', googleQuery: null });
    expect(
      newsQueryPlan(asset({ symbol: 'FUND', priceProvider: 'manual', category: 'UNIT_TRUST' }))
    ).toBeNull();
  });
});

describe('relevance gate', () => {
  const gate = { tickers: ['7203.T'], titleTerms: ['Toyota'] };

  it('accepts ticker-tagged stories and headlines naming the company (ADR-tagged coverage)', () => {
    expect(isRelevantNewsItem(item('Automakers rally on tariff relief', ['7203.T']), gate)).toBe(
      true
    );
    expect(isRelevantNewsItem(item('Toyota recalls 1m vehicles', ['TM']), gate)).toBe(true);
  });

  it('rejects untagged stories that only contain the term inside another word', () => {
    expect(isRelevantNewsItem(item('Europe car registrations rise', ['TSLA']), gate)).toBe(false);
    expect(isRelevantNewsItem(item('Toyotafication of supply chains', ['X']), gate)).toBe(false);
  });

  it('filters when the provider sent tags, and fails open when it sent none at all', () => {
    const tagged = [item('Toyota recalls 1m vehicles', ['TM']), item('Unrelated story', ['GENK'])];
    expect(filterRelevantNews(tagged, gate).map((i) => i.title)).toEqual([
      'Toyota recalls 1m vehicles',
    ]);
    const untagged = [item('Unrelated story'), item('Another story')];
    expect(filterRelevantNews(untagged, gate)).toEqual(untagged);
    const emptyTags = [item('Unrelated story', []), item('Another story', [])];
    expect(filterRelevantNews(emptyTags, gate)).toEqual(emptyTags);
  });
});
