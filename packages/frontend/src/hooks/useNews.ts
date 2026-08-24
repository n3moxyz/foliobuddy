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
