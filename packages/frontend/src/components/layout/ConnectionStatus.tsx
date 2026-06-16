import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ConnectionStatus as ConnectionStatusType } from '@/hooks/useWebSocket';

interface ConnectionStatusProps {
  status: ConnectionStatusType;
  lastUpdate: Date | null;
}

const statusConfig = {
  connected: {
    label: 'Live',
    dotClass: 'bg-[hsl(var(--profit))]',
    pulseClass: 'animate-pulse',
  },
  connecting: {
    label: 'Connecting...',
    dotClass: 'bg-warning',
    pulseClass: '',
  },
  disconnected: {
    label: import.meta.env.DEV ? 'Dev Mode' : 'Offline',
    dotClass: import.meta.env.DEV ? 'bg-info' : 'bg-muted-foreground',
    pulseClass: '',
  },
};

function formatLastUpdate(date: Date | null): string {
  if (!date) return 'No updates yet';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 5) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return date.toLocaleTimeString();
}

export function ConnectionStatus({ status, lastUpdate }: ConnectionStatusProps) {
  const config = statusConfig[status];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-default hover:bg-muted/50 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            {status === 'connected' && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-profit/60 opacity-75" />
            )}
            <span className={cn('relative inline-flex rounded-full h-2 w-2', config.dotClass)} />
          </span>
          <span
            role="status"
            aria-live={status === 'disconnected' ? 'assertive' : 'polite'}
            className="text-xs font-medium text-muted-foreground"
          >
            {config.label}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <p className="font-medium">
            {status === 'connected'
              ? 'Real-time updates active'
              : status === 'connecting'
                ? 'Establishing connection...'
                : 'Using polling fallback'}
          </p>
          <p className="text-muted-foreground mt-1">Last update: {formatLastUpdate(lastUpdate)}</p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
