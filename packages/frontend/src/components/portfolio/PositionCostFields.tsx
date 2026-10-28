import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
import { currencyDecimals, priceDecimals } from '@/lib/utils';
import type { CostCurrency, CostInputMode } from './positionFormMath';

interface PositionCostFieldsProps {
  costInputMode: CostInputMode;
  onCostInputModeChange: (mode: CostInputMode) => void;
  totalCost: string;
  calculatedTotalCost: string;
  onTotalCostChange: (value: string) => void;
  avgCostInput: string;
  calculatedAvgCost: string;
  onAvgCostChange: (value: string) => void;
  costCurrency: CostCurrency;
  variant?: 'cost' | 'proceeds';
  idPrefix?: string;
  required?: boolean;
  disabled?: boolean;
  helperText?: string;
  showUnitTrustConversion?: boolean;
  unitTrustUsdPerNative?: number;
  unitTrustNativeCurrency?: string;
  showNativeConversion?: boolean;
  nativeUsdPerUnit?: number | null;
  nativeConversionCurrency?: string;
}

function formatUsdPerNative(value: number): string {
  return value < 0.01 ? value.toFixed(6) : value.toFixed(4);
}

function formatDerivedCost(value: string, currency: CostCurrency, perUnit = false): string {
  const amount = Number(value);
  if (value.trim() === '' || !Number.isFinite(amount)) return value;
  return amount.toFixed(perUnit ? priceDecimals(amount, currency) : currencyDecimals(currency));
}

export function PositionCostFields({
  costInputMode,
  onCostInputModeChange,
  totalCost,
  calculatedTotalCost,
  onTotalCostChange,
  avgCostInput,
  calculatedAvgCost,
  onAvgCostChange,
  costCurrency,
  variant = 'cost',
  idPrefix = '',
  required = false,
  disabled = false,
  helperText,
  showUnitTrustConversion,
  unitTrustUsdPerNative,
  unitTrustNativeCurrency,
  showNativeConversion,
  nativeUsdPerUnit,
  nativeConversionCurrency,
}: PositionCostFieldsProps) {
  const isProceeds = variant === 'proceeds';
  const totalLabel = isProceeds ? 'Total Proceeds' : 'Total Cost';
  const averageLabel = isProceeds ? 'Avg Price' : 'Average Cost';
  const totalId = `${idPrefix}totalCost`;
  const averageId = `${idPrefix}avgCost`;
  const hintId = helperText ? `${idPrefix}amountHint` : undefined;
  return (
    <div className="space-y-2">
      <div className="space-y-2 rounded-xl border border-border/80 bg-muted/20 p-3">
        <div className="flex flex-wrap items-center gap-x-4 text-sm">
          <span className="text-muted-foreground">Enter:</span>
          <label className="flex min-h-11 items-center gap-1.5 cursor-pointer sm:min-h-0">
            <input
              type="radio"
              name={`${idPrefix}costMode`}
              checked={costInputMode === 'total'}
              onChange={() => onCostInputModeChange('total')}
              disabled={disabled}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span className={costInputMode === 'total' ? 'font-medium' : 'text-muted-foreground'}>
              {totalLabel}
            </span>
          </label>
          <label className="flex min-h-11 items-center gap-1.5 cursor-pointer sm:min-h-0">
            <input
              type="radio"
              name={`${idPrefix}costMode`}
              checked={costInputMode === 'avg'}
              onChange={() => onCostInputModeChange('avg')}
              disabled={disabled}
              className="w-3.5 h-3.5 accent-primary"
            />
            <span className={costInputMode === 'avg' ? 'font-medium' : 'text-muted-foreground'}>
              {isProceeds ? 'Avg Price' : 'Avg Cost'}
            </span>
          </label>
        </div>

        <div className="grid grid-cols-2 items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor={totalId} className="text-sm">
              {totalLabel} ({costCurrency})
            </Label>
            <FormattedNumberInput
              id={totalId}
              value={
                costInputMode === 'total'
                  ? totalCost
                  : formatDerivedCost(calculatedTotalCost, costCurrency)
              }
              onValueChange={onTotalCostChange}
              placeholder="0.00"
              disabled={disabled || costInputMode !== 'total'}
              className={`font-mono tabular-nums ${costInputMode !== 'total' ? 'bg-muted/50' : 'bg-background/50'}`}
              aria-describedby={hintId}
              required={required}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={averageId} className="text-sm">
              {averageLabel} ({costCurrency})
            </Label>
            <FormattedNumberInput
              id={averageId}
              value={
                costInputMode === 'avg'
                  ? avgCostInput
                  : formatDerivedCost(calculatedAvgCost, costCurrency, true)
              }
              onValueChange={onAvgCostChange}
              placeholder="0.00"
              disabled={disabled || costInputMode !== 'avg'}
              className={`font-mono tabular-nums ${costInputMode !== 'avg' ? 'bg-muted/50' : 'bg-background/50'}`}
              aria-describedby={hintId}
              required={required}
            />
          </div>
        </div>
      </div>

      {helperText && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {helperText}
        </p>
      )}

      {showUnitTrustConversion && unitTrustUsdPerNative !== undefined && (
        <p className="text-xs text-muted-foreground">
          USD equivalent uses {formatUsdPerNative(unitTrustUsdPerNative)} USD per{' '}
          {unitTrustNativeCurrency} at current FX.
        </p>
      )}
      {showNativeConversion && nativeUsdPerUnit != null && (
        <p className="text-xs text-muted-foreground">
          USD equivalent uses {formatUsdPerNative(nativeUsdPerUnit)} USD per{' '}
          {nativeConversionCurrency} at current FX.
        </p>
      )}
    </div>
  );
}
