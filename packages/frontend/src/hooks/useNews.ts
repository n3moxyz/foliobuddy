import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

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

// AI summaries arrive asynchronously after the feed renders. Poll briefly for
// the current Top stories, then stop — enrichment is a bonus, never a
// dependency: the page is complete without it.
export function useNewsEnrichment(topStoryIds: string[]) {
  return useQuery({
    queryKey: ['news', 'enrichment', topStoryIds],
    queryFn: api.getNewsEnrichment,
    enabled: topStoryIds.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && !data.enabled) return false;
      const allReady = data ? topStoryIds.every((id) => Boolean(data.enrichments[id])) : false;
      if (allReady) return false;
      if (query.state.dataUpdateCount >= ENRICHMENT_MAX_POLLS) return false;
      return ENRICHMENT_POLL_MS;
    },
  });
}
