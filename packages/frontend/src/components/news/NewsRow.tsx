import { ExternalLink, Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatRelativeTime } from '@/lib/utils';
import type { NewsEnrichment, NewsFeedbackReason, NewsItem } from '@/lib/types';

export type NewsFeedbackHandler = (
  item: NewsItem,
  reason: NewsFeedbackReason,
  symbol?: string
) => void;

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

function newsMetaText(item: NewsItem, groupSymbol?: string, featured?: boolean): string {
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
  if (featured) parts.push('in Top stories');
  return parts.join(' · ');
}

export function NewsRow({
  item,
  groupSymbol,
  enrichment,
  featured,
  onFeedback,
}: {
  item: NewsItem;
  groupSymbol?: string;
  enrichment?: NewsEnrichment;
  featured?: boolean;
  onFeedback?: NewsFeedbackHandler;
}) {
  const showImportant = item.importance === 'high';
  return (
    <li>
      <div className="flex items-stretch">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="group flex min-h-11 min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            <span>{newsMetaText(item, groupSymbol, featured)}</span>
          </span>
        </a>
        {/* Feedback control sits OUTSIDE the link — never nest interactive content. */}
        {onFeedback && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-11 w-11 shrink-0 self-stretch rounded-none p-0 text-muted-foreground sm:w-9"
                aria-label={`Flag story: ${item.title}`}
              >
                <Flag className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onFeedback(item, 'not_relevant', groupSymbol)}>
                Not relevant
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onFeedback(item, 'poor_source', groupSymbol)}>
                Poor source
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {enrichment && (
        <div className="border-t border-dashed px-3 py-2">
          <p className="text-sm leading-normal">{enrichment.summary}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Why it matters — {enrichment.whyItMatters}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI summary from the article · {enrichment.confidence} confidence
          </p>
        </div>
      )}
    </li>
  );
}
