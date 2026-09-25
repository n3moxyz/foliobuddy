import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coins, Globe, LineChart, Newspaper, RefreshCw, Sparkles } from 'lucide-react';
import { PageActionHeader } from '@/components/layout/PageActionHeader';
import { HoldingNewsCard, HoldingShortcutLine } from '@/components/news/HoldingNewsCard';
import { HoldingNewsDossier } from '@/components/news/HoldingNewsDossier';
import { NewsHoldingSearch } from '@/components/news/NewsHoldingSearch';
import { NewsRow, type NewsFeedbackHandler } from '@/components/news/NewsRow';
import { groupStoryCount, HOLDING_ACCENTS, storyCountLabel } from '@/components/news/newsFormat';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { useAssetNews, useNews, useNewsEnrichment } from '@/hooks/useNews';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { AssetNewsGroup, NewsBucket, NewsHolding, PortfolioNewsResponse } from '@/lib/types';

type NewsSectionId = NewsBucket | 'macro';
type ExpandableId = NewsSectionId | 'top';

interface NewsSectionConfig {
  id: NewsSectionId;
  label: string;
  icon: ReactNode;
  accentColor: string;
  emptyText: string;
}

const SECTION_CONFIG: NewsSectionConfig[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    icon: <Coins className="h-4 w-4 text-crypto" />,
    accentColor: 'border-crypto/40 bg-crypto/5',
    emptyText: 'No crypto headlines right now',
  },
  {
    id: 'equities',
    label: 'Equities',
    icon: <LineChart className="h-4 w-4 text-equities" />,
    accentColor: 'border-equities/40 bg-equities/5',
    emptyText: 'No equity headlines right now',
  },
  {
    id: 'macro',
    label: 'Macro',
    icon: <Globe className="h-4 w-4 text-macro" />,
    accentColor: 'border-macro/40 bg-macro/5',
    emptyText: 'No macro headlines right now',
  },
];

// The feed's per-holding window; the dossier's (longer) window comes from the API.
const QUIET_HOLDINGS_LABEL = 'No headlines in the last 14 days:';
const UNLOADED_HOLDINGS_LABEL = 'Also held:';

// Same per-holding counts as the section headers, so the subtitle equals their sum.
function totalStoryCount(news: PortfolioNewsResponse): number {
  const holdingCount = [...news.crypto, ...news.equities].reduce(
    (sum, group) => sum + groupStoryCount(group),
    0
  );
  return holdingCount + news.macro.length;
}

function SectionEmpty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function NewsSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">Loading news…</span>
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
      <Skeleton className="h-44 w-full" />
    </div>
  );
}

/** One compact card per holding with news, then the quiet and not-loaded holdings as shortcuts. */
function HoldingSectionBody({
  bucket,
  emptyText,
  groups,
  holdings,
  featuredIds,
  onFeedback,
  onOpen,
}: {
  bucket: NewsBucket;
  emptyText: string;
  groups: AssetNewsGroup[];
  holdings: NewsHolding[];
  featuredIds: Set<string>;
  onFeedback: NewsFeedbackHandler;
  onOpen: (assetId: string) => void;
}) {
  const quiet = holdings.filter((holding) => holding.loaded && holding.storyCount === 0);
  const unloaded = holdings.filter((holding) => !holding.loaded);
  return (
    <div className="space-y-3">
      {groups.map((group) => (
        <HoldingNewsCard
          key={group.assetId}
          group={group}
          accent={HOLDING_ACCENTS[bucket]}
          featuredIds={featuredIds}
          onFeedback={onFeedback}
          onOpen={onOpen}
        />
      ))}
      {groups.length === 0 && quiet.length === 0 && <SectionEmpty text={emptyText} />}
      <HoldingShortcutLine label={QUIET_HOLDINGS_LABEL} holdings={quiet} onOpen={onOpen} />
      <HoldingShortcutLine label={UNLOADED_HOLDINGS_LABEL} holdings={unloaded} onOpen={onOpen} />
    </div>
  );
}

