import { MutationCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { assertAuthSession, isAuthSessionCurrent, type AuthSession } from './authSession';

type AnyMutationOptions = NonNullable<Parameters<QueryClient['defaultMutationOptions']>[0]>;

class SessionQueryClient extends QueryClient {
  private guardedOptions = new WeakMap<object, object>();

  constructor(private readonly session: AuthSession) {
    super({
      defaultOptions: {
        queries: { staleTime: 30000, refetchOnWindowFocus: false, retry: 1 },
      },
      mutationCache: new MutationCache({
        onError: (error) => {
          if (!isAuthSessionCurrent(session)) return;
          toast.error('Action failed', {
            description:
              error instanceof Error ? error.message : 'Check your connection and try again.',
          });
        },
      }),
    });
  }

  // Both mutation creation and observer option updates use this public method.
  // Guard the actual invocation: cache.clear() does not cancel a mutation waiting
  // for onMutate, connectivity or a retry timer.
  override defaultMutationOptions<T extends AnyMutationOptions>(options?: T): T {
    const defaults = super.defaultMutationOptions(options);
    const existing = this.guardedOptions.get(defaults);
    if (existing) return existing as T;
    const { mutationFn, onMutate, onSuccess, onError, onSettled, retry = 0 } = defaults;
    const session = this.session;
    const guarded = {
      ...defaults,
      mutationFn: mutationFn
        ? async (...args: Parameters<typeof mutationFn>) => {
            assertAuthSession(session);
            const result = await mutationFn(...args);
            assertAuthSession(session);
            return result;
          }
        : undefined,
      onMutate: onMutate
        ? async (...args: Parameters<typeof onMutate>) => {
            assertAuthSession(session);
            const result = await onMutate(...args);
            assertAuthSession(session);
            return result;
          }
        : undefined,
      onSuccess: (...args: Parameters<NonNullable<typeof onSuccess>>) => {
        if (isAuthSessionCurrent(session)) return onSuccess?.(...args);
      },
      onError: (...args: Parameters<NonNullable<typeof onError>>) => {
        if (isAuthSessionCurrent(session)) return onError?.(...args);
      },
      onSettled: (...args: Parameters<NonNullable<typeof onSettled>>) => {
        if (isAuthSessionCurrent(session)) return onSettled?.(...args);
      },
      retry: (failureCount: number, error: unknown) =>
        isAuthSessionCurrent(session) &&
        (typeof retry === 'function'
          ? retry(failureCount, error)
          : retry === true || (typeof retry === 'number' && failureCount < retry)),
    } as T;
    this.guardedOptions.set(defaults, guarded);
    this.guardedOptions.set(guarded, guarded);
    return guarded;
  }
}

export function createSessionQueryClient(session: AuthSession) {
  const client = new SessionQueryClient(session);
  session.signal.addEventListener(
    'abort',
    () => {
      void client.cancelQueries();
      client.clear();
    },
    { once: true }
  );
  return client;
}
