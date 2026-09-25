import { useId } from 'react';
import { ChevronRight } from 'lucide-react';
import { NewsRow, type NewsFeedbackHandler } from '@/components/news/NewsRow';
import { groupStoryCount, storyCountLabel, type HoldingAccent } from '@/components/news/newsFormat';
import { cn } from '@/lib/utils';
import type { AssetNewsGroup, NewsHolding } from '@/lib/types';

/**
 * Compact feed card: a header that opens the holding's dossier, then only its
 * top story. `data-news-holding` lets the page return focus here on close.
 */
export function HoldingNewsCard({
  group,
  accent,
  featuredIds,
  onFeedback,
  onOpen,
}: {
  group: AssetNewsGroup;
  accent: HoldingAccent;
  featuredIds: Set<string>;
  onFeedback: NewsFeedbackHandler;
  onOpen: (assetId: string) => void;
}) {
  const topItem = group.items[0];
  return (
    <div className={cn('overflow-hidden rounded-lg border', accent.border)}>
      {/* Heading wraps the button (never the reverse) so it stays in heading navigation. */}
      <h3>
        <button
          type="button"
          data-news-holding={group.assetId}
          onClick={() => onOpen(group.assetId)}
          className={cn(
            'flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:min-h-0',
            accent.headerBg
          )}
        >
          {/* The {' '} separators keep the button's accessible name spaced
              ("BTC Bitcoin 3 stories"); flex layout ignores them visually. */}
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={cn('shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold', accent.chip)}
            >
              {group.symbol}
            </span>{' '}
            <span className="truncate text-xs text-muted-foreground">{group.name}</span>
            {group.openTradeOnly && (
              <>
                {' '}
                <span className="shrink-0 rounded border border-primary/30 px-1.5 py-0.5 text-xs font-semibold text-primary">
                  Open trade
                </span>
              </>
            )}
          </span>{' '}
          <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
            {storyCountLabel(groupStoryCount(group))}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
        </button>
      </h3>
      {topItem && (
        <ul className="border-t">
          <NewsRow
            item={topItem}
            groupSymbol={group.symbol}
            featured={featuredIds.has(topItem.id)}
            onFeedback={onFeedback}
          />
        </ul>
      )}
    </div>
  );
}

/** Muted "label: SYM SYM" line of holdings without a card; each symbol opens its dossier. */
export function HoldingShortcutLine({
  label,
  holdings,
  onOpen,
}: {
  label: string;
  holdings: NewsHolding[];
  onOpen: (assetId: string) => void;
}) {
  const labelId = useId();
  if (holdings.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span id={labelId}>{label}</span>
      <ul aria-labelledby={labelId} className="flex flex-wrap items-center gap-1.5">
        {holdings.map((holding) => (
          <li key={holding.assetId}>
            <button
              type="button"
              data-news-holding={holding.assetId}
              onClick={() => onOpen(holding.assetId)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border bg-background px-2 font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0 sm:min-w-0 sm:py-0.5"
            >
              {holding.symbol}{' '}
              {/* Symbols are not unique — the name disambiguates for screen readers. */}
              <span className="sr-only">{holding.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
