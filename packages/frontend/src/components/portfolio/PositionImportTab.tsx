import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import type { BulkImportPosition } from '@/lib/types';
import { useMoneyFormatter } from '@/hooks/useMoneyFormatter';
import { formatTrimmedNumber } from '@/lib/utils';

interface PositionImportTabProps {
  jsonInput: string;
  parseError: string | null;
  parsedPositions: BulkImportPosition[] | null;
  importing: boolean;
  recovering?: boolean;
  isCustody?: boolean;
  custodyOf?: string;
  /** Rendered above the Import button — used to slot the custody checkbox */
  footerSlot?: React.ReactNode;
  onJsonChange: (value: string) => void;
  onPaste: () => void;
  onImport: () => void;
}

export function PositionImportTab({
  jsonInput,
  parseError,
  parsedPositions,
  importing,
  recovering = false,
  isCustody,
  custodyOf,
  footerSlot,
  onJsonChange,
  onPaste,
  onImport,
}: PositionImportTabProps) {
  const { formatPrice, formatQuantity, maskMoney, valuesHidden } = useMoneyFormatter();
  return (
    <fieldset disabled={importing} className="min-w-0 space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPaste} disabled={recovering}>
          <Upload className="h-4 w-4 mr-1" />
          Paste from Clipboard
        </Button>
      </div>

      <Textarea
        aria-label="Position JSON to import"
        aria-invalid={!!parseError}
        aria-describedby={parseError ? 'position-import-error' : undefined}
        placeholder='[{"asset": {"symbol": "BTC", ...}, "quantity": 1, ...}]'
        value={
          recovering && valuesHidden
            ? 'Import data hidden. Show monetary values to review the original JSON.'
            : jsonInput
        }
        readOnly={recovering}
        onChange={(e) => onJsonChange(e.target.value)}
        rows={6}
        className="font-mono text-base sm:text-xs"
      />

      {recovering && (
        <p role="status" className="text-sm text-muted-foreground">
          This import was interrupted. Retry the original batch to check which rows were saved. Rows
          already saved will not be added again.
        </p>
      )}

      {parseError && (
        <div
          id="position-import-error"
          role="alert"
          className="flex items-start gap-2 break-words text-destructive text-sm"
        >
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {isCustody && (
        <div className="text-xs text-info bg-info/10 px-3 py-2 rounded-md">
          Importing as custody for <span className="font-medium">{custodyOf || 'Someone'}</span>
        </div>
      )}

      {parsedPositions && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Ready to import {parsedPositions.length} position
            {parsedPositions.length !== 1 ? 's' : ''}:
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {parsedPositions.map((pos, index) => (
              <div key={index} className="text-sm bg-muted/50 px-3 py-2 rounded-md">
                <span className="font-medium">{pos.asset.symbol}</span>
                <span className="text-muted-foreground ml-2">
                  {formatQuantity(pos.quantity, pos.asset.category)} @{' '}
                  {pos.avgCostNative != null && pos.costCurrency
                    ? maskMoney(
                        `${pos.costCurrency}\u00a0${formatTrimmedNumber(pos.avgCostNative, 8)}`
                      )
                    : formatPrice(pos.avgCostUsd, 'USD')}
                </span>
                {pos.storageLocation && (
                  <span className="text-muted-foreground ml-2">({pos.storageLocation})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {footerSlot && <div className="pt-2 border-t border-border/60">{footerSlot}</div>}

      <div className="flex justify-end">
        <Button type="button" onClick={onImport} disabled={!parsedPositions?.length || importing}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Importing…
            </>
          ) : (
            <>
              {recovering
                ? 'Retry interrupted import'
                : `Import ${parsedPositions?.length ?? 0} Position${parsedPositions?.length !== 1 ? 's' : ''}`}
            </>
          )}
        </Button>
      </div>
    </fieldset>
  );
}
