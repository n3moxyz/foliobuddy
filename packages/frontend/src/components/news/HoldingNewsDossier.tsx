import { useEffect, useId, useRef, type RefObject } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Newspaper, X } from 'lucide-react';
import { NewsRow, type NewsFeedbackHandler } from '@/components/news/NewsRow';
import { HOLDING_ACCENTS, storyCountLabel } from '@/components/news/newsFormat';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AssetNewsResponse, NewsHolding } from '@/lib/types';

type DossierHolding = AssetNewsResponse['holding'];

function DossierHeader({
  holding,
  headingRef,
  headingId,
  onClose,
}: {
  holding: DossierHolding | undefined;
  headingRef: RefObject<HTMLHeadingElement>;
  headingId: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {/* Receives focus when the view opens, so screen readers land on the new content. */}
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="flex min-w-0 items-center gap-2 text-lg font-semibold outline-none"
        >
          {holding ? (
            <>
              <span
                className={cn(
                  'shrink-0 rounded px-1.5 py-0.5 text-sm font-semibold',
                  HOLDING_ACCENTS[holding.bucket]?.chip
                )}
              >
                {holding.symbol}
              </span>{' '}
              <span className="truncate">{holding.name}</span>
            </>
          ) : (
            'Holding news'
          )}
        </h2>
        {holding?.openTradeOnly && (
          <span className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-xs font-semibold text-primary">
            Open trade
          </span>
        )}
      </div>
      <Button variant="ghost" size="sm" className="shrink-0" onClick={onClose}>
        <X className="mr-1 h-4 w-4" aria-hidden="true" />
        All news
      </Button>
    </div>
  );
}

function DossierBody({
  query,
  symbol,
  featuredIds,
  onFeedback,
}: {
  query: UseQueryResult<AssetNewsResponse, Error>;
  symbol: string | undefined;
  featuredIds: Set<string>;
  onFeedback: NewsFeedbackHandler;
}) {
  const { data, isPending, isError, error, refetch } = query;

  // isPending, not isLoading: a retry paused while the tab is hidden or offline
  // is still "no data yet", and must not render an empty dossier.
  if (isPending) {
    return (
      <div role="status" aria-live="polite" className="space-y-3">
        <span className="sr-only">Loading {symbol ?? 'holding'} news…</span>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (isError && !data) {
    return (
      <div role="alert" className="rounded-lg border px-4 py-10 text-center">
        <Newspaper className="mx-auto mb-3 h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mb-1 font-semibold">Couldn't load news for {symbol ?? 'this holding'}</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">
          {error?.message || 'Please try again.'}
        </p>
        <Button className="mt-4" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!data) return null;

  return (
    <>
      {/* A failed refresh keeps the last-good headlines, same as the feed. */}
      {isError && (
        <p
          role="alert"
          className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
        >
          Couldn't refresh — showing the last loaded headlines.
        </p>
      )}
      {data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No headlines for {data.holding.symbol} in the last {data.windowDays} days.
        </p>
      ) : (
        <>
          <div
            className={cn(
              'overflow-hidden rounded-lg border',
              HOLDING_ACCENTS[data.holding.bucket]?.border
            )}
          >
            <ul className="divide-y">
              {data.items.map((item) => (
                <NewsRow
                  key={item.id}
                  item={item}
                  groupSymbol={data.holding.symbol}
                  featured={featuredIds.has(item.id)}
                  onFeedback={onFeedback}
                />
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            {storyCountLabel(data.items.length)} · last {data.windowDays} days · newest first
          </p>
        </>
      )}
    </>
  );
}

/** Every story touching one holding over the backend's dossier window, newest first. */
export function HoldingNewsDossier({
  assetId,
  query,
  fallbackHolding,
  featuredIds,
  onFeedback,
  onClose,
}: {
  assetId: string;
  query: UseQueryResult<AssetNewsResponse, Error>;
  /** Feed entry for the header while the dossier loads */
  fallbackHolding?: NewsHolding;
  featuredIds: Set<string>;
  onFeedback: NewsFeedbackHandler;
  onClose: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const holding: DossierHolding | undefined = query.data?.holding ?? fallbackHolding;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [assetId]);

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <DossierHeader
        holding={holding}
        headingRef={headingRef}
        headingId={headingId}
        onClose={onClose}
      />
      <DossierBody
        query={query}
        symbol={holding?.symbol}
        featuredIds={featuredIds}
        onFeedback={onFeedback}
      />
    </section>
  );
}
