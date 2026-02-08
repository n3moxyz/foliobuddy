import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDbHealth() {
  return useQuery({
    queryKey: ['health', 'db'],
    queryFn: api.getDbHealth,
    refetchInterval: 30_000,
    retry: 1,
  });
}
