import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Upload, AlertCircle, Loader2 } from 'lucide-react';
import type { BulkImportPosition } from '@/lib/types';

interface PositionImportTabProps {
  jsonInput: string;
  parseError: string | null;
  parsedPositions: BulkImportPosition[] | null;
  importing: boolean;
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
  isCustody,
  custodyOf,
  footerSlot,
  onJsonChange,
  onPaste,
  onImport,
}: PositionImportTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onPaste}>
          <Upload className="h-4 w-4 mr-1" />
          Paste from Clipboard
        </Button>
      </div>

      <Textarea
        placeholder='[{"asset": {"symbol": "BTC", ...}, "quantity": 1, ...}]'
        value={jsonInput}
        onChange={(e) => onJsonChange(e.target.value)}
        rows={6}
        className="font-mono text-xs"
      />

      {parseError && (
        <div className="flex items-start gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {isCustody && (
        <div className="text-xs text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 px-3 py-2 rounded-md">
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
            {parsedPositions.map((pos) => (
              <div
                key={`${pos.asset.symbol}-${pos.quantity}-${pos.avgCostUsd}-${pos.storageType}-${pos.storageLocation ?? ''}-${pos.custodyOf ?? ''}`}
                className="text-sm bg-muted/50 px-3 py-2 rounded-md"
              >
                <span className="font-medium">{pos.asset.symbol}</span>
                <span className="text-muted-foreground ml-2">
                  {pos.quantity} @ ${pos.avgCostUsd.toLocaleString()}
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
        <Button type="button" onClick={onImport} disabled={!parsedPositions || importing}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              Import {parsedPositions?.length ?? 0} Position
              {parsedPositions?.length !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
