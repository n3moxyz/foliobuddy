import type { CSSProperties, KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { Position } from '@/lib/types';

const PERCENTAGE_STOPS = [0, 25, 50, 75, 100];

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
  const handleSliderKey = (event: KeyboardEvent<HTMLInputElement>) => {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowDown: -1,
      ArrowRight: 1,
      ArrowUp: 1,
      PageDown: -10,
      PageUp: 10,
    };
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 100
          : steps[event.key] !== undefined
            ? percentage + steps[event.key]
            : null;
    if (next !== null) {
      event.preventDefault();
      selectPercentage(next);
    }
  };

  return (
    <div className="space-y-2">
      <Label htmlFor="additionalQuantity" className="text-sm">
        Reduce Quantity
      </Label>
      <div
        role="group"
        aria-label="Reduce quantity controls"
        className="rounded-xl border border-border/80 bg-muted/20 px-4 pb-3 pt-2"
      >
        <div className="flex items-center gap-3">
          <FormattedNumberInput
            id="additionalQuantity"
            value={value}
            onValueChange={onValueChange}
            placeholder="0.00"
            required
            disabled={disabled}
            aria-invalid={exceedsBalance || undefined}
            aria-describedby="reduce-quantity-status"
            className="h-16 flex-1 border-0 bg-transparent px-0 font-mono text-2xl font-medium tabular-nums focus-visible:ring-offset-0 sm:h-20 sm:text-3xl"
          />
          <span className="max-w-[40%] shrink-0 break-all rounded-full bg-muted px-3 py-2 text-sm font-semibold">
            {position.asset.symbol}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span
            key={exceedsBalance ? 'balance-error' : 'percentage'}
            id="reduce-quantity-status"
            role={exceedsBalance ? 'alert' : undefined}
            className={`text-xs tabular-nums ${exceedsBalance ? 'text-loss' : 'text-muted-foreground'}`}
          >
            {exceedsBalance ? 'Exceeds balance' : percentageLabel}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="-mr-2 h-auto min-h-11 max-w-full flex-wrap justify-end gap-x-2 px-2 py-1 sm:min-h-9"
            aria-label={`Reduce max ${position.asset.symbol}`}
            disabled={controlsDisabled}
            onClick={() => selectPercentage(100)}
          >
            <span className="text-xs font-normal text-muted-foreground">Balance:</span>
            <span className="break-all font-mono text-xs text-muted-foreground sm:text-sm">
              {formatQuantity(balance, position.asset.category)}
            </span>
            <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              MAX
            </span>
          </Button>
        </div>

        <div className="relative">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between"
          >
            {PERCENTAGE_STOPS.map((stop) => (
              <span
                key={stop}
                className={`h-2 w-2 rounded-full ${stop <= percentage ? 'bg-primary' : 'bg-muted-foreground'}`}
              />
            ))}
          </div>
          <input
            type="range"
            aria-label="Percentage to reduce"
            aria-valuetext={`${percentageLabel} of balance`}
            min={0}
            max={100}
            step="any"
            value={percentage}
            disabled={controlsDisabled}
            onChange={(event) => selectPercentage(Math.round(Number(event.target.value)))}
            onKeyDown={handleSliderKey}
            className="reduce-amount-range relative block h-11 w-full cursor-pointer rounded-sm bg-transparent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40"
            style={{ '--reduce-percentage': `${percentage}%` } as CSSProperties}
          />
        </div>
        <div
          aria-hidden="true"
          className="flex justify-between px-1 text-[10px] tabular-nums text-muted-foreground"
        >
          {PERCENTAGE_STOPS.map((stop) => (
            <span key={stop}>{stop}%</span>
          ))}
        </div>
      </div>
    </div>
  );
}
