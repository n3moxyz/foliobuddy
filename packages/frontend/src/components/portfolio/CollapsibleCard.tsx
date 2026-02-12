import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight } from 'lucide-react';

interface CollapsibleCardProps {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
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
  headerRight,
  headerExtra,
  icon,
  accentColor,
  children,
}: CollapsibleCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className={accentColor ? `border-l-2 ${accentColor}` : undefined}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors select-none">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ChevronRight
                  className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                    isExpanded ? 'rotate-90' : ''
                  }`}
                />
                {icon}
                <CardTitle className="text-base">{title}</CardTitle>
              </div>
              <div className="flex items-center gap-3">
                {headerRight}
              </div>
            </div>
            {headerExtra}
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up overflow-hidden">
          <CardContent className="px-4 pb-3 pt-0">
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
