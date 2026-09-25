import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { enrichmentPollInterval, useAssetNews } from '../useNews';
import { api } from '@/lib/api';
import { createQueryClientWrapper, createTestQueryClient } from '@/test/utils';
import type { AssetNewsResponse, NewsEnrichmentResponse } from '@/lib/types';

vi.mock('@/lib/api', () => ({ api: { getAssetNews: vi.fn() } }));

function enrichmentFor(ids: string[]): NewsEnrichmentResponse {
  return {
    enabled: true,
    enrichments: Object.fromEntries(
      ids.map((id) => [
        id,
        {
          id,
          summary: 's',
          whyItMatters: 'w',
          provenance: 'article' as const,
          confidence: 'high' as const,
          enrichedAt: '2026-08-25T06:00:00.000Z',
        },
      ])
    ),
  };
}

describe('enrichmentPollInterval', () => {
  it('keeps polling while enrichments are pending and under the attempt cap', () => {
    expect(enrichmentPollInterval(['a', 'b'], { data: enrichmentFor(['a']), attempts: 2 })).toBe(
      6000
    );
  });

  it('stops when every top story is enriched', () => {
    expect(
      enrichmentPollInterval(['a', 'b'], { data: enrichmentFor(['a', 'b']), attempts: 1 })
    ).toBe(false);
  });

  it('stops when the backend reports enrichment disabled', () => {
    expect(
      enrichmentPollInterval(['a'], { data: { enabled: false, enrichments: {} }, attempts: 0 })
    ).toBe(false);
  });

  it('counts failed requests against the poll cap (no unbounded error polling)', () => {
    // attempts = successes + failures; five straight failures must stop polling
    // even though no data ever arrived.
    expect(enrichmentPollInterval(['a'], { data: undefined, attempts: 5 })).toBe(false);
    expect(enrichmentPollInterval(['a'], { data: undefined, attempts: 4 })).toBe(6000);
  });
});

describe('useAssetNews', () => {
  const dossier: AssetNewsResponse = {
    holding: {
      assetId: 'asset-btc',
      symbol: 'BTC',
      name: 'Bitcoin',
      category: 'LIQUID_CRYPTO',
      bucket: 'crypto',
      openTradeOnly: false,
    },
    items: [],
    windowDays: 60,
    fetchedAt: '2026-08-24T11:00:00.000Z',
  };

  it('stays idle without an asset id, then fetches and caches the dossier by asset id', async () => {
    vi.mocked(api.getAssetNews).mockResolvedValue(dossier);
    const client = createTestQueryClient();
    const { result, rerender } = renderHook(({ assetId }) => useAssetNews(assetId), {
      wrapper: createQueryClientWrapper(client),
      initialProps: { assetId: null as string | null },
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(api.getAssetNews).not.toHaveBeenCalled();

    rerender({ assetId: 'asset-btc' });

    await waitFor(() => expect(result.current.data).toEqual(dossier));
    expect(api.getAssetNews).toHaveBeenCalledWith('asset-btc');
    expect(client.getQueryData(['news', 'asset', 'asset-btc'])).toEqual(dossier);
  });
});
