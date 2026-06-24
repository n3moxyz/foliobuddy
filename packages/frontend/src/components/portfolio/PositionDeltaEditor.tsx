import type { ReactNode } from 'react';
import type { PositionDeltaMode } from '@foliobuddy/shared';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FormattedNumberInput } from '@/components/ui/formatted-number-input';
import { Label } from '@/components/ui/label';
import { formatQuantity } from '@/lib/utils';
import type { Position } from '@/lib/types';
import type { CostCurrency, CostInputMode, DeltaPreview } from './positionFormMath';

interface PositionDeltaEditorProps {
  position: Position;
  deltaMode: PositionDeltaMode;
  onDeltaModeChange: (mode: PositionDeltaMode) => void;
  additionalQuantity: string;
  onAdditionalQuantityChange: (value: string) => void;
  additionalCostInputMode: CostInputMode;
  onAdditionalCostInputModeChange: (mode: CostInputMode) => void;
  additionalTotalCost: string;
  calculatedAdditionalTotalCost: string;
  onAdditionalTotalCostChange: (value: string) => void;
  additionalAvgCostInput: string;
  calculatedAdditionalAvgCost: string;
  onAdditionalAvgCostChange: (value: string) => void;
  costCurrency: CostCurrency;
  preview: DeltaPreview | null;
  error: string | null;
  validationError: string | null;
  fundingSlot?: ReactNode;
  custodySlot: ReactNode;
  isLoading: boolean;
  canSubmit: boolean;
}

export function PositionDeltaEditor({
  position,
  deltaMode,
  onDeltaModeChange,
  additionalQuantity,
  onAdditionalQuantityChange,
  additionalCostInputMode,
  onAdditionalCostInputModeChange,
  additionalTotalCost,
  calculatedAdditionalTotalCost,
  onAdditionalTotalCostChange,
  additionalAvgCostInput,
  calculatedAdditionalAvgCost,
  onAdditionalAvgCostChange,
  costCurrency,
  preview,
  error,
  validationError,
  fundingSlot,
  custodySlot,
  isLoading,
  canSubmit,
}: PositionDeltaEditorProps) {
  const formatPositionQuantity = (value: number) => formatQuantity(value, position.asset.category);

  return (
    <>
      <div className="rounded-md border bg-muted/30 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{position.asset.symbol}</p>
            <p className="text-sm text-muted-foreground">{position.asset.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Current quantity</p>
            <p className="font-mono text-sm">{formatPositionQuantity(position.quantity)}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onDeltaModeChange('add')}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            deltaMode === 'add'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {deltaMode === 'add' && <Check className="h-4 w-4" />}
          Add
        </button>
        <button
          type="button"
          onClick={() => onDeltaModeChange('reduce')}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
            deltaMode === 'reduce'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {deltaMode === 'reduce' && <Check className="h-4 w-4" />}
          Reduce
        </button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="additionalQuantity" className="text-sm">
          {deltaMode === 'add' ? 'Additional Quantity' : 'Reduce Quantity'}
        </Label>
        <FormattedNumberInput
          id="additionalQuantity"
          value={additionalQuantity}
          onValueChange={onAdditionalQuantityChange}
          placeholder="0.00"
          required
        />
      </div>

      {deltaMode === 'add' ? (
        <div className="space-y-2">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted-foreground">Enter:</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="additionalCostMode"
                checked={additionalCostInputMode === 'total'}
                onChange={() => onAdditionalCostInputModeChange('total')}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span
                className={
                  additionalCostInputMode === 'total' ? 'font-medium' : 'text-muted-foreground'
                }
              >
                Total Cost
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="additionalCostMode"
                checked={additionalCostInputMode === 'avg'}
                onChange={() => onAdditionalCostInputModeChange('avg')}
                className="w-3.5 h-3.5 accent-primary"
              />
              <span
                className={
                  additionalCostInputMode === 'avg' ? 'font-medium' : 'text-muted-foreground'
                }
              >
                Avg Cost
              </span>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="additionalTotalCost" className="text-sm">
                Total Cost ({costCurrency})
              </Label>
              <FormattedNumberInput
                id="additionalTotalCost"
                value={
                  additionalCostInputMode === 'total'
                    ? additionalTotalCost
                    : calculatedAdditionalTotalCost
                }
                onValueChange={onAdditionalTotalCostChange}
                placeholder="0.00"
                disabled={additionalCostInputMode !== 'total'}
                className={additionalCostInputMode !== 'total' ? 'bg-muted' : ''}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="additionalAvgCost" className="text-sm">
                Average Cost ({costCurrency})
              </Label>
              <FormattedNumberInput
                id="additionalAvgCost"
                value={
                  additionalCostInputMode === 'avg'
                    ? additionalAvgCostInput
                    : calculatedAdditionalAvgCost
                }
                onValueChange={onAdditionalAvgCostChange}
                placeholder="0.00"
                disabled={additionalCostInputMode !== 'avg'}
                className={additionalCostInputMode !== 'avg' ? 'bg-muted' : ''}
                required
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
          Cost basis will be reduced automatically using the current average cost.
        </div>
      )}

      {deltaMode === 'add' && fundingSlot}

      {preview && (
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="grid grid-cols-[64px_1fr_1fr_1fr] gap-x-4 gap-y-2 text-sm">
            <div />
            <div className="text-right text-xs text-muted-foreground">Quantity</div>
            <div className="text-right text-xs text-muted-foreground">Avg Cost</div>
            <div className="text-right text-xs text-muted-foreground">Total Cost</div>

            <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Old
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {formatPositionQuantity(preview.currentQuantity)}
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {preview.currentAvgCost.toFixed(preview.currentAvgCost >= 1000 ? 0 : 2)}
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {preview.currentTotalCost.toFixed(0)}
            </div>

            <div className="text-[11px] font-medium uppercase tracking-wide text-primary">New</div>
            <div className="text-right font-mono font-medium text-primary">
              {formatPositionQuantity(preview.nextQuantity)}
            </div>
            <div className="text-right font-mono font-medium text-primary">
              {preview.nextAvgCost.toFixed(preview.nextAvgCost >= 1000 ? 0 : 2)}
            </div>
            <div className="text-right font-mono font-medium text-primary">
              {preview.nextTotalCost.toFixed(0)}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div role="alert" className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
          {error}
        </div>
      )}

      {validationError && (
        <div role="alert" className="text-sm text-warning bg-warning/10 p-2 rounded-md">
          {validationError}
        </div>
      )}

      <div className="pt-3 border-t border-border/60">{custodySlot}</div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isLoading || !canSubmit}>
          {isLoading ? 'Saving...' : deltaMode === 'add' ? 'Add to Position' : 'Reduce Position'}
        </Button>
      </div>
    </>
  );
}
