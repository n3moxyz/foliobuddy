import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useDbHealth } from '@/hooks/useDbHealth';

export function DbStatusBanner() {
  const { data, isLoading, isError } = useDbHealth();

  const isHealthy = !isLoading && !isError && data?.status === 'ok';
  const isUnhealthy = isError || (data && data.status !== 'ok');

  const dotClass = isLoading ? 'bg-yellow-500' : isHealthy ? 'bg-green-500' : 'bg-red-500';

  const label = isLoading ? 'Checking...' : isHealthy ? 'DB OK' : 'DB Down';

  const tooltipText = isLoading
    ? 'Checking database connection...'
    : isHealthy
      ? `Database healthy (${data!.latency_ms}ms)`
      : isUnhealthy && data?.message
        ? `Database error: ${data.message}`
        : 'Database unreachable';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 rounded-md cursor-default hover:bg-muted/50 transition-colors"
        >
          <span className="relative flex h-2 w-2">
            {isHealthy && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            )}
            <span className={cn('relative inline-flex rounded-full h-2 w-2', dotClass)} />
          </span>
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">{tooltipText}</p>
      </TooltipContent>
    </Tooltip>
  );
}
