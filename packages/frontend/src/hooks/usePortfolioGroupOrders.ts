import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiForSession } from '@/lib/api';
import { captureAuthSession, isAuthSessionCurrent } from '@/lib/authSession';
import {
  mergeVisibleGroupOrder,
  PORTFOLIO_GROUP_ORDER_QUERY_KEY,
  readLegacyPortfolioGroupOrders,
  type PortfolioGroupOrders,
  type PortfolioGroupOrderUpdate,
  type PortfolioGroupScope,
} from '@/lib/portfolioGroupOrders';

export function usePortfolioGroupOrders() {
  const client = useQueryClient();
  const [session] = useState(captureAuthSession);
  const [legacy] = useState(() => readLegacyPortfolioGroupOrders(session.ownerId));
  const lastImportAttempt = useRef(0);
  const importing = useRef(false);
  const { data, dataUpdatedAt, isError, isFetching, refetch } = useQuery({
    queryKey: PORTFOLIO_GROUP_ORDER_QUERY_KEY,
    queryFn: ({ signal }) => apiForSession(session).getPortfolioGroupOrders(signal),
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
  });

  useEffect(() => {
    if (!data || importing.current || lastImportAttempt.current === dataUpdatedAt) return;
    const missingOrders = (Object.keys(legacy) as PortfolioGroupScope[])
      .filter((scope) => data[scope] === undefined)
      .map((scope) => ({ scope, order: legacy[scope]! }));
    if (!missingOrders.length) return;

    importing.current = true;
    lastImportAttempt.current = dataUpdatedAt;
    void apiForSession(session)
      .importPortfolioGroupOrders(missingOrders)
      .then(
        () => {
          importing.current = false;
          if (isAuthSessionCurrent(session)) {
            void client.invalidateQueries({ queryKey: PORTFOLIO_GROUP_ORDER_QUERY_KEY });
          }
        },
        () => {
          // Keep the legacy display order and retry after the next successful read.
          importing.current = false;
        }
      );
  }, [client, data, dataUpdatedAt, legacy, session]);

  const mutation = useMutation({
    meta: { showsOwnError: true },
    networkMode: 'always',
    mutationFn: (update: PortfolioGroupOrderUpdate) =>
      apiForSession(session).savePortfolioGroupOrder(update),
    onMutate: () => client.cancelQueries({ queryKey: PORTFOLIO_GROUP_ORDER_QUERY_KEY }),
    onSuccess: async ({ order }, { scope }) => {
      await client.cancelQueries({ queryKey: PORTFOLIO_GROUP_ORDER_QUERY_KEY });
      if (!isAuthSessionCurrent(session)) return;
      client.setQueryData<PortfolioGroupOrders>(PORTFOLIO_GROUP_ORDER_QUERY_KEY, (current) => ({
        ...current,
        [scope]: order,
      }));
      // Resolve a simultaneous save from another signed-in device against server state.
      void client.invalidateQueries({ queryKey: PORTFOLIO_GROUP_ORDER_QUERY_KEY });
    },
  });

  function preference(scope: PortfolioGroupScope) {
    return {
      order: data?.[scope] ?? legacy[scope],
      ready: data !== undefined,
      save: async (keys: string[]) => {
        const current = client.getQueryData<PortfolioGroupOrders>(PORTFOLIO_GROUP_ORDER_QUERY_KEY);
        const previous = current?.[scope] ?? legacy[scope] ?? [];
        await mutation.mutateAsync({ scope, order: mergeVisibleGroupOrder(previous, keys) });
      },
    };
  }

  return { preference, isError, isFetching, hasData: data !== undefined, refetch };
}
