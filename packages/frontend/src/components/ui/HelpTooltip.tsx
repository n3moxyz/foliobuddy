import { useState } from 'react';
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
              setOpen((prev) => !prev);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
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
