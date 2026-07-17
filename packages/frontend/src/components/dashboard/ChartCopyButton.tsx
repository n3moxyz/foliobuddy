import { useEffect, useState, type RefObject } from 'react';
import { Check, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { copyChartAsPng } from '@/lib/chartCopy';

interface ChartCopyButtonProps {
  targetRef: RefObject<HTMLElement>;
  chartName: string;
}

export function ChartCopyButton({ targetRef, chartName }: ChartCopyButtonProps) {
  const [isCopying, setIsCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handleCopy = async () => {
    if (!targetRef.current || isCopying) return;

    setIsCopying(true);
    try {
      await copyChartAsPng(targetRef.current);
      setCopied(true);
      toast.success(`${chartName} copied as an image`);
    } catch {
      toast.error('Chart copy failed', {
        description: 'Allow clipboard access or try a browser that supports copying PNG images.',
      });
    } finally {
      setIsCopying(false);
    }
  };

  const Icon = isCopying ? Loader2 : copied ? Check : Copy;

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
            onClick={handleCopy}
            disabled={isCopying}
            aria-label={`Copy ${chartName} chart as an image`}
            data-chart-copy-exclude
          >
            <Icon className={`h-4 w-4 ${isCopying ? 'animate-spin' : ''}`} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Copy chart as image</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
