import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Coins,
  ExternalLink,
  Globe,
  LineChart,
  Newspaper,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { PageActionHeader } from '@/components/layout/PageActionHeader';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNews } from '@/hooks/useNews';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { AssetNewsGroup, NewsItem, PortfolioNewsResponse } from '@/lib/types';

type NewsSectionId = 'crypto' | 'equities' | 'macro';
type ExpandableId = NewsSectionId | 'top';

interface NewsSectionConfig {
  id: NewsSectionId;
  label: string;
  icon: ReactNode;
  accentColor: string;
  groupBorder: string;
  groupHeaderBg: string;
  chipClass: string;
  emptyText: string;
}

const SECTION_CONFIG: NewsSectionConfig[] = [
  {
    id: 'crypto',
    label: 'Crypto',
    icon: <Coins className="h-4 w-4 text-crypto" />,
    accentColor: 'border-crypto/40 bg-crypto/5',
    groupBorder: 'border-crypto/20',
    groupHeaderBg: 'bg-crypto/5',
    chipClass: 'bg-crypto/15',
    emptyText: 'No crypto headlines right now',
  },
  {
    id: 'equities',
    label: 'Equities',
    icon: <LineChart className="h-4 w-4 text-equities" />,
    accentColor: 'border-equities/40 bg-equities/5',
    groupBorder: 'border-equities/20',
    groupHeaderBg: 'bg-equities/5',
    chipClass: 'bg-equities/15',
    emptyText: 'No equity headlines right now',
  },
  {
    id: 'macro',
    label: 'Macro',
    icon: <Globe className="h-4 w-4 text-macro" />,
    accentColor: 'border-macro/40 bg-macro/5',
    groupBorder: 'border-macro/20',
    groupHeaderBg: 'bg-macro/5',
    chipClass: 'bg-macro/15',
    emptyText: 'No macro headlines right now',
  },
];

// Interpretable event labels; unlabeled types render no tag (restraint over
// badge soup). Mirrors the backend's EVENT_TYPE_LABELS.
const EVENT_LABELS: Record<string, string> = {
  earnings: 'Earnings',
  regulation: 'Regulation',
  mna: 'M&A',
  financing: 'Financing',
  contract: 'Orders',
  security: 'Security',
  leadership: 'Leadership',
  tokenomics: 'Tokenomics',
  flows: 'Flows',
  macro: 'Macro',
  rating: 'Analyst call',
  product: 'Product',
  partnership: 'Partnership',
  industry: 'Industry data',
};

function storyCountLabel(count: number): string {
  return count === 1 ? '1 story' : `${count} stories`;
}

function totalStoryCount(news: PortfolioNewsResponse): number {
  const holdingCount = [...news.crypto, ...news.equities].reduce(
    (sum, group) => sum + group.items.length,
    0
  );
  return holdingCount + news.macro.length;
}

function newsMetaText(item: NewsItem, groupSymbol?: string): string {
  const parts = [`${item.publisher} · ${formatRelativeTime(item.publishedAt)}`];
  const eventLabel = item.importance !== 'low' ? EVENT_LABELS[item.eventType] : undefined;
  if (eventLabel) parts.push(eventLabel);
  // Tolerate a pre-ranking backend response during the deploy window.
  const affectedSymbols = item.affectedSymbols ?? [];
  if (groupSymbol) {
    const also = affectedSymbols.filter((symbol) => symbol !== groupSymbol).slice(0, 3);
    if (also.length > 0) parts.push(`also affects ${also.join(', ')}`);
  } else if (affectedSymbols.length > 0) {
    parts.push(`affects ${affectedSymbols.slice(0, 3).join(', ')}`);
  }
  return parts.join(' · ');
}

function NewsRow({ item, groupSymbol }: { item: NewsItem; groupSymbol?: string }) {
  const showImportant = item.importance === 'high';
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="group flex min-h-11 flex-col justify-center gap-1 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm leading-normal group-hover:underline">
          {item.title}
          <ExternalLink
            className="ml-1.5 inline h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {showImportant && (
            <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary">
              Important
            </span>
          )}
          {item.primarySource && (
            <span className="rounded border px-1.5 py-0.5 font-semibold">Primary source</span>
          )}
          <span>{newsMetaText(item, groupSymbol)}</span>
        </span>
      </a>
    </li>
  );
}

function AssetNewsGroupCard({
  group,
  config,
}: {
  group: AssetNewsGroup;
  config: NewsSectionConfig;
}) {
  return (
    <div className={cn('overflow-hidden rounded-lg border', config.groupBorder)}>
      <div
        className={cn('flex items-center justify-between gap-2 px-3 py-2', config.groupHeaderBg)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn('rounded px-1.5 py-0.5 text-xs font-semibold', config.chipClass)}>
            {group.symbol}
          </span>
          <span className="truncate text-xs text-muted-foreground">{group.name}</span>
          {group.openTradeOnly && (
            <span className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-xs font-semibold text-primary">
              Open trade
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {storyCountLabel(group.items.length)}
        </span>
      </div>
      <ul className="divide-y border-t">
        {group.items.map((item) => (
          <NewsRow key={item.id} item={item} groupSymbol={group.symbol} />
        ))}
      </ul>
    </div>
  );
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

export default function News() {
  usePageTitle('News');
  const { data: news, isLoading, isError, error, refetch, isFetching } = useNews();
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
  // Tolerate a pre-ranking backend response during the deploy window.
  const topStories = news?.topStories ?? [];

  return (
    <div className="space-y-6">
      <PageActionHeader
        title="News"
        subtitle={subtitle}
        actions={
          <>
            <span role="status" aria-live="polite" className="sr-only">
              {isFetching ? 'Refreshing news' : ''}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="touch-manipulation"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} />
              {isFetching ? 'Refreshing...' : 'Refresh'}
            </Button>
          </>
        }
      />

      {isLoading ? (
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
      ) : news && !hasAnyStories ? (
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
                    <NewsRow key={item.id} item={item} />
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
                : groups.reduce((sum, group) => sum + group.items.length, 0);

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
                {section.id === 'macro' ? (
                  news.macro.length === 0 ? (
                    <SectionEmpty text={section.emptyText} />
                  ) : (
                    <div className={cn('overflow-hidden rounded-lg border', section.groupBorder)}>
                      <ul className="divide-y">
                        {news.macro.map((item) => (
                          <NewsRow key={item.id} item={item} />
                        ))}
                      </ul>
                    </div>
                  )
                ) : groups.length === 0 ? (
                  <SectionEmpty text={section.emptyText} />
                ) : (
                  <div className="space-y-3">
                    {groups.map((group) => (
                      <AssetNewsGroupCard key={group.assetId} group={group} config={section} />
                    ))}
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
