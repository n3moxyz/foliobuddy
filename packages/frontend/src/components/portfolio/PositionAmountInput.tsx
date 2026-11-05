import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';

interface PositionAmountInputProps extends Omit<
  ComponentPropsWithoutRef<typeof FormattedNumberInput>,
  'id' | 'className'
> {
  id: string;
  label: string;
  symbol?: string;
  groupLabel?: string;
  balance?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export function PositionAmountInput({
  id,
  label,
  symbol,
  groupLabel,
  balance,
  footer,
  children,
  ...inputProps
}: PositionAmountInputProps) {
  return (
    <div className="space-y-2">
      {!balance && (
        <Label htmlFor={id} className="text-sm">
          {label}
        </Label>
      )}
      <div
        role="group"
        aria-label={groupLabel ?? `${label} controls`}
        className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3"
      >
        {balance && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <Label htmlFor={id} className="text-sm">
              {label}
            </Label>
            {balance}
          </div>
        )}
        <div className="flex items-center gap-3">
          <FormattedNumberInput
            {...inputProps}
            id={id}
            placeholder="0.00"
            className="min-w-0 flex-1 bg-background/50 font-mono tabular-nums"
          />
          {symbol && (
            <span className="max-w-[40%] shrink-0 break-all rounded-xl border border-border/80 bg-muted px-3 py-2 text-sm font-semibold">
              {symbol}
            </span>
          )}
        </div>
        {footer}
        {children}
      </div>
    </div>
  );
}