function findHoldingTrigger(assetId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>('[data-news-holding]')).find(
    (element) => element.dataset.newsHolding === assetId
  );
}

/**
 * `?asset=<assetId>` shows one holding's dossier (keyed by asset id — symbols
 * are not unique). Opening pushes a history entry, so browser Back returns to
 * the feed (mirrors Trades' `?ticker=`). A dossier opens at the top; the feed,
 * via All news or Back, returns to the reader's place and the control they used.
 */
function useHoldingDossierParam() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedAssetId = searchParams.get('asset') || null;
  const feedScrollY = useRef(0);
  const returnFocusTo = useRef<HTMLElement | null>(null);
  const shownAssetId = useRef(selectedAssetId);

  const openHolding = (assetId: string) => {
    if (assetId === selectedAssetId) return;
    if (!selectedAssetId) {
      feedScrollY.current = window.scrollY;
      const trigger = document.activeElement;
      returnFocusTo.current = trigger instanceof HTMLElement ? trigger : null;
    }
    const next = new URLSearchParams(searchParams);
    next.set('asset', assetId);
    setSearchParams(next, { replace: false });
  };
  const showFeed = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('asset');
    setSearchParams(next, { replace: false });
  };

  useLayoutEffect(() => {
    if (shownAssetId.current === selectedAssetId) return;
    shownAssetId.current = selectedAssetId;
    if (selectedAssetId) {
      window.scrollTo(0, 0);
      return;
    }
    window.scrollTo(0, feedScrollY.current);
    // The search input stays mounted across views; feed cards and chips remount,
    // so find their replacement by asset id.
    const trigger = returnFocusTo.current;
    const holdingId = trigger?.dataset.newsHolding;
    const target = trigger?.isConnected
      ? trigger
      : holdingId
        ? findHoldingTrigger(holdingId)
        : undefined;
    target?.focus({ preventScroll: true });
  }, [selectedAssetId]);

  return { selectedAssetId, openHolding, showFeed };
}

