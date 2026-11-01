import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CONNECTION_HINT } from '@/lib/mutationFeedback';
import { cn } from '@/lib/utils';

/**
 * Compact load-error notice for a search box's results popup. A failed search has
 * unknown results, so it replaces the "No matching …" line rather than echoing it.
 * Page-level loads use QueryErrorNotice instead.
 */
export function SearchErrorNotice({
  subject,
  onRetry,
  className,
}: {
  /** Plural of what the box searches: "assets", "benchmarks". */
  subject: string;
  onRetry: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm',
        className
      )}
    >
      <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <div role="alert">
          <p className="font-medium">Couldn't search {subject}</p>
          <p className="mt-1 text-muted-foreground">{CONNECTION_HINT}</p>
        </div>
        {/* type="button": the pickers sit inside forms, where a bare button submits. */}
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4" />
          Try again
        </Button>
      </div>
    </div>
  );
}
