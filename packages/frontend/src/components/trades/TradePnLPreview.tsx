import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { isOptionalNonNegativeNumberInput, isPositiveNumberInput } from '@/lib/formValidation';
import { cn, formatPercent } from '@/lib/utils';

interface TradePnLPreviewProps {
  direction: 'LONG' | 'SHORT';
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  fundingCost: string;
}

export function TradePnLPreview({
  direction,
  entryPrice,
  exitPrice,
  quantity,
  fundingCost,
}: TradePnLPreviewProps) {
  const { formatSignedCurrency } = useMoneyFormatter();
  let preview: { pnl: number; pnlPct: number } | null = null;
  const funding = Number(fundingCost.replace(/,/g, ''));

  if (
    isPositiveNumberInput(entryPrice) &&
    isPositiveNumberInput(exitPrice) &&
    isPositiveNumberInput(quantity) &&
    isOptionalNonNegativeNumberInput(fundingCost)
  ) {
    const entry = Number(entryPrice.replace(/,/g, ''));
    const exit = Number(exitPrice.replace(/,/g, ''));
    const units = Number(quantity.replace(/,/g, ''));
    const entryValue = entry * units;
    // Match the stored trade result: directional price P&L minus USD funding cost.
    const pricePnL = (direction === 'LONG' ? exit - entry : entry - exit) * units;
    const pnl = pricePnL - funding;
    const pnlPct = (pnl / entryValue) * 100;
    if (entryValue > 0 && [entryValue, pricePnL, pnl, pnlPct].every(Number.isFinite)) {
      preview = { pnl, pnlPct };
    }
  }

  const tone = !preview || preview.pnl === 0 ? 'neutral' : preview.pnl > 0 ? 'profit' : 'loss';
  const resultClass =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : 'text-muted-foreground';

  return (
    <div
      role="status"
      aria-label="Trade P&L preview"
      aria-live="polite"
      aria-atomic="true"
      className="flex min-h-6 flex-wrap items-baseline gap-x-3 gap-y-1"
    >
      <span className="text-sm font-medium text-muted-foreground">Net P&amp;L:</span>{' '}
      <span
        className={cn(
          'min-w-0 break-all font-mono text-xl font-semibold tracking-tight tabular-nums',
          resultClass
        )}
      >
        {preview ? formatSignedCurrency(preview.pnl, 'USD', 2) : '—'}
      </span>{' '}
      {preview && (
        <span className={cn('font-mono text-sm tabular-nums', resultClass)}>
          {formatPercent(preview.pnlPct)}
        </span>
      )}
    </div>
  );
}
