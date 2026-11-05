import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { Position } from '@/lib/types';

export function PositionQuantityValue({ position, value }: { position: Position; value: string }) {
  const { formatCurrency } = useMoneyFormatter();
  const price = position.asset.currentPriceUsd;
  const quantity = Number(value);
  const estimate = price != null ? quantity * price : Number.NaN;

  return (
    <span
      className="font-mono text-sm tabular-nums text-muted-foreground"
      aria-label="Estimated value in USD"
    >
      {value !== '' && quantity >= 0 && price != null && price >= 0 && Number.isFinite(estimate)
        ? formatCurrency(estimate, 'USD', 2)
        : '—'}
    </span>
  );
}
