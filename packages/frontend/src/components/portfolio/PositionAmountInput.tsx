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
  footer?: ReactNode;
  children?: ReactNode;
}

export function PositionAmountInput({
  id,
  label,
  symbol,
  groupLabel,
  footer,
  children,
  ...inputProps
}: PositionAmountInputProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-sm">
        {label}
      </Label>
      <div
        role="group"
        aria-label={groupLabel ?? `${label} controls`}
        className="rounded-xl border border-border/80 bg-muted/20 px-4 pb-3 pt-2"
      >
        <div className="flex items-center gap-3">
          <FormattedNumberInput
            {...inputProps}
            id={id}
            placeholder="0.00"
            className="h-16 min-w-0 flex-1 border-0 bg-transparent px-0 font-mono text-2xl font-medium tabular-nums focus-visible:ring-offset-0 sm:h-20 sm:text-3xl"
          />
          {symbol && (
            <span className="max-w-[40%] shrink-0 break-all rounded-full bg-muted px-3 py-2 text-sm font-semibold">
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
