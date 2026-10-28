import type { ReactNode } from 'react';
import type { PositionDeltaMode } from '@foliobuddy/shared';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import type { Position } from '@/lib/types';
import type { CostCurrency, CostInputMode, DeltaPreview } from './positionFormMath';
import { ReduceQuantityInput } from './ReduceQuantityInput';
import { PositionAmountInput } from './PositionAmountInput';
import { PositionAssetSummary } from './PositionAssetSummary';
import { PositionCostFields } from './PositionCostFields';

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
  const { formatQuantity, maskMoney } = useMoneyFormatter();
  const formatPositionQuantity = (value: number) => formatQuantity(value, position.asset.category);
  const formatAverageCost = (value: number) =>
    maskMoney(value.toFixed(position.avgCostNative != null ? 4 : value >= 1000 ? 0 : 2));
  const isAdd = deltaMode === 'add';

  return (
    <>
      <div className="space-y-1">
        <p className="text-sm font-medium">Asset</p>
        <PositionAssetSummary asset={position.asset} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={deltaMode === 'add'}
          onClick={() => onDeltaModeChange('add')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-h-9 ${
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
          aria-pressed={deltaMode === 'reduce'}
          onClick={() => onDeltaModeChange('reduce')}
          className={`flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors sm:min-h-9 ${
            deltaMode === 'reduce'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {deltaMode === 'reduce' && <Check className="h-4 w-4" />}
          Reduce
        </button>
      </div>

      {isAdd ? (
        <PositionAmountInput
          id="additionalQuantity"
          label="Additional Quantity"
          symbol={position.asset.symbol}
          value={additionalQuantity}
          onValueChange={onAdditionalQuantityChange}
          required
          disabled={isLoading}
          footer={
            <div className="flex min-h-11 flex-wrap items-center justify-end gap-x-2 text-xs text-muted-foreground sm:min-h-9">
              <span>Current quantity:</span>
              <span className="break-all font-mono tabular-nums sm:text-sm">
                {formatPositionQuantity(position.quantity)}
              </span>
            </div>
          }
        />
      ) : (
        <ReduceQuantityInput
          position={position}
          value={additionalQuantity}
          onValueChange={onAdditionalQuantityChange}
          disabled={isLoading}
        />
      )}

      {/* Same Total/Avg pair in both modes. Add: what the extra quantity cost (required,
          moves the average). Reduce: what the sold quantity fetched (optional, never
          touches the average — it only records proceeds and feeds the cash pile). */}
      <PositionCostFields
        idPrefix="additional-"
        variant={isAdd ? 'cost' : 'proceeds'}
        costInputMode={additionalCostInputMode}
        onCostInputModeChange={onAdditionalCostInputModeChange}
        totalCost={additionalTotalCost}
        calculatedTotalCost={calculatedAdditionalTotalCost}
        onTotalCostChange={onAdditionalTotalCostChange}
        avgCostInput={additionalAvgCostInput}
        calculatedAvgCost={calculatedAdditionalAvgCost}
        onAvgCostChange={onAdditionalAvgCostChange}
        costCurrency={costCurrency}
        required={isAdd}
        disabled={isLoading}
        helperText={
          isAdd
            ? undefined
            : 'Optional: what the sale fetched. Cost basis still comes off at the current average cost; proceeds are recorded in the position history and, with a cash pile selected, deposited into it.'
        }
      />

      {fundingSlot}

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
              {formatAverageCost(preview.currentAvgCost)}
            </div>
            <div className="text-right font-mono text-muted-foreground">
              {maskMoney(preview.currentTotalCost.toFixed(0))}
            </div>

            <div className="text-[11px] font-medium uppercase tracking-wide text-primary">New</div>
            <div className="text-right font-mono font-medium text-primary">
              {formatPositionQuantity(preview.nextQuantity)}
            </div>
            <div className="text-right font-mono font-medium text-primary">
              {formatAverageCost(preview.nextAvgCost)}
            </div>
            <div className="text-right font-mono font-medium text-primary">
              {maskMoney(preview.nextTotalCost.toFixed(0))}
            </div>
          </div>
          {preview.nextQuantity === 0 && (
            <p className="mt-2 text-xs text-warning">
              Reducing to zero closes the position: it is removed from your portfolio along with its
              history.
            </p>
          )}
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
