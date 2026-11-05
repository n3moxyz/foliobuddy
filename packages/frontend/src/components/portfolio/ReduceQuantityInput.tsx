import { useEffect, useRef, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { QueryErrorNotice } from '@/components/ui/QueryErrorNotice';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { Position } from '@/lib/types';
import { PositionAmountInput } from './PositionAmountInput';
import { PositionQuantityValue } from './PositionQuantityValue';
import { ReducePresetEditor } from './ReducePresetEditor';
import { useReducePercentages } from '@/hooks/useReducePercentages';

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
  const { percentages, hasLoaded, canEdit, save, loadError, retry } = useReducePercentages();
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  const closeEditor = () => {
    returnFocus.current = true;
    setEditing(false);
  };
  useEffect(() => {
    if (!editing && canEdit && returnFocus.current) {
      editButton.current?.focus();
      returnFocus.current = false;
    }
  }, [editing, canEdit]);
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
            {percentages.map((stop) => (
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
                disabled={controlsDisabled || !hasLoaded}
                onClick={() => selectPercentage(stop)}
              >
                {stop}%
              </Button>
            ))}
            <Button
              ref={editButton}
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground sm:h-9 sm:w-9"
              aria-label="Edit Reduce Percentages"
              aria-expanded={editing}
              disabled={disabled || !canEdit}
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      }
    >
      {loadError && <QueryErrorNotice subject="reduce percentages" onRetry={retry} />}
      {editing && (
        <ReducePresetEditor
          percentages={percentages}
          onCancel={closeEditor}
          onSave={async (values) => {
            await save(values);
            closeEditor();
          }}
        />
      )}
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
