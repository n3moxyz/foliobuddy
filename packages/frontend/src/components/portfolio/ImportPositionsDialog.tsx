import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { BulkImportPosition } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type ImportedPosition = BulkImportPosition;

interface ImportResult {
  success: boolean;
  symbol: string;
  error?: string;
}

interface ImportPositionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImportPositionsDialog({ open, onOpenChange }: ImportPositionsDialogProps) {
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedPositions, setParsedPositions] = useState<ImportedPosition[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const queryClient = useQueryClient();

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      parseJson(text);
    } catch {
      setParseError('Failed to read clipboard. Please paste manually.');
    }
  };

  const parseJson = (text: string) => {
    setParseError(null);
    setParsedPositions(null);
    setResults(null);

    if (!text.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(text);
      const positions = Array.isArray(parsed) ? parsed : [parsed];

      // Validate structure
      for (const pos of positions) {
        if (!pos.asset?.symbol || !pos.asset?.name) {
          throw new Error('Invalid format: missing asset symbol or name');
        }
        if (typeof pos.quantity !== 'number' || pos.quantity <= 0) {
          throw new Error('Invalid format: quantity must be a positive number');
        }
        if (typeof pos.avgCostUsd !== 'number' || pos.avgCostUsd < 0) {
          throw new Error('Invalid format: avgCostUsd must be a non-negative number');
        }
      }

      setParsedPositions(positions);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedPositions) return;

    setImporting(true);

    try {
      // Use bulk import endpoint for faster processing
      const response = await api.bulkImportPositions(parsedPositions);
      setResults(response.results);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh positions data
    queryClient.invalidateQueries({ queryKey: ['positions'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio'] });
  };

  const handleClose = () => {
    setJsonInput('');
    setParseError(null);
    setParsedPositions(null);
    setResults(null);
    onOpenChange(false);
  };

  const successCount = results?.filter((r) => r.success).length ?? 0;
  const failCount = results?.filter((r) => !r.success).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Positions</DialogTitle>
          <DialogDescription>
            Paste JSON data from a copied position or positions array.
          </DialogDescription>
        </DialogHeader>

        {!results ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handlePaste}>
                <Upload className="h-4 w-4 mr-1" />
                Paste from Clipboard
              </Button>
            </div>

            <Textarea
              placeholder='[{"asset": {"symbol": "BTC", ...}, "quantity": 1, ...}]'
              value={jsonInput}
              onChange={(e) => {
                setJsonInput(e.target.value);
                parseJson(e.target.value);
              }}
              rows={8}
              className="font-mono text-xs"
            />

            {parseError && (
              <div className="flex items-start gap-2 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {parsedPositions && (
              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Ready to import {parsedPositions.length} position
                  {parsedPositions.length !== 1 ? 's' : ''}:
                </p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {parsedPositions.map((pos, i) => (
                    <div key={i} className="text-sm bg-muted/50 px-3 py-2 rounded-md">
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

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleImport} disabled={!parsedPositions || importing}>
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
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center py-4">
              {failCount === 0 ? (
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
              ) : (
                <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
              )}
              <p className="font-medium">
                {successCount} imported successfully
                {failCount > 0 && `, ${failCount} failed`}
              </p>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1">
              {results.map((result, i) => (
                <div
                  key={i}
                  className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
                    result.success
                      ? 'bg-green-50 dark:bg-green-950/30'
                      : 'bg-red-50 dark:bg-red-950/30'
                  }`}
                >
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  )}
                  <span className="font-medium">{result.symbol}</span>
                  {result.error && (
                    <span className="text-red-600 dark:text-red-400 text-xs">{result.error}</span>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
