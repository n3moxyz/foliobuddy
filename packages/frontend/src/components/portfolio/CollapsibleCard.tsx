import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollapsibleCardProps {
  title: string | ReactNode;
  isExpanded: boolean;
  onToggle: () => void;
  titleHelp?: ReactNode;
  headerRight?: ReactNode;
  headerExtra?: ReactNode;
  icon?: ReactNode;
  accentColor?: string;
  children: ReactNode;
}

export function CollapsibleCard({
  title,
  isExpanded,
  onToggle,
  titleHelp,
  headerRight,
  headerExtra,
  icon,
  accentColor,
  children,
}: CollapsibleCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={cn(accentColor)}>
        <CardHeader className="py-3 px-4 hover:bg-muted/30 transition-colors select-none">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {/* Heading wraps the trigger button (not the reverse): <button><h2> is
                  invalid HTML and hides the heading from screen-reader navigation. */}
              <CardTitle className="min-w-0 flex-1 text-base">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-11 w-full min-w-0 items-center gap-2 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <ChevronRight
                      className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                        isExpanded ? 'rotate-90' : ''
                      }`}
                    />
                    {icon}
                    <span className="min-w-0 truncate">{title}</span>
                  </button>
                </CollapsibleTrigger>
              </CardTitle>
              {titleHelp}
            </div>
            {headerRight ? (
              <div className="flex max-w-[48%] shrink-0 flex-wrap items-center justify-end gap-2 sm:max-w-none">
                {headerRight}
              </div>
            ) : null}
          </div>
          {headerExtra}
        </CardHeader>
        <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
          <CardContent className="px-4 pb-3 pt-0">{children}</CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
