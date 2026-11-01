import { useRef, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface HelpTooltipProps {
  content: string;
  /** What the tooltip explains, e.g. "Exposure" — differentiates the accessible
   * name ("Help: Exposure") so screen-reader control lists aren't all "Help". */
  label?: string;
}

export function HelpTooltip({ content, label }: HelpTooltipProps) {
  const [open, setOpen] = useState(false);
  // The current press: its pointer type and whether the tooltip was open when it began. On a touch
  // tap, Chrome focuses the button after the finger lifts, so Radix opens the tooltip on focus just
  // before the click arrives; flipping the state at click time would close it again at once.
  const pressRef = useRef<{ pointerType: string; wasOpen: boolean } | null>(null);

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label ? `Help: ${label}` : 'Help'}
            className="-my-3 -ml-2 -mr-3 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full align-middle touch-manipulation hover:bg-muted/50 sm:-my-2 sm:-ml-1.5 sm:-mr-2 sm:h-9 sm:w-9"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // Keyboard and screen-reader clicks (detail 0) have no press of their own, even if an
              // earlier press never reached a click.
              const press = e.detail === 0 ? null : pressRef.current;
              pressRef.current = null;
              if (!press) {
                // Toggle what is showing now.
                setOpen((prev) => !prev);
              } else if (press.pointerType === 'touch') {
                // A tap toggles.
                setOpen(!press.wasOpen);
              } else {
                // A mouse or pen may have hovered it open already; a click keeps it open.
                setOpen(true);
              }
            }}
            onPointerDown={(e) => {
              e.stopPropagation();
              pressRef.current = { pointerType: e.pointerType, wasOpen: open };
            }}
          >
            <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/80" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
