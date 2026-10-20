import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './button';

export function QueryErrorNotice({
  subject,
  hasData = false,
  retrying = false,
  onRetry,
}: {
  subject: string;
  hasData?: boolean;
  retrying?: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center">
      <div role="alert" className="flex min-w-0 flex-1 items-start gap-2">
        <AlertCircle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
        <div className="text-sm">
          <p className="font-medium">
            Couldn't {hasData ? 'refresh' : 'load'} {subject}
          </p>
          <p className="mt-1 text-muted-foreground">
            {hasData ? 'Showing the last loaded data. ' : ''}Check your connection and try again.
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="self-start shrink-0 sm:self-auto"
        disabled={retrying}
        onClick={onRetry}
      >
        <RefreshCw
          aria-hidden="true"
          className={`mr-2 h-4 w-4 ${retrying ? 'animate-spin' : ''}`}
        />
        {retrying ? 'Retrying…' : 'Try again'}
      </Button>
    </div>
  );
}
