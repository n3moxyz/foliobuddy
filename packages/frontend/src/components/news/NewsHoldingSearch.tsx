import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { HOLDING_ACCENTS, storyCountLabel } from '@/components/news/newsFormat';
import { cn } from '@/lib/utils';
import type { NewsHolding } from '@/lib/types';

const MAX_MATCHES = 8;
const NAME_WORD_SEPARATOR = /[\s\-/(),.]+/;

/** 0 = symbol prefix, 1 = a name word starts with the query, 2 = any substring; null = no match. */
function matchRank(holding: NewsHolding, needle: string): number | null {
  const symbol = holding.symbol.toLowerCase();
  const name = holding.name.toLowerCase();
  if (symbol.startsWith(needle)) return 0;
  if (name.split(NAME_WORD_SEPARATOR).some((word) => word.startsWith(needle))) return 1;
  if (symbol.includes(needle) || name.includes(needle)) return 2;
  return null;
}

function matchHoldings(holdings: NewsHolding[], query: string): NewsHolding[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  const ranked: Array<{ holding: NewsHolding; rank: number }> = [];
  for (const holding of holdings) {
    const rank = matchRank(holding, needle);
    if (rank !== null) ranked.push({ holding, rank });
  }
  // Array#sort is stable: equal ranks keep the feed's largest-holding-first order.
  return ranked
    .sort((a, b) => a.rank - b.rank)
    .slice(0, MAX_MATCHES)
    .map(({ holding }) => holding);
}

function holdingMeta(holding: NewsHolding): string {
  if (!holding.loaded) return 'Loads when opened';
  return holding.storyCount === 0 ? 'No recent headlines' : storyCountLabel(holding.storyCount);
}

/** Accessible combobox over the feed's holdings; choosing one opens its dossier. */
export function NewsHoldingSearch({
  holdings,
  onSelect,
  disabled,
}: {
  holdings: NewsHolding[];
  onSelect: (assetId: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const listboxId = useId();

  const trimmed = query.trim();
  const matches = useMemo(() => matchHoldings(holdings, trimmed), [holdings, trimmed]);
  const listVisible = open && trimmed.length > 0;
  const expanded = listVisible && matches.length > 0;
  const safeActive = activeIndex < matches.length ? activeIndex : -1;
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const select = (holding: NewsHolding) => {
    setQuery('');
    setOpen(false);
    setActiveIndex(-1);
    onSelect(holding.assetId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!trimmed) return;
      event.preventDefault();
      if (!listVisible) {
        setOpen(true);
        setActiveIndex(matches.length > 0 ? 0 : -1);
      } else if (matches.length > 0) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const from = safeActive < 0 && step < 0 ? 0 : safeActive;
        setActiveIndex((from + step + matches.length) % matches.length);
      }
    } else if (event.key === 'Enter') {
      const choice = listVisible ? (matches[safeActive] ?? matches[0]) : undefined;
      if (!choice) return;
      event.preventDefault();
      select(choice);
    } else if (event.key === 'Escape') {
      // First Escape closes the list; a second one clears the text.
      if (listVisible) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
      } else if (query) {
        event.preventDefault();
        setQuery('');
      }
    }
  };

  const statusText = !listVisible
    ? ''
    : matches.length === 0
      ? 'No matching holdings'
      : `${matches.length} matching ${matches.length === 1 ? 'holding' : 'holdings'}`;

  return (
    <div className="relative w-full sm:max-w-sm">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        role="combobox"
        aria-label="Search your holdings"
        aria-expanded={expanded}
        aria-haspopup="listbox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={expanded && safeActive >= 0 ? optionId(safeActive) : undefined}
        autoComplete="off"
        spellCheck={false}
        placeholder="Search holdings by symbol or name"
        className="pl-9"
        value={query}
        disabled={disabled}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActiveIndex(-1);
        }}
        onKeyDown={handleKeyDown}
      />
      <span role="status" aria-live="polite" className="sr-only">
        {statusText}
      </span>
      {listVisible && (
        // Mousedown inside the popup keeps focus in the input, so blur can't
        // close the list before an option's click lands.
        <div
          className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-lg"
          onMouseDown={(event) => event.preventDefault()}
        >
          {matches.length > 0 ? (
            <ul id={listboxId} role="listbox" aria-label="Matching holdings" className="py-1">
              {matches.map((holding, index) => (
                <li
                  key={holding.assetId}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === safeActive}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 px-3 py-2 text-sm sm:min-h-0',
                    index === safeActive && 'bg-muted'
                  )}
                  onClick={() => select(holding)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span
                    className={cn(
                      'shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold',
                      HOLDING_ACCENTS[holding.bucket]?.chip
                    )}
                  >
                    {holding.symbol}
                  </span>{' '}
                  <span className="min-w-0 flex-1 truncate">{holding.name}</span>{' '}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {holdingMeta(holding)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              No holding matches “{trimmed}”
            </p>
          )}
        </div>
      )}
    </div>
  );
}
