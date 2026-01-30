import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCreateManualSnapshot, useUpdateSnapshot } from '@/hooks/useSnapshots';
import { api, Snapshot, BulkImportSnapshot } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface SnapshotFormProps {
  snapshot?: Snapshot;
  fxRate: number;
  onSuccess: () => void;
  onCancel: () => void;
}

type FormMode = 'add' | 'import';

interface ImportResult {
  success: boolean;
  timestamp: string;
  error?: string;
}

export function SnapshotForm({ snapshot, fxRate, onSuccess, onCancel }: SnapshotFormProps) {
  const isEditing = !!snapshot;
  const isAutomatic = snapshot?.source === 'AUTOMATIC';
  const queryClient = useQueryClient();

  // Form mode state
  const [mode, setMode] = useState<FormMode>('add');

  // Import state
  const [jsonInput, setJsonInput] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedSnapshots, setParsedSnapshots] = useState<BulkImportSnapshot[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

  // Add form state
  const [timestamp, setTimestamp] = useState(
    snapshot ? new Date(snapshot.timestamp).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
  );
  const [inputCurrency, setInputCurrency] = useState<'USD' | 'SGD'>('USD');
  const [totalValue, setTotalValue] = useState(
    snapshot ? snapshot.totalValueUsd.toString() : ''
  );
  const [notes, setNotes] = useState(snapshot?.notes || '');

  const createSnapshot = useCreateManualSnapshot();
  const updateSnapshot = useUpdateSnapshot();

  const isLoading = createSnapshot.isPending || updateSnapshot.isPending;

  // Convert to USD if input is in SGD
  const getValueInUsd = () => {
    const value = parseFloat(totalValue);
    if (isNaN(value)) return 0;
    return inputCurrency === 'SGD' ? value / fxRate : value;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const valueInUsd = getValueInUsd();

    if (isEditing && snapshot) {
      await updateSnapshot.mutateAsync({
        id: snapshot.id,
        data: {
          ...(isAutomatic ? {} : { timestamp }),
          totalValueUsd: valueInUsd,
          notes: notes || undefined,
        },
      });
    } else {
      await createSnapshot.mutateAsync({
        manual: true,
        timestamp,
        totalValueUsd: valueInUsd,
        notes: notes || undefined,
      });
    }

    onSuccess();
  };

  // Parse JSON input for import
  const handleJsonChange = (value: string) => {
    setJsonInput(value);
    setParseError(null);
    setParsedSnapshots(null);
    setImportResults(null);

    if (!value.trim()) return;

    try {
      const parsed = JSON.parse(value);
      const snapshots: BulkImportSnapshot[] = Array.isArray(parsed) ? parsed : [parsed];

      // Validate each snapshot
      for (const snap of snapshots) {
        if (!snap.timestamp) {
          throw new Error('Each snapshot must have a timestamp');
        }
        if (typeof snap.totalValueUsd !== 'number' || snap.totalValueUsd < 0) {
          throw new Error('Each snapshot must have a valid totalValueUsd (number >= 0)');
        }
      }

      setParsedSnapshots(snapshots);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Invalid JSON format');
    }
  };

  const handleImport = async () => {
    if (!parsedSnapshots) return;

    setImporting(true);

    try {
      const response = await api.bulkImportSnapshots(parsedSnapshots);
      setImportResults(response.results);
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Import failed - please try again');
    } finally {
      setImporting(false);
    }

    // Refresh snapshots data
    queryClient.invalidateQueries({ queryKey: ['snapshots'] });
    queryClient.invalidateQueries({ queryKey: ['portfolio', 'performance'] });
  };

  const resetImportState = () => {
    setJsonInput('');
    setParseError(null);
    setParsedSnapshots(null);
    setImportResults(null);
  };

  // Don't show mode toggle when editing
  if (isEditing) {
    return (
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Date */}
        <div className="space-y-2">
          <Label htmlFor="timestamp">Date</Label>
          <Input
            id="timestamp"
            type="date"
            value={timestamp}
            onChange={(e) => setTimestamp(e.target.value)}
            disabled={isAutomatic}
            required
          />
          {isAutomatic && (
            <p className="text-xs text-muted-foreground">
              Date cannot be changed for automatic snapshots
            </p>
          )}
        </div>

        {/* Total Value with Currency Toggle */}
        <div className="space-y-2">
          <Label htmlFor="totalValue">Total Value</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                {inputCurrency === 'USD' ? '$' : 'S$'}
              </span>
              <Input
                id="totalValue"
                type="number"
                step="any"
                value={totalValue}
                onChange={(e) => setTotalValue(e.target.value)}
                placeholder="0.00"
                className="pl-9"
                required
              />
            </div>
            <div className="flex rounded-md border overflow-hidden">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-9 px-3 rounded-none ${
                  inputCurrency === 'USD'
                    ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => setInputCurrency('USD')}
              >
                USD
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={`h-9 px-3 rounded-none border-l ${
                  inputCurrency === 'SGD'
                    ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => setInputCurrency('SGD')}
              >
                SGD
              </Button>
            </div>
          </div>
          {inputCurrency === 'SGD' && totalValue && (
            <p className="text-xs text-muted-foreground">
              ≈ ${getValueInUsd().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (rate: {fxRate.toFixed(4)})
            </p>
          )}
        </div>

        {/* Notes */}
        <div className="space-y-2">
          <Label htmlFor="notes">Notes (Optional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about this snapshot..."
            rows={2}
          />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isLoading || !totalValue}>
            {isLoading ? 'Saving...' : 'Update'}
          </Button>
        </div>
      </form>
    );
  }

  // Handle paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJsonInput(text);
      handleJsonChange(text);
    } catch {
      setParseError('Failed to read clipboard. Please paste manually.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle - Tab style to match PositionForm */}
      <div className="flex border-b mb-2">
        <button
          type="button"
          onClick={() => { setMode('add'); resetImportState(); }}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'add'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Add New
        </button>
        <button
          type="button"
          onClick={() => setMode('import')}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            mode === 'import'
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Import
        </button>
      </div>

      {mode === 'import' ? (
        /* Import Mode */
        <div className="space-y-4">
          {importResults ? (
            /* Import Results */
            <div className="space-y-4">
              <div className="text-center py-4">
                {importResults.every(r => r.success) ? (
                  <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                ) : (
                  <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-2" />
                )}
                <p className="font-medium">
                  {importResults.filter(r => r.success).length} imported successfully
                  {importResults.some(r => !r.success) && `, ${importResults.filter(r => !r.success).length} failed`}
                </p>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1">
                {importResults.map((r, i) => (
                  <div
                    key={i}
                    className={`text-sm px-3 py-2 rounded-md flex items-center gap-2 ${
                      r.success ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'
                    }`}
                  >
                    {r.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                    )}
                    <span className="font-medium">{r.timestamp}</span>
                    {r.error && (
                      <span className="text-red-600 dark:text-red-400 text-xs">
                        {r.error}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={onSuccess}>Done</Button>
              </div>
            </div>
          ) : (
            /* Import Input */
            <div className="space-y-4">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handlePaste}>
                  <Upload className="h-4 w-4 mr-1" />
                  Paste from Clipboard
                </Button>
              </div>

              <Textarea
                value={jsonInput}
                onChange={(e) => handleJsonChange(e.target.value)}
                placeholder='[{"timestamp": "2026-01-01", "totalValueUsd": 100000}, ...]'
                rows={6}
                className="font-mono text-xs"
              />

              {parseError && (
                <div className="flex items-start gap-2 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{parseError}</span>
                </div>
              )}

              {parsedSnapshots && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    Ready to import {parsedSnapshots.length} snapshot{parsedSnapshots.length !== 1 ? 's' : ''}:
                  </p>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {parsedSnapshots.map((snap, i) => (
                      <div key={i} className="text-sm bg-muted/50 px-3 py-2 rounded-md">
                        <span className="font-medium">{snap.timestamp}</span>
                        <span className="text-muted-foreground ml-2">
                          ${snap.totalValueUsd.toLocaleString()}
                        </span>
                        {snap.notes && (
                          <span className="text-muted-foreground ml-2">
                            ({snap.notes})
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleImport}
                  disabled={!parsedSnapshots || importing}
                >
                  {importing ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>Import {parsedSnapshots?.length ?? 0} Snapshot{parsedSnapshots?.length !== 1 ? 's' : ''}</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Add New Mode */
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="timestamp">Date</Label>
            <Input
              id="timestamp"
              type="date"
              value={timestamp}
              onChange={(e) => setTimestamp(e.target.value)}
              required
            />
          </div>

          {/* Total Value with Currency Toggle */}
          <div className="space-y-2">
            <Label htmlFor="totalValue">Total Value</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {inputCurrency === 'USD' ? '$' : 'S$'}
                </span>
                <Input
                  id="totalValue"
                  type="number"
                  step="any"
                  value={totalValue}
                  onChange={(e) => setTotalValue(e.target.value)}
                  placeholder="0.00"
                  className="pl-9"
                  required
                />
              </div>
              <div className="flex rounded-md border overflow-hidden">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 px-3 rounded-none ${
                    inputCurrency === 'USD'
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setInputCurrency('USD')}
                >
                  USD
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-9 px-3 rounded-none border-l ${
                    inputCurrency === 'SGD'
                      ? 'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setInputCurrency('SGD')}
                >
                  SGD
                </Button>
              </div>
            </div>
            {inputCurrency === 'SGD' && totalValue && (
              <p className="text-xs text-muted-foreground">
                ≈ ${getValueInUsd().toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD (rate: {fxRate.toFixed(4)})
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes about this snapshot..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !totalValue}>
              {isLoading ? 'Saving...' : 'Add Snapshot'}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
