import { useRef } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  formatMilestoneDate,
  PORTFOLIO_MILESTONE_EXPLANATIONS,
  PORTFOLIO_MILESTONE_LABELS,
  type PortfolioMilestone,
} from '@/lib/portfolioHistory';
import { formatDrawdown } from '@/lib/utils';
import { PortfolioMilestoneGlyph } from './PortfolioMilestoneGlyph';

export function PortfolioMilestoneDetails({
  events,
  showDate = true,
}: {
  events: PortfolioMilestone[];
  showDate?: boolean;
}) {
  return (
    <div className="space-y-2 whitespace-normal text-xs leading-relaxed">
      {showDate && (
        <p className="text-muted-foreground">{formatMilestoneDate(events[0]?.timestamp)}</p>
      )}
      {events.map((event) => (
        <div key={event.kind}>
          <p className="font-medium">
            {PORTFOLIO_MILESTONE_LABELS[event.kind]}
            {event.drawdownPct != null && ` · ${formatDrawdown(event.drawdownPct)}`}
          </p>
          <p className="text-muted-foreground">{PORTFOLIO_MILESTONE_EXPLANATIONS[event.kind]}</p>
        </div>
      ))}
    </div>
  );
}

interface MilestoneInteraction {
  activeKind: PortfolioMilestone['kind'] | null;
  onActiveChange: (kind: PortfolioMilestone['kind'], active: boolean) => void;
}

function MilestoneLegendItem({
  events,
  activeKind,
  onActiveChange,
}: { events: PortfolioMilestone[] } & MilestoneInteraction) {
  const pointerStartOpen = useRef<boolean | null>(null);
  const label = events.map((event) => PORTFOLIO_MILESTONE_LABELS[event.kind]).join(' · ');
  const marker = events.find((event) => event.kind === 'mdd') ?? events[0];
  const activeEvent = events.find((event) => event.kind === activeKind);
  const open = activeEvent !== undefined;
  const interactionKind = activeEvent?.kind ?? marker.kind;
  return (
    <li>
      <Tooltip open={open} onOpenChange={(nextOpen) => onActiveChange(interactionKind, nextOpen)}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Explain ${label}`}
            className="inline-flex min-h-11 cursor-help items-center gap-1.5 rounded-sm text-left text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
            // Radix closes on pointer-down. Toggle from the state before that close.
            onPointerDownCapture={() => {
              pointerStartOpen.current = open;
            }}
            onPointerCancel={() => {
              pointerStartOpen.current = null;
            }}
            onKeyDown={() => {
              pointerStartOpen.current = null;
            }}
            onClick={(event) => {
              event.preventDefault();
              const wasOpen = pointerStartOpen.current;
              pointerStartOpen.current = null;
              onActiveChange(interactionKind, !(wasOpen ?? open));
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="-6 -6 12 12"
              aria-hidden="true"
              className="shrink-0"
            >
              <PortfolioMilestoneGlyph kind={marker.kind} />
            </svg>
            <span>{label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" collisionPadding={12} className="max-w-[280px]">
          <PortfolioMilestoneDetails events={events} />
        </TooltipContent>
      </Tooltip>
    </li>
  );
}

export function PortfolioMilestoneLegend({
  groups,
  activeKind,
  onActiveChange,
}: { groups: PortfolioMilestone[][] } & MilestoneInteraction) {
  return (
    <TooltipProvider delayDuration={200}>
      <ul
        aria-label="Portfolio chart milestones"
        className="mt-2 flex flex-wrap items-center gap-x-4 text-[11px] sm:text-xs"
      >
        {groups.map((events) => (
          <MilestoneLegendItem
            key={events.map((event) => event.kind).join('-')}
            events={events}
            activeKind={activeKind}
            onActiveChange={onActiveChange}
          />
        ))}
      </ul>
    </TooltipProvider>
  );
}
