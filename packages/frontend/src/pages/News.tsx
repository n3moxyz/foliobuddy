import { useState, type ReactNode } from 'react';
import { Coins, ExternalLink, Globe, LineChart, Newspaper, RefreshCw } from 'lucide-react';
import { PageActionHeader } from '@/components/layout/PageActionHeader';
import { CollapsibleCard } from '@/components/portfolio/CollapsibleCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useNews } from '@/hooks/useNews';
import { usePageTitle } from '@/hooks/usePageTitle';
import { cn, formatRelativeTime } from '@/lib/utils';
import type { AssetNewsGroup, NewsItem, PortfolioNewsResponse } from '@/lib/types';

type NewsSectionId = 'crypto' | 'equities' | 'macro';

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

function NewsRow({ item }: { item: NewsItem }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        className="group flex min-h-11 flex-col justify-center gap-0.5 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm leading-snug group-hover:underline">
          {item.title}
          <ExternalLink
            className="ml-1.5 inline h-3 w-3 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </span>
        <span className="text-xs text-muted-foreground">
          {item.publisher} · {formatRelativeTime(item.publishedAt)}
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
            <span className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-xs text-primary">
              Open trade
            </span>
          )}
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {storyCountLabel(group.items.length)}
        </span>
      </div>
      <ul className="divide-y border-t">
        {group.items.map((item) => (
          <NewsRow key={item.id} item={item} />
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
  const [expanded, setExpanded] = useState<Record<NewsSectionId, boolean>>({
    crypto: true,
    equities: true,
    macro: true,
  });

  const toggleSection = (id: NewsSectionId) =>
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  const subtitle = news
    ? `${storyCountLabel(totalStoryCount(news))} · updated ${formatRelativeTime(news.fetchedAt)}`
    : 'Headlines for your holdings';

  const hasAnyStories = news ? totalStoryCount(news) > 0 : false;

  return (
    <div className="space-y-6">
      <PageActionHeader
        title="News"
        subtitle={subtitle}
        actions={
          <Button
            variant="outline"
            size="sm"
            className="touch-manipulation"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4 mr-1', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <NewsSkeleton />
      ) : isError ? (
        <div className="py-16 text-center">
          <Newspaper className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
          <h2 className="mb-1 text-lg font-semibold">Couldn't load news</h2>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Something went wrong fetching headlines.'}
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
        </div>
      ) : news ? (
        <div className="space-y-4">
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
