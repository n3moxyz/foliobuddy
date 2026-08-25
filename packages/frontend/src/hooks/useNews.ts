import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NewsEnrichmentResponse } from '@/lib/types';

// Backend caches Yahoo news ~15 min per ticker; a shorter client staleTime
// keeps the Refresh button meaningful without hammering the provider.
export function useNews() {
  return useQuery({
    queryKey: ['news'],
    queryFn: api.getNews,
    staleTime: 5 * 60 * 1000,
  });
}

const ENRICHMENT_POLL_MS = 6000;
const ENRICHMENT_MAX_POLLS = 5;

interface EnrichmentPollState {
  data: NewsEnrichmentResponse | undefined;
  /** Successful fetches + failed fetches — the cap must count both. */
  attempts: number;
}

/** Pure poll decision, exported for tests: next interval in ms, or false to stop. */
export function enrichmentPollInterval(
  topStoryIds: string[],
  state: EnrichmentPollState
): number | false {
  if (state.data && !state.data.enabled) return false;
  const allReady = state.data
    ? topStoryIds.every((id) => Boolean(state.data!.enrichments[id]))
    : false;
  if (allReady) return false;
  if (state.attempts >= ENRICHMENT_MAX_POLLS) return false;
  return ENRICHMENT_POLL_MS;
}

// AI summaries arrive asynchronously after the feed renders. Poll briefly for
// the current Top stories, then stop — enrichment is a bonus, never a
// dependency: the page is complete without it.
export function useNewsEnrichment(topStoryIds: string[]) {
  return useQuery({
    queryKey: ['news', 'enrichment', topStoryIds],
    queryFn: api.getNewsEnrichment,
    enabled: topStoryIds.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: (query) =>
      enrichmentPollInterval(topStoryIds, {
        data: query.state.data,
        attempts: query.state.dataUpdateCount + query.state.errorUpdateCount,
      }),
  });
}
