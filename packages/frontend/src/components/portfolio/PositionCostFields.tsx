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
  showSgdConversion: boolean;
  fxSgdPerUsd: number;
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
  showSgdConversion,
  fxSgdPerUsd,
}: PositionCostFieldsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">Enter:</span>
        <label className="flex items-center gap-1.5 cursor-pointer">
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
        <label className="flex items-center gap-1.5 cursor-pointer">
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
          Stored internally as USD ({unitTrustUsdPerNative.toFixed(4)} USD per{' '}
          {unitTrustNativeCurrency}).
        </p>
      )}
      {showSgdConversion && (
        <p className="text-xs text-muted-foreground">
          Stored internally as USD ({(1 / fxSgdPerUsd).toFixed(4)} USD per SGD).
        </p>
      )}
    </div>
  );
}
