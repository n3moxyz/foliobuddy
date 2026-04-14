import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { BulkImportTrade } from '@/lib/types';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface ImportResult {
  success: boolean;
  symbol: string;
  error?: string;
}

interface TradeImportTabProps {
  onSuccess: () => void;
}

export function TradeImportTab({ onSuccess }: TradeImportTabProps) {
  const queryClient = useQueryClient();

  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedTrades, setParsedTrades] = useState<BulkImportTrade[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

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
    setParsedTrades(null);
    setImportResults(null);

    if (!text.trim()) return;

    try {
      const parsed = JSON.parse(text);
      const trades: BulkImportTrade[] = Array.isArray(parsed) ? parsed : [parsed];

      // Validate structure
      for (const t of trades) {
        if (!t.asset?.symbol || !t.asset?.name) {
          throw new Error('Invalid format: missing asset symbol or name');
        }
        if (typeof t.entryPrice !== 'number' || t.entryPrice <= 0) {
          throw new Error('Invalid format: entryPrice must be a positive number');
        }
        if (typeof t.quantity !== 'number' || t.quantity <= 0) {
          throw new Error('Invalid format: quantity must be a positive number');
        }
        if (!t.direction || !['LONG', 'SHORT'].includes(t.direction)) {
          throw new Error('Invalid format: direction must be LONG or SHORT');
        }
        if (!t.entryDate) {
          throw new Error('Invalid format: entryDate is required');
        }
      }

      setParsedTrades(trades);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedTrades) return;

    setImporting(true);

    try {
      const response = await api.bulkImportTrades(parsedTrades);
      setImportResults(response.results);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh trades data
    queryClient.invalidateQueries({ queryKey: ['trades'] });
  };

  const successCount = importResults?.filter((r) => r.success).length ?? 0;
  const failCount = importResults?.filter((r) => !r.success).length ?? 0;

  // If showing import results, show the results UI
  if (importResults) {
    return (
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
          {importResults.map((result, i) => (
            <div
              key={i}
              className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
                result.success ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
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

        <div className="flex justify-end">
          <Button onClick={onSuccess}>Done</Button>
        </div>
      </div>
    );
  }

  // Import mode UI
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={handlePaste}>
          <Upload className="h-4 w-4 mr-1" />
          Paste from Clipboard
        </Button>
      </div>

      <Textarea
        placeholder='[{"asset": {"symbol": "BTC", "name": "Bitcoin", "category": "LIQUID_CRYPTO"}, "direction": "LONG", "entryPrice": 50000, "quantity": 0.5, "entryDate": "2026-01-15"}, ...]'
        value={jsonInput}
        onChange={(e) => {
          setJsonInput(e.target.value);
          parseJson(e.target.value);
        }}
        rows={6}
        className="font-mono text-xs"
      />

      {parseError && (
        <div className="flex items-start gap-2 text-destructive text-sm">
          <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{parseError}</span>
        </div>
      )}

      {parsedTrades && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            Ready to import {parsedTrades.length} trade{parsedTrades.length !== 1 ? 's' : ''}:
          </p>
          <div className="max-h-40 overflow-y-auto space-y-1">
            {parsedTrades.map((t, i) => (
              <div key={i} className="text-sm bg-muted/50 px-3 py-2 rounded-md">
                <span
                  className={`font-medium ${t.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}
                >
                  {t.direction}
                </span>
                <span className="font-medium ml-2">{t.asset.symbol}</span>
                <span className="text-muted-foreground ml-2">
                  {t.quantity} @ ${t.entryPrice.toLocaleString()}
                </span>
                {t.exitPrice && (
                  <span className="text-muted-foreground ml-1">
                    → ${t.exitPrice.toLocaleString()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" onClick={handleImport} disabled={!parsedTrades || importing}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Importing...
            </>
          ) : (
            <>
              Import {parsedTrades?.length ?? 0} Trade{parsedTrades?.length !== 1 ? 's' : ''}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
