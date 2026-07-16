import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
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
  showUnitTrustConversion: boolean;
  unitTrustUsdPerNative: number;
  unitTrustNativeCurrency: string;
  showNativeConversion: boolean;
  nativeUsdPerUnit: number | null;
  nativeConversionCurrency: string;
}

function formatUsdPerNative(value: number): string {
  return value < 0.01 ? value.toFixed(6) : value.toFixed(4);
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
  showUnitTrustConversion,
  unitTrustUsdPerNative,
  unitTrustNativeCurrency,
  showNativeConversion,
  nativeUsdPerUnit,
  nativeConversionCurrency,
}: PositionCostFieldsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Enter:</span>
        <label className="flex min-h-11 items-center gap-1.5 cursor-pointer sm:min-h-0">
          <input
            type="radio"
            name="costMode"
            checked={costInputMode === 'total'}
            onChange={() => onCostInputModeChange('total')}
            className="w-3.5 h-3.5 accent-primary"
          />
          <span className={costInputMode === 'total' ? 'font-medium' : 'text-muted-foreground'}>
            Total Cost
          </span>
        </label>
        <label className="flex min-h-11 items-center gap-1.5 cursor-pointer sm:min-h-0">
          <input
            type="radio"
            name="costMode"
            checked={costInputMode === 'avg'}
            onChange={() => onCostInputModeChange('avg')}
            className="w-3.5 h-3.5 accent-primary"
          />
          <span className={costInputMode === 'avg' ? 'font-medium' : 'text-muted-foreground'}>
            Avg Cost
          </span>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="totalCost" className="text-sm">
            Total Cost ({costCurrency})
          </Label>
          <FormattedNumberInput
            id="totalCost"
            value={costInputMode === 'total' ? totalCost : calculatedTotalCost}
            onValueChange={onTotalCostChange}
            placeholder="0.00"
            disabled={costInputMode !== 'total'}
            className={costInputMode !== 'total' ? 'bg-muted' : ''}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="avgCost" className="text-sm">
            Average Cost ({costCurrency})
          </Label>
          <FormattedNumberInput
            id="avgCost"
            value={costInputMode === 'avg' ? avgCostInput : calculatedAvgCost}
            onValueChange={onAvgCostChange}
            placeholder="0.00"
            disabled={costInputMode !== 'avg'}
            className={costInputMode !== 'avg' ? 'bg-muted' : ''}
          />
        </div>
      </div>

      {showUnitTrustConversion && (
        <p className="text-xs text-muted-foreground">
          Stored internally as USD ({formatUsdPerNative(unitTrustUsdPerNative)} USD per{' '}
          {unitTrustNativeCurrency}).
        </p>
      )}
      {showNativeConversion && nativeUsdPerUnit !== null && (
        <p className="text-xs text-muted-foreground">
          Stored internally as USD ({formatUsdPerNative(nativeUsdPerUnit)} USD per{' '}
          {nativeConversionCurrency}).
        </p>
      )}
    </div>
  );
}
