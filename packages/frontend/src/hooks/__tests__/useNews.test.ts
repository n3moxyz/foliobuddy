import { describe, expect, it } from 'vitest';
import { enrichmentPollInterval } from '../useNews';
import type { NewsEnrichmentResponse } from '@/lib/types';

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
