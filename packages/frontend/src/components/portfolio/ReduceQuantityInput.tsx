import { Button } from '@/components/ui/button';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { Position } from '@/lib/types';
import { PositionAmountInput } from './PositionAmountInput';
import { PositionQuantityValue } from './PositionQuantityValue';

const PERCENTAGE_STOPS = [25, 50, 75, 100];

function quantityAtPercentage(balance: number, percentage: number) {
  // The endpoint must use the original balance, including every fractional unit.
  const quantity =
    percentage === 100 ? balance : Number((balance * (percentage / 100)).toPrecision(15));
  return quantity.toLocaleString('en-US', {
    useGrouping: false,
    maximumSignificantDigits: 21,
  });
}

export function ReduceQuantityInput({
  position,
  value,
  onValueChange,
  disabled,
}: {
  position: Position;
  value: string;
  onValueChange: (value: string) => void;
  disabled: boolean;
}) {
  const { formatQuantity } = useMoneyFormatter();
  const balance = position.quantity;
  const hasBalance = Number.isFinite(balance) && balance > 0;
  const controlsDisabled = disabled || !hasBalance;
  const amount = Number(value);
  const percentage =
    hasBalance && Number.isFinite(amount)
      ? Math.min(100, Math.max(0, (amount / balance) * 100))
      : 0;
  const percentageLabel = `${Number(percentage.toFixed(2))}%`;
  const exceedsBalance = hasBalance && Number.isFinite(amount) && amount > balance;
  const selectPercentage = (next: number) => {
    if (!controlsDisabled)
      onValueChange(quantityAtPercentage(balance, Math.min(100, Math.max(0, next))));
  };

  return (
    <PositionAmountInput
      id="additionalQuantity"
      label="Reduce Quantity"
      groupLabel="Reduce quantity controls"
      symbol={position.asset.symbol}
      value={value}
      onValueChange={onValueChange}
      required
      disabled={disabled}
      aria-invalid={exceedsBalance || undefined}
      aria-describedby="reduce-quantity-status"
      balance={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-mr-2 h-auto min-h-11 max-w-full flex-wrap justify-end gap-x-1 px-2 py-1 text-xs sm:min-h-9"
          aria-label={`Reduce max ${position.asset.symbol}`}
          disabled={controlsDisabled}
          onClick={() => selectPercentage(100)}
        >
          <span className="font-normal text-muted-foreground">Balance:</span>
          <span className="break-all font-mono text-primary">
            {formatQuantity(balance, position.asset.category)} {position.asset.symbol}
          </span>
        </Button>
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <PositionQuantityValue position={position} value={value} />
          <div
            className="ml-auto flex flex-wrap justify-end"
            role="group"
            aria-label="Reduce percentage"
          >
            {PERCENTAGE_STOPS.map((stop) => (
              <Button
                key={stop}
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-11 px-2 text-xs tabular-nums text-muted-foreground aria-pressed:bg-primary/10 aria-pressed:text-[hsl(var(--primary-text))] sm:min-h-9"
                aria-label={`Reduce ${stop}%`}
                aria-pressed={
                  hasBalance &&
                  value !== '' &&
                  amount === Number(quantityAtPercentage(balance, stop))
                }
                disabled={controlsDisabled}
                onClick={() => selectPercentage(stop)}
              >
                {stop}%
              </Button>
            ))}
          </div>
        </div>
      }
    >
      <span
        id="reduce-quantity-status"
        role={exceedsBalance ? 'alert' : undefined}
        className={exceedsBalance ? 'block text-xs text-loss' : 'sr-only'}
      >
        {exceedsBalance ? 'Exceeds balance' : percentageLabel}
      </span>
    </PositionAmountInput>
  );
}