export default function News() {
  usePageTitle('News');
  const { selectedAssetId, openHolding, showFeed } = useHoldingDossierParam();
  const { data: news, isPending, isError, error, refetch, isFetching } = useNews();
  const assetNews = useAssetNews(selectedAssetId);
  const [expanded, setExpanded] = useState<Record<ExpandableId, boolean>>({
    top: true,
    crypto: true,
    equities: true,
    macro: true,
  });

  const toggleSection = (id: ExpandableId) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const subtitle = news
    ? `${storyCountLabel(totalStoryCount(news))} · updated ${formatRelativeTime(news.fetchedAt)}`
    : 'Headlines for your holdings';

  const hasAnyStories = news ? totalStoryCount(news) > 0 : false;
  // Tolerate a pre-search / pre-ranking backend response during the deploy window.
  const holdings = news?.holdings ?? [];
  const topStories = news?.topStories ?? [];
  // AI summaries arrive asynchronously; the feed never waits for them.
  const { data: enrichmentData } = useNewsEnrichment(topStories.map((item) => item.id));
  const featuredIds = new Set(topStories.map((item) => item.id));

  const feedbackMutation = useMutation({
    mutationFn: api.sendNewsFeedback,
    onSuccess: () => toast.success('Feedback noted'),
  });
  const handleFeedback: NewsFeedbackHandler = (item, reason, symbol) => {
    feedbackMutation.mutate({
      storyId: item.id,
      title: item.title,
      publisher: item.publisher,
      eventType: item.eventType,
      importance: item.importance,
      symbol: symbol ?? item.affectedSymbols?.[0],
      reason,
    });
  };

  const activeFetching = selectedAssetId ? assetNews.isFetching : isFetching;
  const refresh = () => (selectedAssetId ? assetNews.refetch() : refetch());

  return (
    <div className="space-y-6">
      <PageActionHeader
        title="News"
        subtitle={subtitle}
        stickyOnMobile={false}
        actions={
          <>
            <span role="status" aria-live="polite" className="sr-only">
              {activeFetching ? 'Refreshing news' : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="touch-manipulation"
              onClick={() => refresh()}
              disabled={activeFetching}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', activeFetching && 'animate-spin')} />
              {activeFetching ? 'Refreshing...' : 'Refresh'}
            </Button>
          </>
        }
      >
        {/* Disabled until the feed (the holdings source) loads; hidden when there is nothing to search. */}
        {(!news || holdings.length > 0) && (
          <NewsHoldingSearch holdings={holdings} onSelect={openHolding} disabled={!news} />
        )}
      </PageActionHeader>

      {selectedAssetId ? (
        <HoldingNewsDossier
          assetId={selectedAssetId}
          query={assetNews}
          fallbackHolding={holdings.find((holding) => holding.assetId === selectedAssetId)}
          featuredIds={featuredIds}
          onFeedback={handleFeedback}
          onClose={showFeed}
        />
      ) : isPending ? (
        // isPending, not isLoading: a first load paused offline or in a hidden
        // tab has no data yet and must not render a blank page.
        <NewsSkeleton />
      ) : isError && !news ? (
        <div className="py-16 text-center">
          <Newspaper className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">Couldn't load news</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Please try again.'}
          </p>
          <Button className="mt-4" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : news && !hasAnyStories && holdings.length === 0 ? (
        <div className="py-16 text-center">
          <Newspaper className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">No news yet</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Add crypto or equity positions and headlines for your holdings will show up here.
          </p>
          <Button asChild className="mt-4" size="sm">
            <Link to="/portfolio">Go to Portfolio</Link>
          </Button>
        </div>
      ) : news ? (
        <div className="space-y-6">
          {/* A failed refetch keeps the last-good headlines visible — never
              swap loaded content for the full-page error state. */}
          {isError && (
            <p
              role="alert"
              className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning"
            >
              Couldn't refresh — showing the last loaded headlines.
            </p>
          )}
          {topStories.length > 0 && (
            <CollapsibleCard
              title="Top stories"
              icon={<Sparkles className="h-4 w-4 text-primary" />}
              accentColor="border-primary/30 bg-primary/5"
              isExpanded={expanded.top}
              onToggle={() => toggleSection('top')}
              headerRight={
                <span className="text-sm tabular-nums text-muted-foreground">
                  {storyCountLabel(topStories.length)}
                </span>
              }
            >
              <div className="overflow-hidden rounded-lg border border-primary/20">
                <ul className="divide-y">
                  {topStories.map((item) => (
                    <NewsRow
                      key={item.id}
                      item={item}
                      enrichment={enrichmentData?.enrichments[item.id]}
                      onFeedback={handleFeedback}
                    />
                  ))}
                </ul>
              </div>
            </CollapsibleCard>
          )}
          {SECTION_CONFIG.map((section) => {
            const groups = section.id === 'macro' ? [] : news[section.id];
            const storyCount =
              section.id === 'macro'
                ? news.macro.length
                : groups.reduce((sum, group) => sum + groupStoryCount(group), 0);

            return (
              <CollapsibleCard
                key={section.id}
                title={section.label}
                icon={section.icon}
                accentColor={section.accentColor}
                isExpanded={expanded[section.id]}
                onToggle={() => toggleSection(section.id)}
                headerRight={
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {storyCountLabel(storyCount)}
                  </span>
                }
              >
                {section.id !== 'macro' ? (
                  <HoldingSectionBody
                    bucket={section.id}
                    emptyText={section.emptyText}
                    groups={groups}
                    holdings={holdings.filter((holding) => holding.bucket === section.id)}
                    featuredIds={featuredIds}
                    onFeedback={handleFeedback}
                    onOpen={openHolding}
                  />
                ) : news.macro.length === 0 ? (
                  <SectionEmpty text={section.emptyText} />
                ) : (
                  <div className="overflow-hidden rounded-lg border border-macro/20">
                    <ul className="divide-y">
                      {news.macro.map((item) => (
                        <NewsRow
                          key={item.id}
                          item={item}
                          featured={featuredIds.has(item.id)}
                          onFeedback={handleFeedback}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </CollapsibleCard>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
